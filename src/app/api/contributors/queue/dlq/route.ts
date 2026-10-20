import { NextResponse } from "next/server";

import { requireMaintainerSession } from "@/lib/api-auth";
import { backgroundQueue } from "@/lib/queue-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/contributors/queue/dlq — dead-letter queue (issue #200).
 *
 * Lists the most recent failed jobs with their (redacted, size-capped) error.
 * Maintainer-only; scoped to the caller's own jobs plus ownerless jobs.
 */
export async function GET(request: Request) {
  const session = await requireMaintainerSession();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const parsedLimit = Number.parseInt(url.searchParams.get("limit") ?? "50", 10);
  const limit = Number.isFinite(parsedLimit) ? parsedLimit : 50;

  const jobs = await backgroundQueue.getFailedJobs({
    limit,
    ownerId: session.user.id,
  });

  return NextResponse.json({
    jobs: jobs.map((job) => ({
      id: job.id,
      type: job.type,
      status: job.status,
      error: job.error ?? null,
      attempts:
        typeof (job.data as Record<string, unknown>)?.__retries === "number"
          ? ((job.data as Record<string, unknown>).__retries as number)
          : 0,
      createdAt: job.createdAt,
      startedAt: job.startedAt ?? null,
      completedAt: job.completedAt ?? null,
    })),
    count: jobs.length,
  });
}
