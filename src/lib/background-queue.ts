/**
 * BackgroundQueue — lightweight in-process job queue for fire-and-forget
 * recheck operations that must not block HTTP responses.
 *
 * Jobs move through a simple lifecycle:
 *   pending → processing → completed | dlq
 *
 * The dead-letter queue (DLQ) receives jobs that have exhausted their retry
 * budget. All state is in-memory; the queue does not survive a process
 * restart. For persistent scheduling, use a durable queue (e.g. pg-boss)
 * wired to the same `enqueue` / `process` API.
 *
 * Thread-safety note: Node.js is single-threaded; concurrent reads of the
 * internal maps are safe. Mutations happen only inside the microtask that
 * processes a job, which cannot interleave with another job's mutation
 * within the same tick.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type JobStatus = "pending" | "processing" | "completed" | "dlq";

export interface Job<T = unknown> {
  id: string;
  /** Arbitrary payload — not exposed externally to keep the API narrow. */
  payload: T;
  status: JobStatus;
  /** ISO-8601 string set when the job is first enqueued. */
  enqueuedAt: string;
  /** ISO-8601 string set each time the job begins processing. */
  startedAt: string | null;
  /** ISO-8601 string set when the job reaches a terminal state. */
  finishedAt: string | null;
  /** Number of times this job has been attempted. */
  attempts: number;
  /** Last error message, if any. */
  lastError: string | null;
}

/** Shape returned by {@link BackgroundQueue.getWorkerHealthMetrics}. */
export interface WorkerHealthMetrics {
  /** Jobs awaiting their first (or next) processing attempt. */
  pendingCount: number;
  /** Jobs currently being processed. */
  processingCount: number;
  /** Jobs that finished successfully. */
  completedCount: number;
  /** Jobs that exhausted their retry budget and landed in the DLQ. */
  dlqCount: number;
  /** Total jobs ever enqueued (sum of all statuses). */
  totalEnqueued: number;
  /**
   * ISO-8601 timestamp of the most recently completed job, or null if no
   * job has ever completed.
   */
  lastProcessedAt: string | null;
  /**
   * ISO-8601 timestamp of when the queue instance was first created (i.e.
   * when the worker "started"), or null before any job has been enqueued.
   */
  workerStartedAt: string | null;
}

// ---------------------------------------------------------------------------
// BackgroundQueue
// ---------------------------------------------------------------------------

/**
 * Maximum number of times a job will be attempted before being moved to
 * the dead-letter queue. Deliberately kept small — these are supplementary
 * Horizon rechecks, not critical transactions.
 */
const DEFAULT_MAX_ATTEMPTS = 3;

let _idCounter = 0;

function nextJobId(): string {
  _idCounter += 1;
  return `job-${_idCounter}-${Date.now()}`;
}

export class BackgroundQueue<T = unknown> {
  /** All jobs keyed by their id, regardless of status. */
  private readonly jobs = new Map<string, Job<T>>();

  private lastProcessedAt: string | null = null;
  private workerStartedAt: string | null = null;
  private readonly maxAttempts: number;

  constructor(maxAttempts = DEFAULT_MAX_ATTEMPTS) {
    this.maxAttempts = maxAttempts;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Add a job to the pending queue. Returns the assigned job id.
   * The first enqueue also records the workerStartedAt timestamp.
   */
  enqueue(payload: T): string {
    const now = new Date().toISOString();
    if (!this.workerStartedAt) {
      this.workerStartedAt = now;
    }

    const id = nextJobId();
    const job: Job<T> = {
      id,
      payload,
      status: "pending",
      enqueuedAt: now,
      startedAt: null,
      finishedAt: null,
      attempts: 0,
      lastError: null,
    };
    this.jobs.set(id, job);
    return id;
  }

  /**
   * Process the next pending job using the provided handler function.
   *
   * - Returns the job id if a job was found and executed (successfully or not).
   * - Returns `null` if the queue was empty.
   * - On failure, retries up to `maxAttempts` times before moving the job to
   *   the DLQ.
   *
   * This method is intentionally synchronous in its queue manipulation so
   * that the status transitions are visible to `getWorkerHealthMetrics`
   * immediately, even before the async handler resolves.
   */
  async process(handler: (payload: T) => Promise<void>): Promise<string | null> {
    const job = this.firstPending();
    if (!job) return null;

    const now = new Date().toISOString();
    job.status = "processing";
    job.startedAt = now;
    job.attempts += 1;

    try {
      await handler(job.payload);
      job.status = "completed";
      job.finishedAt = new Date().toISOString();
      this.lastProcessedAt = job.finishedAt;
    } catch (err) {
      job.lastError = err instanceof Error ? err.message : String(err);
      job.finishedAt = new Date().toISOString();

      if (job.attempts >= this.maxAttempts) {
        job.status = "dlq";
      } else {
        // Return to pending for retry
        job.status = "pending";
        job.finishedAt = null;
      }
    }

    return job.id;
  }

  /**
   * Return a read-only snapshot of all current job metrics. Safe to call
   * concurrently — does not mutate any internal state.
   */
  getWorkerHealthMetrics(): WorkerHealthMetrics {
    let pendingCount = 0;
    let processingCount = 0;
    let completedCount = 0;
    let dlqCount = 0;

    for (const job of this.jobs.values()) {
      switch (job.status) {
        case "pending":
          pendingCount++;
          break;
        case "processing":
          processingCount++;
          break;
        case "completed":
          completedCount++;
          break;
        case "dlq":
          dlqCount++;
          break;
      }
    }

    return {
      pendingCount,
      processingCount,
      completedCount,
      dlqCount,
      totalEnqueued: this.jobs.size,
      lastProcessedAt: this.lastProcessedAt,
      workerStartedAt: this.workerStartedAt,
    };
  }

  /**
   * Remove all jobs from all queues and reset timestamps.
   * Primarily intended for test isolation — do not call in production.
   */
  clear(): void {
    this.jobs.clear();
    this.lastProcessedAt = null;
    this.workerStartedAt = null;
  }

  /**
   * Return the count of jobs in a given status. Convenience accessor for
   * tests that need targeted assertions without reading the full metrics shape.
   */
  size(status?: JobStatus): number {
    if (!status) return this.jobs.size;
    let count = 0;
    for (const job of this.jobs.values()) {
      if (job.status === status) count++;
    }
    return count;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private firstPending(): Job<T> | undefined {
    for (const job of this.jobs.values()) {
      if (job.status === "pending") return job;
    }
    return undefined;
  }
}

/**
 * Module-level singleton for use by API routes and server-side job producers.
 * Import and use `backgroundQueue` rather than instantiating a new instance
 * per request, so that the in-memory job maps are shared across invocations
 * within the same Node.js process.
 */
export const backgroundQueue = new BackgroundQueue();
