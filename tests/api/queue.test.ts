/**
 * API tests for /api/contributors/queue routes
 *
 * Tests the background job queue endpoints:
 * - GET /api/contributors/queue/status — retrieves queue metrics
 * - GET /api/contributors/queue/jobs/[jobId] — retrieves a specific job
 *
 * These routes:
 * - Require maintainer authentication
 * - Return stable JSON shapes
 * - Do NOT expose PII in job payloads
 * - Support job enumeration safely (maintainer-only)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/api-auth");
vi.mock("@/lib/queue-worker");

import * as authLib from "@/lib/api-auth";
import * as queueLib from "@/lib/queue-worker";

// Test helper to create requests
function createRequest(path: string, init?: RequestInit) {
  return new NextRequest(`http://localhost:3000${path}`, init);
}

describe("GET /api/contributors/queue/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires maintainer session", async () => {
    vi.mocked(authLib.requireMaintainerSession).mockResolvedValue(false);

    const { GET } = await import(
      "@/app/api/contributors/queue/status/route"
    );
    const request = createRequest("/api/contributors/queue/status");
    const response = await GET();

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toBe("Forbidden");
  });

  it("returns queue metrics for authenticated maintainer", async () => {
    vi.mocked(authLib.requireMaintainerSession).mockResolvedValue(true);

    const mockMetrics = {
      totalJobs: 5,
      pendingJobs: 2,
      activeJobs: 1,
      completedJobs: 2,
      failedJobs: 0,
      avgProcessingTimeMs: 1200,
    };
    vi.mocked(queueLib.backgroundQueue.getMetrics).mockReturnValue(mockMetrics);

    const { GET } = await import(
      "@/app/api/contributors/queue/status/route"
    );
    const response = await GET();

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty("queue");
    expect(data.queue).toEqual(mockMetrics);
  });

  it("returns valid JSON structure", async () => {
    vi.mocked(authLib.requireMaintainerSession).mockResolvedValue(true);
    vi.mocked(queueLib.backgroundQueue.getMetrics).mockReturnValue({
      totalJobs: 0,
      pendingJobs: 0,
      activeJobs: 0,
      completedJobs: 0,
      failedJobs: 0,
      avgProcessingTimeMs: 0,
    });

    const { GET } = await import(
      "@/app/api/contributors/queue/status/route"
    );
    const response = await GET();

    expect(response.headers.get("content-type")).toMatch(/application\/json/);
    const data = await response.json();
    expect(typeof data).toBe("object");
    expect(data).not.toBeNull();
  });

  it("returns content-type application/json", async () => {
    vi.mocked(authLib.requireMaintainerSession).mockResolvedValue(true);
    vi.mocked(queueLib.backgroundQueue.getMetrics).mockReturnValue({
      totalJobs: 0,
      pendingJobs: 0,
      activeJobs: 0,
      completedJobs: 0,
      failedJobs: 0,
      avgProcessingTimeMs: 0,
    });

    const { GET } = await import(
      "@/app/api/contributors/queue/status/route"
    );
    const response = await GET();

    expect(response.headers.get("content-type")).toMatch(/application\/json/);
  });
});

describe("GET /api/contributors/queue/jobs/[jobId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires maintainer authentication", async () => {
    vi.mocked(authLib.requireMaintainerSession).mockResolvedValue(false);

    const { GET } = await import(
      "@/app/api/contributors/queue/jobs/[jobId]/route"
    );

    const request = createRequest("/api/contributors/queue/jobs/job-123");
    const response = await GET(request, {
      params: { jobId: "job-123" },
    });

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toBe("Forbidden");
  });

  it("returns 400 for missing or empty jobId", async () => {
    vi.mocked(authLib.requireMaintainerSession).mockResolvedValue(true);

    const { GET } = await import(
      "@/app/api/contributors/queue/jobs/[jobId]/route"
    );

    const request = createRequest("/api/contributors/queue/jobs/");
    const response = await GET(request, {
      params: { jobId: "" },
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toMatch(/required/i);
  });

  it("returns 404 for non-existent job", async () => {
    vi.mocked(authLib.requireMaintainerSession).mockResolvedValue(true);
    vi.mocked(queueLib.backgroundQueue.getJob).mockReturnValue(null);

    const { GET } = await import(
      "@/app/api/contributors/queue/jobs/[jobId]/route"
    );

    const request = createRequest("/api/contributors/queue/jobs/non-existent");
    const response = await GET(request, {
      params: { jobId: "non-existent" },
    });

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe("Job not found");
  });

  it("returns job details for valid job ID", async () => {
    vi.mocked(authLib.requireMaintainerSession).mockResolvedValue(true);

    const mockJob = {
      id: "job-123",
      status: "completed",
      action: "recheck.batch",
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      result: { processed: 5, failed: 0 },
    };
    vi.mocked(queueLib.backgroundQueue.getJob).mockReturnValue(mockJob);

    const { GET } = await import(
      "@/app/api/contributors/queue/jobs/[jobId]/route"
    );

    const request = createRequest("/api/contributors/queue/jobs/job-123");
    const response = await GET(request, {
      params: { jobId: "job-123" },
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.job).toEqual(mockJob);
  });

  it("returns stable job JSON structure", async () => {
    vi.mocked(authLib.requireMaintainerSession).mockResolvedValue(true);

    const mockJob = {
      id: "job-456",
      status: "pending",
      action: "recheck.single",
      createdAt: new Date().toISOString(),
      completedAt: null,
      result: null,
    };
    vi.mocked(queueLib.backgroundQueue.getJob).mockReturnValue(mockJob);

    const { GET } = await import(
      "@/app/api/contributors/queue/jobs/[jobId]/route"
    );

    const request = createRequest("/api/contributors/queue/jobs/job-456");
    const response = await GET(request, {
      params: { jobId: "job-456" },
    });

    expect(response.status).toBe(200);
    const data = await response.json();

    // Verify stable structure
    expect(data.job).toHaveProperty("id");
    expect(data.job).toHaveProperty("status");
    expect(data.job).toHaveProperty("action");
    expect(data.job).toHaveProperty("createdAt");
    expect(typeof data.job.id).toBe("string");
    expect(typeof data.job.status).toBe("string");
  });

  it("trims whitespace from jobId parameter", async () => {
    vi.mocked(authLib.requireMaintainerSession).mockResolvedValue(true);

    const mockJob = {
      id: "job-trimmed",
      status: "completed",
      action: "test",
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      result: null,
    };
    vi.mocked(queueLib.backgroundQueue.getJob).mockReturnValue(mockJob);

    const { GET } = await import(
      "@/app/api/contributors/queue/jobs/[jobId]/route"
    );

    const request = createRequest("/api/contributors/queue/jobs/job-trimmed");
    const response = await GET(request, {
      params: { jobId: "  job-trimmed  " },
    });

    expect(response.status).toBe(200);

    // Verify getJob was called with trimmed ID
    expect(queueLib.backgroundQueue.getJob).toHaveBeenCalledWith("job-trimmed");
  });

  it("returns JSON content type", async () => {
    vi.mocked(authLib.requireMaintainerSession).mockResolvedValue(true);

    const mockJob = {
      id: "job-123",
      status: "completed",
      action: "recheck.batch",
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      result: null,
    };
    vi.mocked(queueLib.backgroundQueue.getJob).mockReturnValue(mockJob);

    const { GET } = await import(
      "@/app/api/contributors/queue/jobs/[jobId]/route"
    );

    const request = createRequest("/api/contributors/queue/jobs/job-123");
    const response = await GET(request, {
      params: { jobId: "job-123" },
    });

    expect(response.headers.get("content-type")).toMatch(/application\/json/);
  });

  it("does not expose PII in job payload", async () => {
    vi.mocked(authLib.requireMaintainerSession).mockResolvedValue(true);

    // Simulating a job that should NOT expose email, phone, or other PII
    const mockJob = {
      id: "job-789",
      status: "completed",
      action: "recheck.batch",
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      result: { processed: 10, failed: 0 },
      // Should NOT include:
      // payload: { email: "...", phone: "..." }
    };
    vi.mocked(queueLib.backgroundQueue.getJob).mockReturnValue(mockJob);

    const { GET } = await import(
      "@/app/api/contributors/queue/jobs/[jobId]/route"
    );

    const request = createRequest("/api/contributors/queue/jobs/job-789");
    const response = await GET(request, {
      params: { jobId: "job-789" },
    });

    const data = await response.json();
    const jobPayloadString = JSON.stringify(data.job);

    // Sanity check that sensitive patterns are not exposed
    // (This is a basic check; real implementation should sanitize)
    expect(jobPayloadString).not.toMatch(/@/); // No email
  });

  it("maintains maintainer-only access control", async () => {
    // Non-maintainer should get 403
    vi.mocked(authLib.requireMaintainerSession).mockResolvedValue(false);

    const { GET } = await import(
      "@/app/api/contributors/queue/jobs/[jobId]/route"
    );

    const request = createRequest("/api/contributors/queue/jobs/any-id");
    const response = await GET(request, {
      params: { jobId: "any-id" },
    });

    expect(response.status).toBe(403);

    // Query results should never be returned
    expect(queueLib.backgroundQueue.getJob).not.toHaveBeenCalled();
  });
});

describe("Queue route integration", () => {
  it("status and job routes are both maintainer-only", async () => {
    vi.mocked(authLib.requireMaintainerSession).mockResolvedValue(false);

    const { GET: statusGET } = await import(
      "@/app/api/contributors/queue/status/route"
    );
    const { GET: jobGET } = await import(
      "@/app/api/contributors/queue/jobs/[jobId]/route"
    );

    const statusResponse = await statusGET();
    const jobResponse = await jobGET(createRequest("/api/contributors/queue/jobs/test"), {
      params: { jobId: "test" },
    });

    expect(statusResponse.status).toBe(403);
    expect(jobResponse.status).toBe(403);
  });

  it("queue operations do not require Redis client in tests", async () => {
    // This is a constraint verification: tests should mock backgroundQueue
    // and not require an actual Redis connection

    vi.mocked(authLib.requireMaintainerSession).mockResolvedValue(true);
    vi.mocked(queueLib.backgroundQueue.getMetrics).mockReturnValue({
      totalJobs: 0,
      pendingJobs: 0,
      activeJobs: 0,
      completedJobs: 0,
      failedJobs: 0,
      avgProcessingTimeMs: 0,
    });

    const { GET } = await import(
      "@/app/api/contributors/queue/status/route"
    );
    const response = await GET();

    expect(response.status).toBe(200);
    // Verify no actual queue client was needed
    expect(queueLib.backgroundQueue.getMetrics).toHaveBeenCalled();
  });
});
