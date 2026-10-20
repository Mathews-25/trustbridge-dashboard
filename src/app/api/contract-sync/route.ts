import { NextRequest, NextResponse } from "next/server";

import { isAuthorizedScheduler, requireMaintainerSession } from "@/lib/api-auth";
import {
  getContractSyncHealth,
  syncContractToPostgres,
} from "@/lib/contract-sync";
import { assertSameOrigin } from "@/lib/csrf";
import { publicOptionsResponse, withPublicCors } from "@/lib/public-cors";

import { captureException } from "@/lib/sentry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/contract-sync
 *
 * Triggers a contract-to-Postgres sync run. Callable by a maintainer session
 * (manual trigger) or a scheduler presenting `CRON_SECRET` (automated runs).
 * Always returns 200/502 with a result body — never throws — so a scheduler
 * retry storm can't be caused by an unhandled exception here.
 */
export async function POST(request: NextRequest) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  const session = await requireMaintainerSession();
  if (!session && !isAuthorizedScheduler(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await syncContractToPostgres();
  if (result.status === "error" || (result.errors && result.errors.length > 0)) {
    captureException(
      new Error(`Contract sync failed: ${result.errors?.join("; ") || "Unknown error"}`),
      { surface: "contract-sync", errors: result.errors }
    );
  }

  return NextResponse.json(result, {
    status: result.status === "error" ? 502 : 200,
  });
}

/**
 * GET /api/contract-sync
 *
 * Read-only status of the most recent sync run, for dashboards/monitoring.
 * Unauthenticated (no contributor PII — same posture as `/api/health`).
 */
export async function GET() {
  return withPublicCors(NextResponse.json({ lastRun: getContractSyncHealth() }));
}

export function OPTIONS() {
  return publicOptionsResponse("GET, OPTIONS");
}
