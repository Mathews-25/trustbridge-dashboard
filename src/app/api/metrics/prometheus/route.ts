import { NextRequest, NextResponse } from "next/server";

import { requireOperator } from "@/lib/api-auth";
import { getHorizonCircuitBreakerMetrics } from "@/lib/horizon";
import { getRateLimitMetrics } from "@/lib/rate-limit";
import { getContributors } from "@/lib/registrations";
import { buildStalenessSummary } from "@/lib/stale-export";
import { summarizeContributors } from "@/lib/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PrometheusMetric {
  name: string;
  help: string;
  type: "gauge" | "counter" | "histogram";
  samples: Array<{
    labels?: Record<string, string>;
    value: number;
  }>;
}

function sanitizeLabel(value: string): string {
  return value.replace(/[^a-zA-Z0-9_:.-]/g, "_");
}

function formatPrometheus(metrics: PrometheusMetric[]): string {
  const lines: string[] = [];

  for (const metric of metrics) {
    lines.push(`# HELP ${metric.name} ${metric.help}`);
    lines.push(`# TYPE ${metric.name} ${metric.type}`);

    for (const sample of metric.samples) {
      const labelParts: string[] = [];
      if (sample.labels) {
        for (const [k, v] of Object.entries(sample.labels)) {
          labelParts.push(`${k}="${sanitizeLabel(v).replace(/"/g, '\\"')}"`);
        }
      }
      const labelStr = labelParts.length > 0 ? `{${labelParts.join(",")}}` : "";
      lines.push(`${metric.name}${labelStr} ${sample.value}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function getBearerToken(request: NextRequest): string | null {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return null;
  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) return null;
  return token;
}

function isScraperAllowlisted(bearerToken: string | null): boolean {
  if (!bearerToken) return false;
  const allowlistRaw = process.env.PROMETHEUS_SCRAPE_TOKENS;
  if (!allowlistRaw) return false;
  const tokens = allowlistRaw.split(",").map((t) => t.trim()).filter(Boolean);
  return tokens.some((t) => t.length > 0 && t === bearerToken);
}

export async function GET(request: NextRequest) {
  const bearerToken = getBearerToken(request);
  const allowlisted = isScraperAllowlisted(bearerToken);

  if (!allowlisted) {
    const session = await requireOperator("metrics.prometheus.read");
    if (!session) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const circuitBreaker = getHorizonCircuitBreakerMetrics();
  const rateLimit = getRateLimitMetrics();
  const { contributors } = await getContributors();
  const readiness = summarizeContributors(contributors);
  const staleness = buildStalenessSummary(contributors);

  const cbStateValue =
    circuitBreaker.state === "CLOSED" ? 0 : circuitBreaker.state === "HALF_OPEN" ? 1 : 2;

  const byStatusCounts = {
    ready: contributors.filter((c) => c.readiness === "ready").length,
    low_reserve: contributors.filter((c) => c.readiness === "low_reserve").length,
    not_ready: contributors.filter((c) => c.readiness === "not_ready").length,
  };

  const metrics: PrometheusMetric[] = [
    {
      name: "trustbridge_contributors_total",
      help: "Total registered contributors",
      type: "gauge",
      samples: [{ value: readiness.totalContributors }],
    },
    {
      name: "trustbridge_contributors_ready",
      help: "Contributors with Ready payout status",
      type: "gauge",
      samples: [{ value: byStatusCounts.ready }],
    },
    {
      name: "trustbridge_contributors_low_reserve",
      help: "Contributors with Low Reserve payout status",
      type: "gauge",
      samples: [{ value: byStatusCounts.low_reserve }],
    },
    {
      name: "trustbridge_contributors_not_ready",
      help: "Contributors with Not Ready payout status",
      type: "gauge",
      samples: [{ value: byStatusCounts.not_ready }],
    },
    {
      name: "trustbridge_circuit_breaker_state",
      help: "Horizon circuit breaker state: 0=CLOSED 1=HALF_OPEN 2=OPEN",
      type: "gauge",
      samples: [{ value: cbStateValue }],
    },
    {
      name: "trustbridge_circuit_breaker_total_trips",
      help: "Total times the circuit breaker has tripped since process start",
      type: "counter",
      samples: [{ value: circuitBreaker.totalTrips }],
    },
    {
      name: "trustbridge_circuit_breaker_failure_count",
      help: "Current consecutive failure count in circuit breaker",
      type: "gauge",
      samples: [{ value: circuitBreaker.failureCount }],
    },
    {
      name: "trustbridge_circuit_breaker_last_failure_timestamp_seconds",
      help: "Unix timestamp (seconds) of the most recent circuit breaker failure, or 0 if none",
      type: "gauge",
      samples: [{ value: circuitBreaker.lastFailureTime ? Math.floor(circuitBreaker.lastFailureTime / 1000) : 0 }],
    },
    {
      name: "trustbridge_rate_limit_active_identifiers",
      help: "Number of distinct identifiers with requests in the current rate limit window (process-local)",
      type: "gauge",
      samples: [{ value: rateLimit.activeIdentifiers }],
    },
    {
      name: "trustbridge_rate_limit_requests_allowed_total",
      help: "Total requests allowed by rate limiter since process start (process-local)",
      type: "counter",
      samples: [{ value: rateLimit.totalAllowed }],
    },
    {
      name: "trustbridge_rate_limit_requests_blocked_total",
      help: "Total requests blocked by rate limiter since process start (process-local)",
      type: "counter",
      samples: [{ value: rateLimit.totalBlocked }],
    },
    {
      name: "trustbridge_stale_contributors_total",
      help: "Count of contributors whose last Horizon check is older than the configured staleness threshold (default 24h), or who have never been checked",
      type: "gauge",
      samples: [{ value: staleness.staleCount }],
    },
    {
      name: "trustbridge_stale_contributors_ratio",
      help: "Ratio of stale contributors to total registered (0 to 1). Alert above 0.1 for warning, 0.5 for critical.",
      type: "gauge",
      samples: [
        {
          value:
            staleness.totalCount > 0
              ? Math.round((staleness.staleCount / staleness.totalCount) * 10000) / 10000
              : 0,
        },
      ],
    },
    {
      name: "trustbridge_data_is_stale",
      help: "Boolean gauge — 1 when any contributor data is stale (see stale_contributors_total threshold), 0 when everything is within the freshness window.",
      type: "gauge",
      samples: [{ value: staleness.stale ? 1 : 0 }],
    },
    {
      name: "trustbridge_process_local_info",
      help: "Constant 1 gauge — indicates these metrics are process-local and NOT sharded/aggregated until Redis is deployed",
      type: "gauge",
      samples: [{ labels: { scope: "process" }, value: 1 }],
    },
  ];

  const body = formatPrometheus(metrics);

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
