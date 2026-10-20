/**
 * API tests for /api/contributors/queue/progress (SSE)
 *
 * Tests the Server-Sent Events endpoint that streams queue job progress:
 * - GET /api/contributors/queue/progress?jobId=...
 *
 * These routes:
 * - Require maintainer authentication (403 otherwise, queue untouched)
 * - Validate the jobId query parameter (400 otherwise)
 * - Respond with text/event-stream headers
 * - Stream an initial `status` event, then poll the job until it reaches a
 *   terminal state, emitting `processing` heartbeats while it runs
 * - Hide other maintainers' jobs behind a generic "Job not found" event
 *   (no ownership information leak)
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

function signInAs(userId: string) {
  vi.mocked(authLib.requireMaintainerSession).mockResolvedValue({
    user: { id: userId },
  });
}

const FIXED_DATE = new Date("2026-01-01T00:00:00.000Z");
const FIXED_ISO = "2026-01-01T00:00:00.000Z";

function makeJob(overrides: Record<string, unknown> = {}) {
  return {
    id: "job-1",
    status: "pending",
    createdAt: FIXED_DATE,
    startedAt: null,
    completedAt: null,
    ownerId: "user-1",
    result: null,
    error: null,
    ...overrides,
  };
}

type SseEvent = { type: string } & Record<string, unknown>;

/**
 * Reads an SSE response body until the stream closes, then parses the
 * `data: <json>\n\n` frames into event objects (also returning the raw
 * wire text so tests can assert SSE framing).
 */
async function collectEvents(response: Response): Promise<{
  events: SseEvent[];
  raw: string;
}> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let raw = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    raw += decoder.decode(value, { stream: true });
  }
  raw += decoder.decode();

  const events = raw
    .split("\n\n")
    .filter((block) => block.trim() !== "")
    .map((block) => {
      const dataLine = block
        .split("\n")
        .find((line) => line.startsWith("data: "));
      if (!dataLine) {
        throw new Error(`SSE block is missing a data line: ${JSON.stringify(block)}`);
      }
      return JSON.parse(dataLine.slice("data: ".length)) as SseEvent;
    });

  return { events, raw };
}

describe("GET /api/contributors/queue/progress — auth & validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 for unauthenticated requests without touching the queue", async () => {
    vi.mocked(authLib.requireMaintainerSession).mockResolvedValue(null);

    const { GET } = await import(
      "@/app/api/contributors/queue/progress/route"
    );
    const request = createRequest(
      "/api/contributors/queue/progress?jobId=job-1"
    );
    const response = await GET(request);

    expect(response.status).toBe(403);
    expect(response.headers.get("content-type")).toMatch(/application\/json/);
    const data = await response.json();
    expect(data.error).toBe("Forbidden");
    expect(queueLib.backgroundQueue.getJob).not.toHaveBeenCalled();
  });

  it("returns 400 when the jobId query parameter is missing", async () => {
    signInAs("user-1");

    const { GET } = await import(
      "@/app/api/contributors/queue/progress/route"
    );
    const request = createRequest("/api/contributors/queue/progress");
    const response = await GET(request);

    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toMatch(/application\/json/);
    const data = await response.json();
    expect(data.error).toMatch(/required/i);
    expect(queueLib.backgroundQueue.getJob).not.toHaveBeenCalled();
  });

  it("returns 400 when jobId is an empty string", async () => {
    signInAs("user-1");

    const { GET } = await import(
      "@/app/api/contributors/queue/progress/route"
    );
    const request = createRequest("/api/contributors/queue/progress?jobId=");
    const response = await GET(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toMatch(/required/i);
    expect(queueLib.backgroundQueue.getJob).not.toHaveBeenCalled();
  });

  it("returns 400 when jobId is only whitespace", async () => {
    signInAs("user-1");

    const { GET } = await import(
      "@/app/api/contributors/queue/progress/route"
    );
    const request = createRequest(
      `/api/contributors/queue/progress?jobId=${encodeURIComponent("   ")}`
    );
    const response = await GET(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toMatch(/required/i);
    expect(queueLib.backgroundQueue.getJob).not.toHaveBeenCalled();
  });

  it("trims whitespace from jobId before looking up the job", async () => {
    signInAs("user-1");
    vi.mocked(queueLib.backgroundQueue.getJob).mockReturnValue(
      makeJob({ status: "completed", completedAt: FIXED_DATE })
    );

    const { GET } = await import(
      "@/app/api/contributors/queue/progress/route"
    );
    const request = createRequest(
      `/api/contributors/queue/progress?jobId=${encodeURIComponent("  job-1  ")}`
    );
    const response = await GET(request);

    expect(response.status).toBe(200);
    const { events } = await collectEvents(response);
    expect(events.map((event) => event.type)).toEqual(["status", "completed"]);
    expect(queueLib.backgroundQueue.getJob).toHaveBeenCalledWith("job-1");
  });
});

