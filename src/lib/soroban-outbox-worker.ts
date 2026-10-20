import "server-only";

import { backgroundQueue } from "@/lib/background-queue";
import { logger } from "@/lib/logger";
import {
  mirrorRegistrationToSoroban,
  type MirrorRegistrationPayload,
} from "@/lib/soroban-register";

/**
 * Soroban outbox worker.
 *
 * Consumes `MirrorRegistrationPayload` jobs from the background queue and
 * delegates each one to `mirrorRegistrationToSoroban`. Failures are logged
 * (not re-thrown) — the queue handles retries up to the configured
 * `maxAttempts`, after which the job lands in the DLQ.
 *
 * The worker is designed to be called from a lightweight server-side
 * interval or a Next.js Route Handler that acts as a heartbeat.
 * It processes **one job per tick** so that each tick is fast and does not
 * monopolize the event loop.
 *
 * Usage (fire-and-forget from /api/register or a cron route):
 * ```ts
 * import { tickSorobanOutboxWorker } from "@/lib/soroban-outbox-worker";
 * void tickSorobanOutboxWorker();
 * ```
 */

const workerLogger = logger.child({ subsystem: "soroban-outbox-worker" });

/**
 * Process the next pending Soroban mirror job, if any.
 * Returns the job id that was processed, or null if the queue was empty.
 */
export async function tickSorobanOutboxWorker(): Promise<string | null> {
  return backgroundQueue.process(async (payload) => {
    const typed = payload as MirrorRegistrationPayload;

    workerLogger.info("soroban_outbox_tick", {
      registrationId: typed.registrationId,
    });

    const result = await mirrorRegistrationToSoroban(typed);

    if (!result.success) {
      workerLogger.error("soroban_outbox_job_failed", {
        registrationId: typed.registrationId,
        error: result.error,
      });
      // Re-throw so the queue can record the failure and decide on retry/DLQ.
      throw new Error(
        typeof result.error?.message === "string"
          ? (result.error.message as string)
          : "Soroban mirror failed"
      );
    }

    workerLogger.info("soroban_outbox_job_done", {
      registrationId: typed.registrationId,
      skipped: "skipped" in result ? result.skipped : false,
    });
  });
}

/**
 * Enqueue a registration payload for asynchronous Soroban mirroring.
 * Call this after a successful `prisma.registration.upsert()`.
 */
export function enqueueSorobanMirror(payload: MirrorRegistrationPayload): string {
  workerLogger.info("soroban_mirror_enqueued", {
    registrationId: payload.registrationId,
    stellarAddress: payload.stellarAddress,
  });
  return backgroundQueue.enqueue(payload);
}
