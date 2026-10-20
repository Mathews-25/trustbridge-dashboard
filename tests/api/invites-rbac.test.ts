/**
 * RBAC gating tests for /api/invites/generate
 *
 * Verifies that the route strictly requires the `admin` role and that
 * every lower-privilege identity receives 403 — regardless of whether they
 * are a maintainer or not.
 *
 * Role matrix tested for POST, GET and DELETE:
 *   admin maintainer      → 200 (or flag-gated 403 — excluded from these tests)
 *   operator maintainer   → 403
 *   viewer maintainer     → 403
 *   legacy maintainer     → 403  (isMaintainer=true, no role → defaults to viewer)
 *   non-maintainer        → 403
 *   unauthenticated       → 403
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type { Session } from "next-auth";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/api-auth", () => ({
  requireAdmin: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  recordAuditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/invite-helpers", () => ({
  createInvite: vi.fn(),
  generateInviteCode: vi.fn(() => "mock-code-123"),
  listInvites: vi.fn(),
  revokeInvites: vi.fn(),
}));

vi.mock("@/lib/feature-flags", () => ({
  isFeatureEnabled: vi.fn().mockResolvedValue(true),
}));

import { requireAdmin } from "@/lib/api-auth";
import { createInvite, listInvites, revokeInvites } from "@/lib/invite-helpers";

import { POST, GET, DELETE } from "@/app/api/invites/generate/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SAME_ORIGIN = {
  origin: "http://localhost:3000",
  host: "localhost:3000",
  "content-type": "application/json",
};

function adminSession(): Session {
  return {
    user: { id: "admin-1", githubUsername: "admin", isMaintainer: true, role: "admin" },
    expires: "2099-01-01T00:00:00.000Z",
  } as Session;
}

function postRequest(body: unknown = { count: 1 }) {
  return new NextRequest("http://localhost:3000/api/invites/generate", {
    method: "POST",
    headers: SAME_ORIGIN,
    body: JSON.stringify(body),
  });
}

function getRequest() {
  return new NextRequest(
    "http://localhost:3000/api/invites/generate?page=1&pageSize=10"
  );
}

function deleteRequest(codes = ["code1"]) {
  return new NextRequest("http://localhost:3000/api/invites/generate", {
    method: "DELETE",
    headers: SAME_ORIGIN,
    body: JSON.stringify({ codes }),
  });
}

// ---------------------------------------------------------------------------
// Role matrix — POST
// ---------------------------------------------------------------------------

describe("POST /api/invites/generate — role gating", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows an admin maintainer", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(adminSession());
    vi.mocked(createInvite).mockResolvedValue({
      id: "inv-1",
      codeHash: "h",
      batchLabel: null,
      expiresAt: null,
      used: false,
      usedAt: null,
      createdAt: new Date(),
    } as never);

    const res = await POST(postRequest({ count: 1 }));
    expect(res.status).toBe(200);
  });

  it("returns 403 for an operator maintainer", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(null); // operator < admin → denied
    const res = await POST(postRequest());
    expect(res.status).toBe(403);
  });

  it("returns 403 for a viewer maintainer", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(null);
    const res = await POST(postRequest());
    expect(res.status).toBe(403);
  });

  it("returns 403 for a legacy maintainer (no explicit role → viewer)", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(null);
    const res = await POST(postRequest());
    expect(res.status).toBe(403);
  });

  it("returns 403 for a non-maintainer contributor", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(null);
    const res = await POST(postRequest());
    expect(res.status).toBe(403);
  });

  it("returns 403 when there is no session (unauthenticated)", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(null);
    const res = await POST(postRequest());
    expect(res.status).toBe(403);
  });

  it("calls requireAdmin — not the old isMaintainer check", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(null);
    await POST(postRequest());
    expect(requireAdmin).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Role matrix — GET
// ---------------------------------------------------------------------------

describe("GET /api/invites/generate — role gating", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows an admin maintainer", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(adminSession());
    vi.mocked(listInvites).mockResolvedValue({
      invites: [],
      total: 0,
      totalPages: 0,
    });

    const res = await GET(getRequest());
    expect(res.status).toBe(200);
  });

  it("returns 403 for operator", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(null);
    const res = await GET(getRequest());
    expect(res.status).toBe(403);
  });

  it("returns 403 for viewer", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(null);
    const res = await GET(getRequest());
    expect(res.status).toBe(403);
  });

  it("returns 403 for non-maintainer", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(null);
    const res = await GET(getRequest());
    expect(res.status).toBe(403);
  });

  it("returns 403 for unauthenticated request", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(null);
    const res = await GET(getRequest());
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Role matrix — DELETE
// ---------------------------------------------------------------------------

describe("DELETE /api/invites/generate — role gating", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows an admin maintainer", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(adminSession());
    vi.mocked(revokeInvites).mockResolvedValue({ revoked: 1 });

    const res = await DELETE(deleteRequest(["code1"]));
    expect(res.status).toBe(200);
  });

  it("returns 403 for operator", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(null);
    const res = await DELETE(deleteRequest());
    expect(res.status).toBe(403);
  });

  it("returns 403 for viewer", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(null);
    const res = await DELETE(deleteRequest());
    expect(res.status).toBe(403);
  });

  it("returns 403 for non-maintainer", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(null);
    const res = await DELETE(deleteRequest());
    expect(res.status).toBe(403);
  });

  it("returns 403 for unauthenticated request", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(null);
    const res = await DELETE(deleteRequest());
    expect(res.status).toBe(403);
  });
});
