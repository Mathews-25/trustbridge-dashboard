import { NextRequest, NextResponse } from "next/server";

import { isAuthorizedScheduler, requireMaintainerSession } from "@/lib/api-auth";
import {
  getLastCronExportHealth,
  runCronExport,
} from "@/lib/cron-export";
import { assertSameOrigin } from "@/lib/csrf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/cron/export
 *
 * Triggers an automated nightly CSV contributor export for treasuries.
 * Callable by a maintainer session (manual trigger) or a scheduler presenting
 * `CRON_SECRET` via `Authorization: Bearer $CRON_SECRET` (automated cron runs).
 *
 * Never throws: DB or email transport failures are captured and returned in the
 * result object with status 502/200, preventing scheduler retry storms.
 */
export async function POST(request: NextRequest) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  const session = await requireMaintainerSession();
  const isScheduler = isAuthorizedScheduler(request);

  if (!session && !isScheduler) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await runCronExport({
    actorId: session?.user?.id ?? null,
    actorLogin: session?.user?.githubUsername ?? "scheduler:cron",
  });

  return NextResponse.json(result, {
    status: result.status === "error" ? 502 : 200,
  });
}

/**
 * GET /api/cron/export
 *
 * Read-only status of the most recent cron export run, for operational monitoring.
 * Unauthenticated (contains aggregate metrics and status, no contributor PII).
 */
export async function GET() {
  return NextResponse.json({ lastRun: getLastCronExportHealth() });
}
