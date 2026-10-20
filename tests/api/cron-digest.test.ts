import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Tests for POST /api/cron/digest and GET /api/cron/digest.
 *
 * Tests verify:
 * - 403 when no session and no CRON_SECRET
 * - 200 with valid CRON_SECRET bearer token (no session)
 * - 403 with wrong bearer token
 * - 200 with maintainer session (no CRON_SECRET)
 * - 502 when runCronDigest returns status: "error"
 * - 200 with status: "skipped" (rate-limited)
 * - GET returns last digest health state (unauthenticated)
 *
 * Watch for: PII in response body, actorLogin propagation.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────────────────────────────────────

vi.mock("@/lib/api-auth", () => ({
  requireMaintainerSession: vi.fn(),
  isAuthorizedScheduler: vi.fn((req: NextRequest) => {
    const secret = process.env.CRON_SECRET?.trim();
    if (!secret) return false;
    return req.headers.get("authorization") === `Bearer ${secret}`;
  }),
}));

vi.mock("@/lib/cron-digest", () => ({
  runCronDigest: vi.fn(),
  getLastDigestHealth: vi.fn(),
}));

import { requireMaintainerSession } from "@/lib/api-auth";
import { getLastDigestHealth, runCronDigest } from "@/lib/cron-digest";
import { GET, POST } from "@/app/api/cron/digest/route";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function post(headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost:3000/api/cron/digest", {
    method: "POST",
    headers: { host: "localhost:3000", ...headers },
  });
}

function get() {
  return new NextRequest("http://localhost:3000/api/cron/digest", {
    method: "GET",
    headers: { host: "localhost:3000" },
  });
}

const mockOkResult = {
  status: "ok" as const,
  startedAt: new Date().toISOString(),
  durationMs: 42,
  cadence: "daily" as const,
  totalContributors: 5,
  readyCount: 3,
  lowReserveCount: 1,
  notReadyCount: 2,
  destination: "ops@example.com",
  emailSent: true,
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/cron/digest
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/cron/digest", () => {
  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.CRON_SECRET;
  });

  // ── Authorization ───────────────────────────────────────────────────────────

  it("returns 403 when no session and no CRON_SECRET provided", async () => {
    vi.mocked(requireMaintainerSession).mockResolvedValue(null);

    const res = await POST(post());

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("Forbidden");
    expect(runCronDigest).not.toHaveBeenCalled();
  });

  it("returns 403 with an invalid CRON_SECRET", async () => {
    process.env.CRON_SECRET = "correct-secret";
    vi.mocked(requireMaintainerSession).mockResolvedValue(null);

    const res = await POST(post({ authorization: "Bearer wrong-secret" }));

    expect(res.status).toBe(403);
    expect(runCronDigest).not.toHaveBeenCalled();
  });

  it("allows a request with a valid CRON_SECRET (no session)", async () => {
    process.env.CRON_SECRET = "cron-token-abc";
    vi.mocked(requireMaintainerSession).mockResolvedValue(null);
    vi.mocked(runCronDigest).mockResolvedValue(mockOkResult);

    const res = await POST(post({ authorization: "Bearer cron-token-abc" }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("ok");
  });

  it("passes actorLogin as scheduler:cron when authenticated via CRON_SECRET", async () => {
    process.env.CRON_SECRET = "cron-token-abc";
    vi.mocked(requireMaintainerSession).mockResolvedValue(null);
    vi.mocked(runCronDigest).mockResolvedValue(mockOkResult);

    await POST(post({ authorization: "Bearer cron-token-abc" }));

    expect(runCronDigest).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: null,
        actorLogin: "scheduler:cron",
      })
    );
  });

  it("allows a maintainer session without CRON_SECRET", async () => {
    vi.mocked(requireMaintainerSession).mockResolvedValue({
      user: { id: "m-1", githubUsername: "alice", isMaintainer: true },
    } as never);
    vi.mocked(runCronDigest).mockResolvedValue(mockOkResult);

    const res = await POST(post());

    expect(res.status).toBe(200);
    expect(runCronDigest).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "m-1",
        actorLogin: "alice",
      })
    );
  });

  // ── Response shape ──────────────────────────────────────────────────────────

  it("returns 200 with the digest result on success", async () => {
    process.env.CRON_SECRET = "cron-token-abc";
    vi.mocked(requireMaintainerSession).mockResolvedValue(null);
    vi.mocked(runCronDigest).mockResolvedValue(mockOkResult);

    const res = await POST(post({ authorization: "Bearer cron-token-abc" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.totalContributors).toBe(5);
    expect(json.readyCount).toBe(3);
    expect(json.notReadyCount).toBe(2);
    expect(json.emailSent).toBe(true);
    expect(json.destination).toBe("ops@example.com");
  });

  it("returns 502 when digest returns status: error", async () => {
    process.env.CRON_SECRET = "cron-token-abc";
    vi.mocked(requireMaintainerSession).mockResolvedValue(null);
    vi.mocked(runCronDigest).mockResolvedValue({
      status: "error",
      startedAt: new Date().toISOString(),
      durationMs: 5,
      error: "Database connection failed",
    });

    const res = await POST(post({ authorization: "Bearer cron-token-abc" }));

    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error).toBe("Database connection failed");
  });

  it("returns 200 when digest is rate-limited (skipped)", async () => {
    process.env.CRON_SECRET = "cron-token-abc";
    vi.mocked(requireMaintainerSession).mockResolvedValue(null);
    vi.mocked(runCronDigest).mockResolvedValue({
      status: "skipped",
      startedAt: new Date().toISOString(),
      durationMs: 0,
      error: "Rate limited: minimum interval between digests is 3600000ms",
    });

    const res = await POST(post({ authorization: "Bearer cron-token-abc" }));

    // "skipped" is not an error — return 200 so the scheduler doesn't retry
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("skipped");
  });

  it("response body does not contain contributor PII by default", async () => {
    process.env.CRON_SECRET = "cron-token-abc";
    vi.mocked(requireMaintainerSession).mockResolvedValue(null);
    vi.mocked(runCronDigest).mockResolvedValue({
      ...mockOkResult,
      // notReadyList intentionally absent (privacy default)
    });

    const res = await POST(post({ authorization: "Bearer cron-token-abc" }));
    const text = await res.text();

    expect(text).not.toContain("githubUsername");
    expect(text).not.toContain("stellarAddress");
    expect(text).not.toContain("notReadyList");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cron/digest
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/cron/digest", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns null lastRun when no digest has run yet", async () => {
    vi.mocked(getLastDigestHealth).mockReturnValue(null);

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.lastRun).toBeNull();
  });

  it("returns the most recent digest result", async () => {
    vi.mocked(getLastDigestHealth).mockReturnValue(mockOkResult);

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.lastRun.totalContributors).toBe(5);
    expect(json.lastRun.status).toBe("ok");
  });

  it("is unauthenticated — no session check needed", async () => {
    vi.mocked(getLastDigestHealth).mockReturnValue(null);

    // Should succeed without a session being provided
    const res = await GET();
    expect(res.status).toBe(200);
    expect(requireMaintainerSession).not.toHaveBeenCalled();
  });
});
