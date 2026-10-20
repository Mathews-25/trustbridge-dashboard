/**
 * API tests for the dead-letter queue routes (issue #200).
 *
 *  - GET  /api/contributors/queue/dlq                 — list failed jobs
 *  - POST /api/contributors/queue/dlq/[jobId]/retry   — re-queue a failed job
 *
 * Both are maintainer-only. Retry is additionally CSRF-guarded, gated behind
 * the `dlq_retry` feature flag, and audited.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/api-auth");
vi.mock("@/lib/queue-worker");
vi.mock("@/lib/audit", () => ({ recordAuditLog: vi.fn() }));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: vi.fn() }));

import * as authLib from "@/lib/api-auth";
import * as queueLib from "@/lib/queue-worker";
import { recordAuditLog } from "@/lib/audit";
import { isFeatureEnabled } from "@/lib/feature-flags";

const SESSION = {
  user: { id: "maintainer-1", githubUsername: "alice" },
} as never;

function get(path = "/api/contributors/queue/dlq") {
  return new Request(`http://localhost:3000${path}`);
}

function retryReq(jobId: string) {
  return new NextRequest(
    `http://localhost:3000/api/contributors/queue/dlq/${jobId}/retry`,
    {
      method: "POST",
      headers: { origin: "http://localhost:3000", host: "localhost:3000" },
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isFeatureEnabled).mockResolvedValue(true);
});

describe("GET /api/contributors/queue/dlq", () => {
  it("is maintainer-only", async () => {
    vi.mocked(authLib.requireMaintainerSession).mockResolvedValue(null);
    const { GET } = await import("@/app/api/contributors/queue/dlq/route");
    const res = await GET(get());
    expect(res.status).toBe(403);
    expect(vi.mocked(queueLib.backgroundQueue.getFailedJobs)).not.toHaveBeenCalled();
  });

  it("returns the failed jobs with a stable shape", async () => {
    vi.mocked(authLib.requireMaintainerSession).mockResolvedValue(SESSION);
    vi.mocked(queueLib.backgroundQueue.getFailedJobs).mockResolvedValue([
      {
        id: "job-1",
        type: "recheck.single",
        status: "failed",
        data: { __retries: 2 },
        error: "Horizon error: timeout",
        createdAt: new Date("2026-08-29T10:00:00Z"),
        startedAt: new Date("2026-08-29T10:00:01Z"),
        completedAt: new Date("2026-08-29T10:00:05Z"),
      },
    ] as never);

    const { GET } = await import("@/app/api/contributors/queue/dlq/route");
    const res = await GET(get());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(1);
    expect(body.jobs[0]).toMatchObject({
      id: "job-1",
      type: "recheck.single",
      status: "failed",
      error: "Horizon error: timeout",
      attempts: 2,
    });
  });

  it("scopes the query to the caller", async () => {
    vi.mocked(authLib.requireMaintainerSession).mockResolvedValue(SESSION);
    vi.mocked(queueLib.backgroundQueue.getFailedJobs).mockResolvedValue([] as never);

    const { GET } = await import("@/app/api/contributors/queue/dlq/route");
    await GET(get("/api/contributors/queue/dlq?limit=10"));

    expect(queueLib.backgroundQueue.getFailedJobs).toHaveBeenCalledWith({
      limit: 10,
      ownerId: "maintainer-1",
    });
  });
});

describe("POST /api/contributors/queue/dlq/[jobId]/retry", () => {
  it("rejects cross-origin requests", async () => {
    const { POST } = await import(
      "@/app/api/contributors/queue/dlq/[jobId]/retry/route"
    );
    const req = new NextRequest(
      "http://localhost:3000/api/contributors/queue/dlq/job-1/retry",
      { method: "POST", headers: { origin: "https://evil.example" } },
    );
    const res = await POST(req, { params: { jobId: "job-1" } });
    expect(res.status).toBe(403);
  });

  it("is maintainer-only", async () => {
    vi.mocked(authLib.requireMaintainerSession).mockResolvedValue(null);
    const { POST } = await import(
      "@/app/api/contributors/queue/dlq/[jobId]/retry/route"
    );
    const res = await POST(retryReq("job-1"), { params: { jobId: "job-1" } });
    expect(res.status).toBe(403);
  });

  it("returns 403 when the dlq_retry flag is off", async () => {
    vi.mocked(authLib.requireMaintainerSession).mockResolvedValue(SESSION);
    vi.mocked(isFeatureEnabled).mockResolvedValue(false);

    const { POST } = await import(
      "@/app/api/contributors/queue/dlq/[jobId]/retry/route"
    );
    const res = await POST(retryReq("job-1"), { params: { jobId: "job-1" } });
    expect(res.status).toBe(403);
    expect(vi.mocked(queueLib.backgroundQueue.retryJob)).not.toHaveBeenCalled();
  });

  it("returns 404 when the job is not retryable", async () => {
    vi.mocked(authLib.requireMaintainerSession).mockResolvedValue(SESSION);
    vi.mocked(queueLib.backgroundQueue.retryJob).mockResolvedValue(null);

    const { POST } = await import(
      "@/app/api/contributors/queue/dlq/[jobId]/retry/route"
    );
    const res = await POST(retryReq("missing"), { params: { jobId: "missing" } });
    expect(res.status).toBe(404);
  });

  it("re-queues the job and writes an audit log", async () => {
    vi.mocked(authLib.requireMaintainerSession).mockResolvedValue(SESSION);
    vi.mocked(queueLib.backgroundQueue.retryJob).mockResolvedValue({
      id: "job-1",
      type: "recheck.batch",
      status: "pending",
    } as never);

    const { POST } = await import(
      "@/app/api/contributors/queue/dlq/[jobId]/retry/route"
    );
    const res = await POST(retryReq("job-1"), { params: { jobId: "job-1" } });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.job).toEqual({
      id: "job-1",
      type: "recheck.batch",
      status: "pending",
    });
    expect(queueLib.backgroundQueue.retryJob).toHaveBeenCalledWith("job-1", {
      ownerId: "maintainer-1",
    });
    expect(recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "queue.job.retried",
        actorId: "maintainer-1",
        targetId: "job-1",
      }),
    );
  });
});
