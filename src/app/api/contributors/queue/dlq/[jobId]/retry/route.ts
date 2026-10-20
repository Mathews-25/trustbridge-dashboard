import { NextResponse, type NextRequest } from "next/server";

import { requireMaintainerSession } from "@/lib/api-auth";
import { recordAuditLog } from "@/lib/audit";
import { assertSameOrigin } from "@/lib/csrf";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { backgroundQueue } from "@/lib/queue-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: { jobId: string };
}

/**
 * POST /api/contributors/queue/dlq/[jobId]/retry — re-queue a failed job
 * (issue #200).
 *
 * Maintainer-only, CSRF-guarded, gated behind the `dlq_retry` feature flag,
 * and audited. Only jobs currently in the `failed` state and visible to the
 * caller can be retried.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  const session = await requireMaintainerSession();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!(await isFeatureEnabled("dlq_retry"))) {
    return NextResponse.json(
      { error: "Dead-letter retry is currently disabled" },
      { status: 403 }
    );
  }

  const jobId = params.jobId?.trim();
  if (!jobId) {
    return NextResponse.json({ error: "Job ID is required" }, { status: 400 });
  }

  const job = await backgroundQueue.retryJob(jobId, {
    ownerId: session.user.id,
  });
  if (!job) {
    return NextResponse.json(
      { error: "Job not found or not retryable" },
      { status: 404 }
    );
  }

  await recordAuditLog({
    action: "queue.job.retried",
    actorId: session.user.id,
    actorLogin: session.user.githubUsername ?? null,
    targetId: job.id,
    metadata: { type: job.type },
  });

  return NextResponse.json({
    job: { id: job.id, type: job.type, status: job.status },
  });
}
