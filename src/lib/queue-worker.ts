import "server-only";

import { backgroundQueue, type Job } from "@/lib/background-queue";
import { createNotification } from "@/lib/notifications";
import {
  getContributors,
  refreshAllContributors,
  refreshContributor,
} from "@/lib/registrations";

// Register batch recheck handler
backgroundQueue.registerHandler("recheck.batch", async (job: Job) => {
  const startTime = Date.now();

  try {
    const refreshed = await refreshAllContributors();
    const { contributors } = await getContributors();

    job.result = {
      refreshed: refreshed.refreshed,
      changed: refreshed.changed,
      contributorCount: contributors.length,
      errorCount: refreshed.errors.length,
      durationMs: Date.now() - startTime,
    };

    // Create notification for completed batch job
    await createNotification({
      userId: job.ownerId ?? null,
      type: "BATCH_JOB_COMPLETED",
      title: "Batch check completed",
      body: `Batch recheck finished: ${refreshed.refreshed} contributors checked (${refreshed.changed} status changes, ${refreshed.errors.length} errors).`,
      metadata: { jobId: job.id, ...job.result },
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    await createNotification({
      userId: job.ownerId ?? null,
      type: "BATCH_JOB_FAILED",
      title: "Batch check failed",
      body: `Batch recheck failed: ${errorMsg}`,
      metadata: { jobId: job.id, error: errorMsg },
    });
    throw error;
  }
});

// Register single contributor recheck handler
backgroundQueue.registerHandler("recheck.single", async (job: Job) => {
  const startTime = Date.now();
  const { contributorId } = job.data;

  if (!contributorId || typeof contributorId !== "string") {
    throw new Error("contributorId is required and must be a string");
  }

  const result = await refreshContributor(contributorId);

  if (!result) {
    throw new Error(`Contributor ${contributorId} not found`);
  }

  const { contributor } = result;

  job.result = {
    contributorId,
    githubUsername: contributor.githubUsername,
    readiness: contributor.readiness,
    verified: contributor.verified,
    durationMs: Date.now() - startTime,
  };
});

/**
 * Runs the durable background worker until termination signal is received.
 */
export async function runWorker(): Promise<void> {
  console.log("Starting TrustBridge durable background worker...");

  const handleShutdown = (signal: string) => {
    console.log(`Received ${signal}. Shutting down worker gracefully...`);
    backgroundQueue.stop();
  };

  process.on("SIGINT", () => handleShutdown("SIGINT"));
  process.on("SIGTERM", () => handleShutdown("SIGTERM"));

  await backgroundQueue.startWorkerLoop();
}

export { backgroundQueue };
