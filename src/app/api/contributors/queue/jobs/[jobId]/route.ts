import { NextResponse } from "next/server";

import { requireMaintainerSession } from "@/lib/api-auth";
import { backgroundQueue } from "@/lib/queue-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: { jobId: string };
}

export async function GET(_request: Request, { params }: RouteContext) {
  const session = await requireMaintainerSession();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const jobId = params.jobId?.trim();
  if (!jobId) {
    return NextResponse.json(
      { error: "Job ID is required" },
      { status: 400 }
    );
  }

  const job = await backgroundQueue.getJob(jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // Ensure the user can only see their own jobs (or jobs with no owner)
  if (job.ownerId && job.ownerId !== session.user.id) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json({ job });
}