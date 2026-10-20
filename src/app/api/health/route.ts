import { NextResponse } from "next/server";

import { publicOptionsResponse, withPublicCors } from "@/lib/public-cors";
import { runHealthChecks } from "@/lib/health";
export type { HealthStatus, HealthResponse } from "@/lib/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/health
 *
 * Lightweight liveness + readiness probe for the TrustBridge Dashboard.
 */
export async function GET() {
  const body = await runHealthChecks();
  return withPublicCors(
    NextResponse.json(body, {
      status: 200,
      headers: {
        "Cache-Control": "public, max-age=30, stale-while-revalidate=60",
      },
    })
  );
}

export function OPTIONS() {
  return publicOptionsResponse("GET, OPTIONS");
}
