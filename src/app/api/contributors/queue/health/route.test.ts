import { describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/contributors/queue/health/route";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/background-queue", () => ({
  backgroundQueue: {
    getWorkerHealthMetrics: vi.fn(),
  },
}));

import { getServerSession } from "next-auth";
import { backgroundQueue } from "@/lib/background-queue";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const METRICS_FIXTURE = {
  pendingCount: 2,
  processingCount: 0,
  completedCount: 10,
  dlqCount: 1,
  totalEnqueued: 13,
  lastProcessedAt: "2024-10-20T14:00:00.000Z",
  workerStartedAt: "2024-10-20T12:00:00.000Z",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/contributors/queue/health", () => {
  it("returns 403 when session is missing (unauthenticated)", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);

    const res = await GET();
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Forbidden");
    expect(backgroundQueue.getWorkerHealthMetrics).not.toHaveBeenCalled();
  });

  it("returns 403 when authenticated but not a maintainer", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user-1", isMaintainer: false },
    } as never);

    const res = await GET();
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Forbidden");
  });

  it("returns 200 with metrics for a maintainer", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user-1", isMaintainer: true },
    } as never);
    vi.mocked(backgroundQueue.getWorkerHealthMetrics).mockReturnValue(METRICS_FIXTURE);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.metrics).toEqual(METRICS_FIXTURE);
  });

  it("metrics object contains the expected keys", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user-1", isMaintainer: true },
    } as never);
    vi.mocked(backgroundQueue.getWorkerHealthMetrics).mockReturnValue(METRICS_FIXTURE);

    const res = await GET();
    const { metrics } = await res.json();

    expect(metrics).toHaveProperty("pendingCount");
    expect(metrics).toHaveProperty("processingCount");
    expect(metrics).toHaveProperty("completedCount");
    expect(metrics).toHaveProperty("dlqCount");
    expect(metrics).toHaveProperty("totalEnqueued");
    expect(metrics).toHaveProperty("lastProcessedAt");
    expect(metrics).toHaveProperty("workerStartedAt");
  });

  it("metrics counts are numeric (not undefined)", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user-1", isMaintainer: true },
    } as never);
    vi.mocked(backgroundQueue.getWorkerHealthMetrics).mockReturnValue({
      pendingCount: 0,
      processingCount: 0,
      completedCount: 0,
      dlqCount: 0,
      totalEnqueued: 0,
      lastProcessedAt: null,
      workerStartedAt: null,
    });

    const res = await GET();
    const { metrics } = await res.json();

    // All numeric fields must be 0, not undefined
    expect(typeof metrics.pendingCount).toBe("number");
    expect(typeof metrics.processingCount).toBe("number");
    expect(typeof metrics.completedCount).toBe("number");
    expect(typeof metrics.dlqCount).toBe("number");
    expect(typeof metrics.totalEnqueued).toBe("number");
  });

  it("DLQ jobs increment dlqCount in the returned metrics", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user-1", isMaintainer: true },
    } as never);
    vi.mocked(backgroundQueue.getWorkerHealthMetrics).mockReturnValue({
      ...METRICS_FIXTURE,
      dlqCount: 5,
    });

    const res = await GET();
    const { metrics } = await res.json();
    expect(metrics.dlqCount).toBe(5);
  });
});
