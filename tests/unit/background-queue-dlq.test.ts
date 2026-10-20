/**
 * Unit tests for BackgroundQueue — focused on DLQ promotion, health metrics,
 * and concurrent-read safety of getWorkerHealthMetrics.
 */

import { afterEach, describe, expect, it } from "vitest";
import { BackgroundQueue } from "@/lib/background-queue";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Succeed on the first call; fail on every call thereafter. */
function succeedOnce(): (payload: unknown) => Promise<void> {
  let called = false;
  return async () => {
    if (called) throw new Error("intentional failure");
    called = true;
  };
}

/** Always fail. */
function alwaysFail(msg = "handler error"): (payload: unknown) => Promise<void> {
  return async () => {
    throw new Error(msg);
  };
}

/** Always succeed. */
function alwaysSucceed(): (payload: unknown) => Promise<void> {
  return async () => {
    /* no-op */
  };
}

// ---------------------------------------------------------------------------
// Basic lifecycle
// ---------------------------------------------------------------------------

describe("BackgroundQueue – basic lifecycle", () => {
  it("starts with empty metrics and zero counts", () => {
    const q = new BackgroundQueue();
    const m = q.getWorkerHealthMetrics();

    expect(m.pendingCount).toBe(0);
    expect(m.processingCount).toBe(0);
    expect(m.completedCount).toBe(0);
    expect(m.dlqCount).toBe(0);
    expect(m.totalEnqueued).toBe(0);
    expect(m.lastProcessedAt).toBeNull();
    expect(m.workerStartedAt).toBeNull();
  });

  it("increments pendingCount when a job is enqueued", () => {
    const q = new BackgroundQueue();
    q.enqueue({ target: "G123" });

    expect(q.getWorkerHealthMetrics().pendingCount).toBe(1);
    expect(q.getWorkerHealthMetrics().totalEnqueued).toBe(1);
  });

  it("sets workerStartedAt on first enqueue", () => {
    const q = new BackgroundQueue();
    expect(q.getWorkerHealthMetrics().workerStartedAt).toBeNull();

    q.enqueue("job");
    const m = q.getWorkerHealthMetrics();
    expect(m.workerStartedAt).not.toBeNull();
    expect(new Date(m.workerStartedAt!).getTime()).not.toBeNaN();
  });

  it("does not change workerStartedAt on subsequent enqueues", async () => {
    const q = new BackgroundQueue();
    q.enqueue("a");
    const first = q.getWorkerHealthMetrics().workerStartedAt;

    // Small delay to ensure timestamps would differ if the guard is broken
    await new Promise((r) => setTimeout(r, 5));
    q.enqueue("b");

    expect(q.getWorkerHealthMetrics().workerStartedAt).toBe(first);
  });

  it("moves job to completed and updates lastProcessedAt", async () => {
    const q = new BackgroundQueue();
    q.enqueue("data");
    await q.process(alwaysSucceed());

    const m = q.getWorkerHealthMetrics();
    expect(m.pendingCount).toBe(0);
    expect(m.completedCount).toBe(1);
    expect(m.lastProcessedAt).not.toBeNull();
    expect(new Date(m.lastProcessedAt!).getTime()).not.toBeNaN();
  });

  it("returns null from process() when queue is empty", async () => {
    const q = new BackgroundQueue();
    const result = await q.process(alwaysSucceed());
    expect(result).toBeNull();
  });

  it("returns job id from process() when a job runs", async () => {
    const q = new BackgroundQueue();
    const id = q.enqueue("payload");
    const processed = await q.process(alwaysSucceed());
    expect(processed).toBe(id);
  });
});

// ---------------------------------------------------------------------------
// DLQ promotion
// ---------------------------------------------------------------------------

