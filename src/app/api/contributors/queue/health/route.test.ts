import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-auth", () => ({
  requireMaintainerSession: vi.fn(),
}));

vi.mock("@/lib/background-queue", () => ({
  backgroundQueue: {
    getWorkerHealthMetrics: vi.fn(),
  },
}));

import { requireMaintainerSession } from "@/lib/api-auth";
import { backgroundQueue } from "@/lib/background-queue";
import { GET } from "./route";

describe("GET /api/contributors/queue/health", () => {
  it("returns 403 for non-maintainers", async () => {
    vi.mocked(requireMaintainerSession).mockResolvedValueOnce(false);
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns worker health metrics for maintainers", async () => {
    vi.mocked(requireMaintainerSession).mockResolvedValueOnce(true);
    vi.mocked(backgroundQueue.getWorkerHealthMetrics).mockResolvedValueOnce({
      depth: 5,
      failedCount: 1,
      oldestPendingJobCreatedAt: "2026-08-29T12:00:00Z",
      isServerlessInMemoryWarning: true,
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.depth).toBe(5);
    expect(body.failedCount).toBe(1);
    expect(body.serverlessNotice).toMatch(/serverless/i);
  });
});
