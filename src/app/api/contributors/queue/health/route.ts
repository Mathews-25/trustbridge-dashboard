import { NextResponse } from "next/server";

import { requireMaintainerSession } from "@/lib/api-auth";
import { backgroundQueue } from "@/lib/background-queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/contributors/queue/health
 *
 * Returns current background queue health metrics for the maintainer
 * dashboard. Guarded by the standard maintainer session check — the same
 * pattern used by /api/contributors and /api/soroban/events.
 *
 * Response shape (HTTP 200):
 * ```json
 * {
 *   "metrics": {
 *     "pendingCount": 0,
 *     "processingCount": 0,
 *     "completedCount": 12,
 *     "dlqCount": 1,
 *     "totalEnqueued": 13,
 *     "lastProcessedAt": "2024-10-20T14:00:00.000Z",
 *     "workerStartedAt": "2024-10-20T12:00:00.000Z"
 *   }
 * }
 * ```
 */
export async function GET() {
  if (!(await requireMaintainerSession())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const metrics = backgroundQueue.getWorkerHealthMetrics();
  return NextResponse.json({ metrics });
}
