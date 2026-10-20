import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { GET as getBadge } from "@/app/api/badge/[username]/route";
import { signBadge } from "@/lib/badge-signing";
import { resetRateLimit } from "@/lib/rate-limit";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const SECRET_KEY = "test-badge-signing-key-32-chars-long";

function createBadgeRequest(username: string, sig?: string, exp?: number, ip = "1.2.3.4") {
  const url = new URL(`http://localhost:3000/api/badge/${username}`);
  if (sig !== undefined) url.searchParams.set("sig", sig);
  if (exp !== undefined) url.searchParams.set("exp", exp.toString());

  return new NextRequest(url.toString(), {
    method: "GET",
    headers: { "x-forwarded-for": ip },
  });
}

const readyRegistration = {
  profilePublic: true,
  funded: true,
  trustlineReady: true,
  trustlineAuthorized: true,
  xlmBalance: "10",
  spendableXlmBalance: "8",
  deletedAt: null,
};

// ---------------------------------------------------------------------------
// Integration Tests: GET /api/badge/[username]
// ---------------------------------------------------------------------------
describe("GET /api/badge/[username]", () => {
  beforeEach(() => {
    resetRateLimit();
    vi.clearAllMocks();
    process.env.BADGE_SIGNING_KEY = SECRET_KEY;
  });

  it("returns 403 when signature (sig) query param is missing", async () => {
    const req = createBadgeRequest("alice");
    const res = await getBadge(req, { params: { username: "alice" } });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Invalid badge signature");
  });

  it("returns 403 when signature is invalid or tampered", async () => {
    const validSig = signBadge("alice");
    const tamperedSig = validSig.substring(0, 63) + (validSig.endsWith("0") ? "1" : "0");
    const req = createBadgeRequest("alice", tamperedSig);
    const res = await getBadge(req, { params: { username: "alice" } });
    expect(res.status).toBe(403);
  });

  it("returns 403 when signature is signed for a different username", async () => {
    const sigForBob = signBadge("bob");
    const req = createBadgeRequest("alice", sigForBob);
    const res = await getBadge(req, { params: { username: "alice" } });
    expect(res.status).toBe(403);
  });

  it("returns 403 when signature expiration timestamp has passed", async () => {
    const pastExp = Math.floor(Date.now() / 1000) - 100;
    const sig = signBadge("alice", pastExp);
    const req = createBadgeRequest("alice", sig, pastExp);
    const res = await getBadge(req, { params: { username: "alice" } });
    expect(res.status).toBe(403);
  });

  it("returns 404 when user does not exist", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    const sig = signBadge("nobody");
    const req = createBadgeRequest("nobody", sig);
    const res = await getBadge(req, { params: { username: "nobody" } });
    expect(res.status).toBe(404);
  });

  it("returns 404 when registration is private (profilePublic=false)", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      githubUsername: "alice",
      registration: { ...readyRegistration, profilePublic: false },
    } as any);
    const sig = signBadge("alice");
    const req = createBadgeRequest("alice", sig);
    const res = await getBadge(req, { params: { username: "alice" } });
    expect(res.status).toBe(404);
  });

  it("returns 404 when registration is soft-deleted", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      githubUsername: "alice",
      registration: { ...readyRegistration, deletedAt: new Date() },
    } as any);
    const sig = signBadge("alice");
    const req = createBadgeRequest("alice", sig);
    const res = await getBadge(req, { params: { username: "alice" } });
    expect(res.status).toBe(404);
  });

  it("returns 404 for invalid username format", async () => {
    const invalidUsername = "a".repeat(40);
    const sig = signBadge(invalidUsername);
    const req = createBadgeRequest(invalidUsername, sig);
    const res = await getBadge(req, { params: { username: invalidUsername } });
    expect(res.status).toBe(404);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("returns 200 OK + SVG badge for valid signature and opt-in public profile", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      githubUsername: "alice",
      registration: readyRegistration,
    } as any);

    const sig = signBadge("alice");
    const req = createBadgeRequest("alice", sig);
    const res = await getBadge(req, { params: { username: "alice" } });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/svg+xml; charset=utf-8");
    expect(res.headers.get("Cache-Control")).toContain("public");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");

    const svg = await res.text();
    expect(svg).toContain("<svg");
    expect(svg).toContain("ready");
    expect(svg).toContain("#2ea44f");
    // Crucial safety check: ensure no address is leaked in SVG
    expect(svg).not.toMatch(/G[A-Z0-9]{55}/);
  });

  it("returns 200 OK with valid unexpired exp parameter", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      githubUsername: "alice",
      registration: readyRegistration,
    } as any);

    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    const sig = signBadge("alice", futureExp);
    const req = createBadgeRequest("alice", sig, futureExp);
    const res = await getBadge(req, { params: { username: "alice" } });

    expect(res.status).toBe(200);
  });

  it("returns 429 when rate limit (30 req/min) is exceeded", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      githubUsername: "alice",
      registration: readyRegistration,
    } as any);
    const sig = signBadge("alice");

    for (let i = 0; i < 30; i++) {
      const req = createBadgeRequest("alice", sig, undefined, "9.9.9.9");
      await getBadge(req, { params: { username: "alice" } });
    }

    const rateLimitedReq = createBadgeRequest("alice", sig, undefined, "9.9.9.9");
    const res = await getBadge(rateLimitedReq, { params: { username: "alice" } });
    expect(res.status).toBe(429);
  });
});
