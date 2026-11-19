import { NextResponse } from "next/server";

import { publicOptionsResponse, withPublicCors } from "@/lib/public-cors";
import { runHealthChecks } from "@/lib/health";
export type { HealthStatus, HealthResponse } from "@/lib/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Map the health status to an HTTP status code suitable for k8s probes.
 *
 * - `ok` / `degraded` -> 200 so the pod stays in rotation while a
 *   dependency is flaky (readiness stays true, liveness stays true).
 * - `unavailable` -> 503 so readiness probes pull the pod out of the
 *   load balancer without killing it.
 */
function httpStatusFor(status: string): number {
  return status === "unavailable" ? 503 : 200;
}

/**
 * GET /api/health
 *
 * Lightweight liveness + readiness probe for the TrustBridge Dashboard.
 *
 * Consumed by `NetworkStatusPanel` to render live RPC health. The response
 * shape is the `HealthResponse` contract from `@/lib/health`; the panel
 * tolerates partial payloads, but this route always returns a well-formed
 * body so operators get a stable contract.
 *
 * Dependency probe details (DB, Redis/queue, RPC) are surfaced as safe
 * booleans, status/reason codes, and latency only — never connection
 * strings, hosts, credentials, or tokens.
 */
export async function GET() {
  let body;
  try {
    body = await runHealthChecks();
  } catch (error) {
    // Never let a probe failure surface as an unhandled 500 — the panel
    // renders this as an "unavailable" state instead of crashing.
    body = {
      status: "unavailable" as const,
      checks: [],
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Health check failed",
    };
  }

  return withPublicCors(
    NextResponse.json(body, {
      status: httpStatusFor(body.status),
      headers: {
        "Cache-Control": "public, max-age=30, stale-while-revalidate=60",
      },
    })
  );
}

export function OPTIONS() {
  return publicOptionsResponse("GET, OPTIONS");
}
