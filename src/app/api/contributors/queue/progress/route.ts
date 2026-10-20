import { NextRequest } from "next/server";

import { requireMaintainerSession } from "@/lib/api-auth";
import { backgroundQueue } from "@/lib/queue-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await requireMaintainerSession();
  if (!session) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId")?.trim();

  if (!jobId) {
    return new Response(JSON.stringify({ error: "Job ID is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  let isActive = true;

  const stream = new ReadableStream({
    async start(controller) {
      function sendEvent(data: Record<string, unknown>) {
        if (!isActive) return;
        controller.enqueue(
          encoder.encode("data: " + JSON.stringify(data) + "\n\n")
        );
      }

      // Verify job exists and belongs to the user
      const job = await backgroundQueue.getJob(jobId);
      if (!job) {
        sendEvent({ type: "error", message: "Job not found" });
        controller.close();
        return;
      }
      if (job.ownerId && job.ownerId !== session!.user!.id) {
        sendEvent({ type: "error", message: "Job not found" });
        controller.close();
        return;
      }

      // Send initial state
      sendEvent({
        type: "status",
        jobId: job.id,
        status: job.status,
        createdAt: job.createdAt.toISOString(),
        startedAt: job.startedAt?.toISOString() ?? null,
      });

      // Poll for updates
      while (isActive) {
        const currentJob = await backgroundQueue.getJob(jobId);
        if (!currentJob) {
          sendEvent({ type: "error", message: "Job not found" });
          break;
        }

        if (currentJob.status === "completed") {
          sendEvent({
            type: "completed",
            jobId: currentJob.id,
            result: currentJob.result,
            completedAt: currentJob.completedAt?.toISOString(),
          });
          break;
        }

        if (currentJob.status === "failed") {
          sendEvent({
            type: "failed",
            jobId: currentJob.id,
            error: currentJob.error,
            completedAt: currentJob.completedAt?.toISOString(),
          });
          break;
        }

        if (currentJob.status === "processing") {
          sendEvent({
            type: "processing",
            jobId: currentJob.id,
            startedAt: currentJob.startedAt?.toISOString(),
          });
        }

        // Wait before next poll
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      controller.close();
    },
    cancel() {
      isActive = false;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}