/**
 * Shared health-check logic for the TrustBridge Dashboard.
 *
 * Extracted so that `src/app/status/page.tsx` can import this directly
 * instead of fetching NEXT_PUBLIC_APP_URL/api/health (which is fragile in
 * preview/production and adds an unnecessary HTTP hop). (#308)
 *
 * The API route at `src/app/api/health/route.ts` also calls `runHealthChecks`
 * so both paths stay in sync. (#403)
 *
 * Dependency probes distinguish DB vs queue vs RPC failures with structured
 * statuses so incident response can tell which backend is degraded. (#589)
 * `NetworkStatusPanel` consumes the same `HealthResponse` shape from
 * `/api/health`; `parseHealthResponse` below validates partial/malformed
 * payloads so the panel can render a degraded/unavailable state instead of
 * crashing. (#538)
 *
 * Probe error details are redacted before they leave this module so
 * connection strings, hosts, credentials, and tokens never reach the
 * `/api/health` payload that load balancers and k8s probes read. (#665)
 */

import { getContractSyncHealth } from "@/lib/contract-sync";
import { prisma } from "@/lib/prisma";
import { buildStalenessSummary } from "@/lib/stale-export";
import { toContributorRow } from "@/lib/registrations";
import { captureException } from "@/lib/sentry";

export type HealthStatus = "ok" | "degraded" | "error";

/**
 * Structured result of a single dependency probe. `kind` identifies which
 * backend failed (db, queue, rpc) so operators can triage without parsing
 * free-form error strings.
 */
export interface DependencyProbe {
  status: HealthStatus;
  latencyMs: number;
  error?: string;
}

export interface HealthResponse {
  status: HealthStatus;
  timestamp: string;
  checks: {
    database: DependencyProbe;
    queue: DependencyProbe;
    horizon: { status: HealthStatus; latencyMs: number };
    sorobanRpc: { status: HealthStatus; latencyMs: number };
    csvStaleness: {
      status: HealthStatus;
      staleCount: number;
      totalCount: number;
      stalePercent: number;
      warning: string;
    };
    contractSync: {
      status: HealthStatus;
      lastRunAt: string | null;
      lastError?: string;
    };
  };
  version: string;
}

/**
 * HTTP status code that should accompany a given overall health status.
 * Shared so the API route and any other consumer agree on the mapping.
 */
export function healthStatusCode(status: HealthStatus): number {
  return status === "error" ? 503 : 200;
}

const HEALTH_STATUSES: readonly HealthStatus[] = ["ok", "degraded", "error"];

