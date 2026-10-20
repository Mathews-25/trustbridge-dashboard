import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/registrations", () => ({
  refreshAllContributors: vi.fn(),
  getContributors: vi.fn(),
  refreshContributor: vi.fn(),
}));

vi.mock("@/lib/notifications", () => ({
  createNotification: vi.fn(),
}));

import { backgroundQueue, type Job } from "@/lib/background-queue";
import { createNotification } from "@/lib/notifications";
import { refreshAllContributors } from "@/lib/registrations";
import "@/lib/queue-worker";

const mockRefreshAllContributors = vi.mocked(refreshAllContributors);
const mockCreateNotification = vi.mocked(createNotification);

describe("queue-worker recheck.batch handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a BATCH_JOB_FAILED notification and rethrows when batch recheck fails", async () => {
    const handler = (backgroundQueue as unknown as { jobHandlers: Map<string, (job: Job) => Promise<void>> }).jobHandlers.get("recheck.batch");
    expect(handler).toBeDefined();

    mockRefreshAllContributors.mockRejectedValue(new Error("Database connection lost"));

    const fakeJob: Job = {
      id: "job-123",
      type: "recheck.batch",
      data: {},
      status: "processing",
      createdAt: new Date(),
      ownerId: "user-456",
    };

    await expect(handler!(fakeJob)).rejects.toThrow("Database connection lost");

    expect(mockCreateNotification).toHaveBeenCalledTimes(1);
    expect(mockCreateNotification).toHaveBeenCalledWith({
      userId: "user-456",
      type: "BATCH_JOB_FAILED",
      title: "Batch check failed",
      body: "Batch recheck failed: Database connection lost",
      metadata: { jobId: "job-123", error: "Database connection lost" },
    });
  });
});