describe("GET /api/contributors/queue/progress — SSE headers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("responds 200 with text/event-stream, no-cache and keep-alive", async () => {
    signInAs("user-1");
    vi.mocked(queueLib.backgroundQueue.getJob).mockReturnValue(
      makeJob({ status: "completed", completedAt: FIXED_DATE })
    );

    const { GET } = await import(
      "@/app/api/contributors/queue/progress/route"
    );
    const request = createRequest("/api/contributors/queue/progress?jobId=job-1");
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    expect(response.headers.get("cache-control")).toBe("no-cache");
    expect(response.headers.get("connection")).toBe("keep-alive");

    // Drain the stream so the request does not leak an open controller
    await collectEvents(response);
  });
});

describe("GET /api/contributors/queue/progress — event stream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("emits a single error event (SSE-framed) when the job does not exist", async () => {
    signInAs("user-1");
    vi.mocked(queueLib.backgroundQueue.getJob).mockReturnValue(null);

    const { GET } = await import(
      "@/app/api/contributors/queue/progress/route"
    );
    const request = createRequest(
      "/api/contributors/queue/progress?jobId=missing"
    );
    const response = await GET(request);
    const { events, raw } = await collectEvents(response);

    expect(events).toEqual([
      { type: "error", message: "Job not found" },
    ]);
    // Wire format is a single `data: <json>\n\n` frame
    expect(raw).toBe('data: {"type":"error","message":"Job not found"}\n\n');
  });

  it("hides jobs owned by another maintainer behind the same not-found error", async () => {
    signInAs("user-1");
    vi.mocked(queueLib.backgroundQueue.getJob).mockReturnValue(
      makeJob({ ownerId: "maintainer-2" })
    );

    const { GET } = await import(
      "@/app/api/contributors/queue/progress/route"
    );
    const request = createRequest("/api/contributors/queue/progress?jobId=job-1");
    const response = await GET(request);
    const { events, raw } = await collectEvents(response);

    expect(events).toEqual([
      { type: "error", message: "Job not found" },
    ]);
    // No ownership information leak
    expect(raw).not.toContain("maintainer-2");
    expect(raw).not.toContain("ownerId");
  });

  it("streams the initial status event then a completed event for a finished job", async () => {
    signInAs("user-1");
    vi.mocked(queueLib.backgroundQueue.getJob).mockReturnValue(
      makeJob({
        status: "completed",
        completedAt: FIXED_DATE,
        result: { refreshed: 3 },
      })
    );

    const { GET } = await import(
      "@/app/api/contributors/queue/progress/route"
    );
    const request = createRequest("/api/contributors/queue/progress?jobId=job-1");
    const response = await GET(request);
    const { events, raw } = await collectEvents(response);

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({
      type: "status",
      jobId: "job-1",
      status: "completed",
      createdAt: FIXED_ISO,
      startedAt: null,
    });
    expect(events[1]).toEqual({
      type: "completed",
      jobId: "job-1",
      result: { refreshed: 3 },
      completedAt: FIXED_ISO,
    });
    expect(raw.endsWith("\n\n")).toBe(true);
  });

  it("streams a failed event carrying the error for a failed job", async () => {
    signInAs("user-1");
    vi.mocked(queueLib.backgroundQueue.getJob).mockReturnValue(
      makeJob({
        status: "failed",
        completedAt: FIXED_DATE,
        error: "Recheck failed",
      })
    );

    const { GET } = await import(
      "@/app/api/contributors/queue/progress/route"
    );
    const request = createRequest("/api/contributors/queue/progress?jobId=job-1");
    const response = await GET(request);
    const { events } = await collectEvents(response);

    expect(events.map((event) => event.type)).toEqual(["status", "failed"]);
    expect(events[1]).toEqual({
      type: "failed",
      jobId: "job-1",
      error: "Recheck failed",
      completedAt: FIXED_ISO,
    });
  });

  it("emits processing heartbeats while polling until the job completes", async () => {
    vi.useFakeTimers();
    try {
      signInAs("user-1");
      const sequence = [
        makeJob({ status: "processing", startedAt: FIXED_DATE }),
        makeJob({ status: "processing", startedAt: FIXED_DATE }),
        makeJob({
          status: "completed",
          completedAt: FIXED_DATE,
          result: { refreshed: 3 },
        }),
      ];
      let call = 0;
      vi.mocked(queueLib.backgroundQueue.getJob).mockImplementation(() => {
        const job = sequence[Math.min(call, sequence.length - 1)];
        call += 1;
        return job;
      });

      const { GET } = await import(
        "@/app/api/contributors/queue/progress/route"
      );
      const request = createRequest(
        "/api/contributors/queue/progress?jobId=job-1"
      );
      const response = await GET(request);

      // Drive the stream: one 1s poll between the processing heartbeat and
      // the terminal event.
      const reading = collectEvents(response);
      await vi.advanceTimersByTimeAsync(1500);
      const { events } = await reading;

      expect(events.map((event) => event.type)).toEqual([
        "status",
        "processing",
        "completed",
      ]);
      expect(events[0]).toEqual({
        type: "status",
        jobId: "job-1",
        status: "processing",
        createdAt: FIXED_ISO,
        startedAt: FIXED_ISO,
      });
      expect(events[1]).toEqual({
        type: "processing",
        jobId: "job-1",
        startedAt: FIXED_ISO,
      });
      // initial lookup + one poll that saw "processing" + one that saw "completed"
      expect(queueLib.backgroundQueue.getJob).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("emits an error event if the job disappears between polls", async () => {
    signInAs("user-1");
    vi.mocked(queueLib.backgroundQueue.getJob)
      .mockReturnValueOnce(makeJob({ status: "pending" }))
      .mockReturnValue(null);

    const { GET } = await import(
      "@/app/api/contributors/queue/progress/route"
    );
    const request = createRequest("/api/contributors/queue/progress?jobId=job-1");
    const response = await GET(request);
    const { events } = await collectEvents(response);

    expect(events.map((event) => event.type)).toEqual(["status", "error"]);
    expect(events[1]).toEqual({
      type: "error",
      message: "Job not found",
    });
  });

  it("allows streaming jobs without an ownerId (legacy/public jobs)", async () => {
    signInAs("user-1");
    vi.mocked(queueLib.backgroundQueue.getJob).mockReturnValue(
      makeJob({
        ownerId: undefined,
        status: "completed",
        completedAt: FIXED_DATE,
        result: { refreshed: 1 },
      })
    );

    const { GET } = await import(
      "@/app/api/contributors/queue/progress/route"
    );
    const request = createRequest("/api/contributors/queue/progress?jobId=job-1");
    const response = await GET(request);
    const { events } = await collectEvents(response);

    expect(events.map((event) => event.type)).toEqual(["status", "completed"]);
  });
});