describe("BackgroundQueue – DLQ promotion", () => {
  it("retries up to maxAttempts before moving to DLQ", async () => {
    const q = new BackgroundQueue(3);
    q.enqueue("will-fail");
    const fail = alwaysFail();

    // Attempts 1 and 2: status returns to pending for retry
    await q.process(fail);
    expect(q.getWorkerHealthMetrics().pendingCount).toBe(1);
    expect(q.getWorkerHealthMetrics().dlqCount).toBe(0);

    await q.process(fail);
    expect(q.getWorkerHealthMetrics().pendingCount).toBe(1);
    expect(q.getWorkerHealthMetrics().dlqCount).toBe(0);

    // Attempt 3: exhausted — promoted to DLQ
    await q.process(fail);
    const m = q.getWorkerHealthMetrics();
    expect(m.pendingCount).toBe(0);
    expect(m.dlqCount).toBe(1);
    expect(m.completedCount).toBe(0);
  });

  it("increments dlqCount for each DLQ job independently", async () => {
    const q = new BackgroundQueue(1);
    q.enqueue("a");
    q.enqueue("b");
    await q.process(alwaysFail());
    await q.process(alwaysFail());
    expect(q.getWorkerHealthMetrics().dlqCount).toBe(2);
  });

  it("does not update lastProcessedAt when a job fails into DLQ", async () => {
    const q = new BackgroundQueue(1);
    q.enqueue("fail-job");
    await q.process(alwaysFail());
    // DLQ promotion should not record a successful lastProcessedAt
    expect(q.getWorkerHealthMetrics().lastProcessedAt).toBeNull();
  });

  it("keeps completed count separate from DLQ count in mixed scenario", async () => {
    const q = new BackgroundQueue(1);
    q.enqueue("good");
    q.enqueue("bad");

    await q.process(alwaysSucceed()); // good → completed
    await q.process(alwaysFail());   // bad → dlq

    const m = q.getWorkerHealthMetrics();
    expect(m.completedCount).toBe(1);
    expect(m.dlqCount).toBe(1);
    expect(m.pendingCount).toBe(0);
    expect(m.totalEnqueued).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Metrics reset and isolation
// ---------------------------------------------------------------------------

describe("BackgroundQueue – metrics reset", () => {
  it("clear() resets all counters to zero", async () => {
    const q = new BackgroundQueue();
    q.enqueue("x");
    await q.process(alwaysSucceed());
    q.clear();

    const m = q.getWorkerHealthMetrics();
    expect(m.pendingCount).toBe(0);
    expect(m.completedCount).toBe(0);
    expect(m.totalEnqueued).toBe(0);
    expect(m.lastProcessedAt).toBeNull();
    expect(m.workerStartedAt).toBeNull();
  });

  it("independent instances do not share state", async () => {
    const a = new BackgroundQueue();
    const b = new BackgroundQueue();
    a.enqueue("for-a");
    await a.process(alwaysSucceed());

    expect(a.getWorkerHealthMetrics().completedCount).toBe(1);
    expect(b.getWorkerHealthMetrics().completedCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Read-only safety of getWorkerHealthMetrics
// ---------------------------------------------------------------------------

describe("BackgroundQueue – getWorkerHealthMetrics read-only safety", () => {
  it("multiple consecutive calls return stable counts", async () => {
    const q = new BackgroundQueue();
    q.enqueue("a");
    q.enqueue("b");
    await q.process(alwaysSucceed());

    const m1 = q.getWorkerHealthMetrics();
    const m2 = q.getWorkerHealthMetrics();
    expect(m1).toEqual(m2);
  });

  it("returns zeros for all fields (not undefined) on empty queue", () => {
    const q = new BackgroundQueue();
    const m = q.getWorkerHealthMetrics();
    // All numeric fields must be 0, not undefined/null
    expect(m.pendingCount).toBe(0);
    expect(m.processingCount).toBe(0);
    expect(m.completedCount).toBe(0);
    expect(m.dlqCount).toBe(0);
    expect(m.totalEnqueued).toBe(0);
  });
});
