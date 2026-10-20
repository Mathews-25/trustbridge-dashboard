import { describe, it, expect, vi, beforeEach } from "vitest";
import { BackgroundQueue, type Job } from "@/lib/background-queue";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    queueJob: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

describe("BackgroundQueue (Durable Queue tests)", () => {
  let queue: BackgroundQueue;

  beforeEach(() => {
    vi.clearAllMocks();
    queue = new BackgroundQueue({ pollIntervalMs: 10 });
  });

  it("enqueues jobs durably to database", async () => {
    const mockRecord = {
      id: "job-1",
      type: "recheck.batch",
      status: "pending",
      data: { test: true },
      ownerId: "user-1",
      createdAt: new Date(),
    };

    vi.mocked(prisma.queueJob.create).mockResolvedValue(mockRecord as never);

    const jobId = await queue.enqueue("recheck.batch", { test: true }, "user-1");

    expect(jobId).toBe("job-1");
    expect(prisma.queueJob.create).toHaveBeenCalledWith({
      data: {
        type: "recheck.batch",
        status: "pending",
        data: { test: true },
        ownerId: "user-1",
      },
    });
  });

  it("retrieves a job by ID", async () => {
    const mockRecord = {
      id: "job-2",
      type: "recheck.single",
      status: "completed",
      data: { contributorId: "contrib-1" },
      result: { verified: true },
      createdAt: new Date(),
      startedAt: new Date(),
      completedAt: new Date(),
      ownerId: "user-1",
    };

    vi.mocked(prisma.queueJob.findUnique).mockResolvedValue(mockRecord as never);

    const job = await queue.getJob("job-2");

    expect(job).toBeDefined();
    expect(job?.id).toBe("job-2");
    expect(job?.status).toBe("completed");
    expect(job?.result).toEqual({ verified: true });
  });

  it("atomically claims pending jobs to prevent double processing", async () => {
    const candidate = { id: "job-3" };
    const claimed = {
      id: "job-3",
      type: "recheck.batch",
      status: "processing",
      data: {},
      createdAt: new Date(),
    };

    vi.mocked(prisma.queueJob.findFirst).mockResolvedValue(candidate as never);
    vi.mocked(prisma.queueJob.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.queueJob.findUnique).mockResolvedValue(claimed as never);

    const job = await queue.claimNextPendingJob();

    expect(job).toBeDefined();
    expect(job?.id).toBe("job-3");
    expect(job?.status).toBe("processing");
    expect(prisma.queueJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job-3", status: "pending" },
      })
    );
  });

  it("handles race condition when claiming job", async () => {
    const candidate = { id: "job-4" };

    vi.mocked(prisma.queueJob.findFirst).mockResolvedValue(candidate as never);
    // Another worker claimed it first
    vi.mocked(prisma.queueJob.updateMany).mockResolvedValue({ count: 0 });

    const job = await queue.claimNextPendingJob();

    expect(job).toBeNull();
  });

  it("processes jobs and marks them completed on success", async () => {
    const job: Job = {
      id: "job-5",
      type: "recheck.batch",
      data: {},
      status: "processing",
      createdAt: new Date(),
    };

    const handler = vi.fn().mockImplementation(async (j: Job) => {
      j.result = { processed: 5 };
    });

    queue.registerHandler("recheck.batch", handler);
    await queue.processJob(job);

    expect(handler).toHaveBeenCalledWith(job);
    expect(prisma.queueJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job-5" },
        data: expect.objectContaining({
          status: "completed",
          result: { processed: 5 },
        }),
      })
    );
  });

  it("catches errors and marks job as failed (poison message handling)", async () => {
    const job: Job = {
      id: "job-6",
      type: "recheck.single",
      data: {},
      status: "processing",
      createdAt: new Date(),
    };

    const handler = vi.fn().mockRejectedValue(new Error("Horizon timeout error"));

    queue.registerHandler("recheck.single", handler);
    await queue.processJob(job);

    expect(prisma.queueJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job-6" },
        data: expect.objectContaining({
          status: "failed",
          error: "Horizon timeout error",
        }),
      })
    );
  });

  it("computes queue metrics accurately", async () => {
    vi.mocked(prisma.queueJob.count)
      .mockResolvedValueOnce(10) // total
      .mockResolvedValueOnce(3)  // pending
      .mockResolvedValueOnce(2)  // processing
      .mockResolvedValueOnce(4)  // completed
      .mockResolvedValueOnce(1); // failed

    const now = Date.now();
    vi.mocked(prisma.queueJob.findMany).mockResolvedValue([
      {
        startedAt: new Date(now - 1000),
        completedAt: new Date(now),
      },
    ] as never);

    const metrics = await queue.getMetrics();

    expect(metrics.totalJobs).toBe(10);
    expect(metrics.pendingCount).toBe(3);
    expect(metrics.processingCount).toBe(2);
    expect(metrics.completedCount).toBe(4);
    expect(metrics.failedCount).toBe(1);
    expect(metrics.averageProcessingTimeMs).toBe(1000);
  });
});