function isHealthStatus(value: unknown): value is HealthStatus {
  return typeof value === "string" && (HEALTH_STATUSES as readonly string[]).includes(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

/**
 * Patterns that must never appear in a health payload. Covers URL schemes
 * with embedded credentials, bare connection-string schemes, and common
 * secret-bearing query params / headers. (#665)
 */
const SENSITIVE_PATTERNS: readonly RegExp[] = [
  /[a-z][a-z0-9+.-]*:\/\/[^\s/@]+@/gi, // scheme://user:pass@host
  /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|rediss|amqp|amqps|https?):\/\/\S+/gi,
  /\b(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|authorization)\b\s*[=:]\s*\S+/gi,
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi,
];

/**
 * Redact sensitive substrings (connection strings, credentials, tokens) from
 * a probe error message. Returns `undefined` when nothing safe remains so the
 * payload omits the field entirely rather than emitting an empty string.
 * Exported for tests and for reuse by other health surfaces. (#665)
 */
export function redactProbeError(message: string | undefined): string | undefined {
  if (!message) return undefined;
  let redacted = message;
  for (const pattern of SENSITIVE_PATTERNS) {
    redacted = redacted.replace(pattern, "[redacted]");
  }
  redacted = redacted.trim();
  return redacted.length > 0 ? redacted : undefined;
}

/**
 * Normalize an unknown `/api/health` payload into a `HealthResponse`.
 *
 * Returns `null` when the payload is not an object at all (e.g. HTML error
 * page or empty body) so callers can surface an "unavailable" state. Missing
 * or malformed individual checks are coerced to `degraded` with zeroed
 * metrics, so partial payloads still render without crashing. (#538)
 */
export function parseHealthResponse(payload: unknown): HealthResponse | null {
  const root = asRecord(payload);
  if (!root) return null;

  const checks = asRecord(root.checks) ?? {};
  const database = asRecord(checks.database);
  const horizon = asRecord(checks.horizon);
  const sorobanRpc = asRecord(checks.sorobanRpc);
  const csvStaleness = asRecord(checks.csvStaleness);
  const contractSync = asRecord(checks.contractSync);

  const dbError = database && typeof database.error === "string" ? database.error : undefined;
  const queue = asRecord(checks.queue);
  const queueError = queue && typeof queue.error === "string" ? queue.error : undefined;
  const contractSyncError =
    contractSync && typeof contractSync.lastError === "string"
      ? contractSync.lastError
      : undefined;

  return {
    status: isHealthStatus(root.status) ? root.status : "degraded",
    timestamp: asString(root.timestamp, new Date().toISOString()),
    checks: {
      database: {
        status: database && isHealthStatus(database.status) ? database.status : "degraded",
        latencyMs: asNumber(database?.latencyMs),
        ...(dbError ? { error: dbError } : {}),
      },
      horizon: {
        status: horizon && isHealthStatus(horizon.status) ? horizon.status : "degraded",
        latencyMs: asNumber(horizon?.latencyMs),
      },
      queue: {
        status: queue && isHealthStatus(queue.status) ? queue.status : "degraded",
        latencyMs: asNumber(queue?.latencyMs),
        ...(queueError ? { error: queueError } : {}),
      },
      sorobanRpc: {
        status: sorobanRpc && isHealthStatus(sorobanRpc.status) ? sorobanRpc.status : "degraded",
        latencyMs: asNumber(sorobanRpc?.latencyMs),
      },
      csvStaleness: {
        status:
          csvStaleness && isHealthStatus(csvStaleness.status) ? csvStaleness.status : "degraded",
        staleCount: asNumber(csvStaleness?.staleCount),
        totalCount: asNumber(csvStaleness?.totalCount),
        stalePercent: asNumber(csvStaleness?.stalePercent),
        warning: asString(csvStaleness?.warning),
      },
      contractSync: {
        status:
          contractSync && isHealthStatus(contractSync.status) ? contractSync.status : "degraded",
        lastRunAt:
          contractSync && typeof contractSync.lastRunAt === "string"
            ? contractSync.lastRunAt
            : null,
        ...(contractSyncError ? { lastError: contractSyncError } : {}),
      },
    },
    version: asString(root.version, "unknown"),
  };
}

/** Probe Horizon by hitting /fee_stats — lightweight, no auth, always available. */
async function probeHorizon(): Promise<{ ok: boolean; latencyMs: number }> {
  const url =
    (process.env.NEXT_PUBLIC_HORIZON_URL?.trim() || "https://horizon.stellar.org") +
    "/fee_stats";
  const start = Date.now();
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(5_000),
      headers: { Accept: "application/json" },
    });
    return { ok: res.ok, latencyMs: Date.now() - start };
  } catch {
    return { ok: false, latencyMs: Date.now() - start };
  }
}

/** Probe Soroban RPC by sending a minimal getHealth JSON-RPC call. */
async function probeSorobanRpc(): Promise<{ ok: boolean; latencyMs: number }> {
  const url =
    process.env.SOROBAN_RPC_URL?.trim() || "https://soroban-testnet.stellar.org";
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: AbortSignal.timeout(5_000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth" }),
    });
    if (!res.ok) return { ok: false, latencyMs: Date.now() - start };
    const json = (await res.json()) as { result?: { status?: string } };
    return { ok: json.result?.status === "healthy", latencyMs: Date.now() - start };
  } catch {
    return { ok: false, latencyMs: Date.now() - start };
  }
}

/**
 * Probe the Prisma database with a lightweight `SELECT 1`.
 * Returns a structured probe so DB failures are distinguishable from
 * queue/RPC failures in the health payload. (#589)
 * Error messages are redacted so connection strings never leak. (#665)
 */
async function probeDatabase(): Promise<DependencyProbe> {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: "ok", latencyMs: Date.now() - start };
  } catch (err) {
    captureException(err, { surface: "health", check: "database" });
    const error = redactProbeError(
      err instanceof Error ? err.message : "Unknown database error",
    );
    return {
      status: "error",
      latencyMs: Date.now() - start,
      ...(error ? { error } : {}),
    };
  }
}

/**
 * Probe the queue backend. The queue is considered healthy when its backing
 * store is reachable; a missing/unreachable queue degrades (not errors) the
 * overall status so a queu

/* … truncated 4097 chars — edit only what you need near the top … */
