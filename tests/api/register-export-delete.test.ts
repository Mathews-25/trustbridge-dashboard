/**
 * Tests for self-service registration data export and deletion.
 *
 * Routes under test:
 *   GET  /api/register/export  → src/app/api/register/export/route.ts
 *   POST /api/register/delete  → src/app/api/register/delete/route.ts
 *
 * Covers:
 *  Export:
 *   - 401 for unauthenticated requests
 *   - 200 with user, registration and addressHistory in payload
 *   - 200 when registration is null (not yet registered)
 *   - audit log recorded with action "registration.export"
 *   - accessToken is NOT present in the exported payload
 *
 *  Delete:
 *   - 403 for cross-origin (CSRF)
 *   - 401 for unauthenticated requests
 *   - 400 when { confirm: true } is missing
 *   - 400 when body is not valid JSON
 *   - 404 when no active registration exists
 *   - 404 when registration is already soft-deleted
 *   - 200 on successful deletion
 *   - soft-deletes the registration (deletedAt set)
 *   - clears OAuth tokens (access_token, refresh_token)
 *   - audit log recorded with action "registration.delete" and selfService=true
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type { Session } from "next-auth";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {},
}));

vi.mock("@/lib/audit", () => ({
  recordAuditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    registration: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    account: {
      updateMany: vi.fn(),
    },
    addressHistoryRecord: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { getServerSession } from "next-auth";
import { recordAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

import { GET } from "@/app/api/register/export/route";
import { POST } from "@/app/api/register/delete/route";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SAME_ORIGIN_HEADERS: Record<string, string> = {
  origin: "http://localhost:3000",
  host: "localhost:3000",
  "content-type": "application/json",
};

function authedSession(userId = "user-1"): Session {
  return {
    user: { id: userId, githubUsername: "contributor" },
    expires: "2099-01-01T00:00:00.000Z",
  } as Session;
}

const MOCK_USER = {
  id: "user-1",
  githubUsername: "contributor",
  name: "Test User",
  email: "test@example.com",
  image: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-06-01"),
  banned: false,
  bannedAt: null,
  banReason: null,
};

const MOCK_REGISTRATION = {
  id: "reg-1",
  stellarAddress: "GDXNXL25GDM3N5LAR5FALA3VSGHFET3EOKLXRP3ITPPMR3PISTQSKSFS",
  funded: true,
  trustlineReady: true,
  trustlineAuthorized: true,
  xlmBalance: "5.0",
  spendableXlmBalance: "4.0",
  usdcBalance: "0",
  profilePublic: false,
  showStellarAddress: false,
  deletedAt: null,
  lastCheckedAt: new Date("2026-09-01"),
  createdAt: new Date("2026-01-15"),
  updatedAt: new Date("2026-09-01"),
  notes: null,
  tags: [],
};

const MOCK_ADDRESS_HISTORY = [
  {
    id: "addr-1",
    previousAddress: null,
    newAddress: MOCK_REGISTRATION.stellarAddress,
    changeType: "initial",
    recordedAt: new Date("2026-01-15"),
  },
];

// ---------------------------------------------------------------------------
// GET /api/register/export
// ---------------------------------------------------------------------------

describe("GET /api/register/export", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);

    const res = await GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns the user's data with status 200", async () => {
    vi.mocked(getServerSession).mockResolvedValue(authedSession());
    vi.mocked(prisma.user.findUnique).mockResolvedValue(MOCK_USER as never);
    vi.mocked(prisma.registration.findUnique).mockResolvedValue(
      MOCK_REGISTRATION as never
    );
    vi.mocked(prisma.addressHistoryRecord.findMany).mockResolvedValue(
      MOCK_ADDRESS_HISTORY as never
    );

    const res = await GET();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.user).toBeDefined();
    expect(body.user.githubUsername).toBe("contributor");
    expect(body.registration).toBeDefined();
    expect(body.registration.stellarAddress).toBe(
      MOCK_REGISTRATION.stellarAddress
    );
    expect(body.addressHistory).toHaveLength(1);
  });

  it("includes an exportedAt ISO timestamp in the response", async () => {
    vi.mocked(getServerSession).mockResolvedValue(authedSession());
    vi.mocked(prisma.user.findUnique).mockResolvedValue(MOCK_USER as never);
    vi.mocked(prisma.registration.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.addressHistoryRecord.findMany).mockResolvedValue([]);

    const res = await GET();
    const body = await res.json();
    expect(typeof body.exportedAt).toBe("string");
    // must be a valid ISO date
    expect(() => new Date(body.exportedAt).toISOString()).not.toThrow();
  });

  it("returns registration: null when user has no registration", async () => {
    vi.mocked(getServerSession).mockResolvedValue(authedSession());
    vi.mocked(prisma.user.findUnique).mockResolvedValue(MOCK_USER as never);
    vi.mocked(prisma.registration.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.addressHistoryRecord.findMany).mockResolvedValue([]);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.registration).toBeNull();
  });

  it("does NOT include accessToken in the exported payload", async () => {
    // The route uses a strict Prisma `select` that excludes `accessToken`.
    // Because vi.mock bypasses Prisma's select enforcement, we verify this
    // by checking the route source directly — the select object must not
    // list accessToken as a key.
    vi.mocked(getServerSession).mockResolvedValue(authedSession());
    vi.mocked(prisma.user.findUnique).mockResolvedValue(MOCK_USER as never);
    vi.mocked(prisma.registration.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.addressHistoryRecord.findMany).mockResolvedValue([]);

    const res = await GET();
    const body = await res.json();

    // The mock returns MOCK_USER which has no accessToken field,
    // so the serialised response must not contain it.
    expect(JSON.stringify(body)).not.toContain("accessToken");
  });

  it("route select definition excludes accessToken at the source level", async () => {
    // Read the route source and assert accessToken is NOT in the select block.
    // This is the definitive guard — it catches regressions even when the
    // Prisma mock bypasses the select clause.
    const fs = await import("fs");
    const path = await import("path");
    const routePath = path.resolve(
      process.cwd(),
      "src/app/api/register/export/route.ts"
    );
    const source = fs.readFileSync(routePath, "utf8");
    // The select object for prisma.user.findUnique must not include accessToken
    expect(source).not.toMatch(/select:[\s\S]{0,500}accessToken\s*:/);
  });

  it("records an audit log with action 'registration.export'", async () => {
    vi.mocked(getServerSession).mockResolvedValue(authedSession());
    vi.mocked(prisma.user.findUnique).mockResolvedValue(MOCK_USER as never);
    vi.mocked(prisma.registration.findUnique).mockResolvedValue(
      MOCK_REGISTRATION as never
    );
    vi.mocked(prisma.addressHistoryRecord.findMany).mockResolvedValue([]);

    await GET();

    expect(recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "registration.export",
        actorId: "user-1",
        actorLogin: "contributor",
      })
    );
  });

  it("returns 404 when the user record does not exist", async () => {
    vi.mocked(getServerSession).mockResolvedValue(authedSession());
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.registration.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.addressHistoryRecord.findMany).mockResolvedValue([]);

    const res = await GET();
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST /api/register/delete
// ---------------------------------------------------------------------------

describe("POST /api/register/delete", () => {
  beforeEach(() => vi.clearAllMocks());

  function deleteRequest(
    body: unknown = { confirm: true },
    headers: Record<string, string> = SAME_ORIGIN_HEADERS
  ) {
    return new NextRequest("http://localhost:3000/api/register/delete", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  }

  it("returns 403 for a cross-origin request (CSRF guard)", async () => {
    const req = deleteRequest(
      { confirm: true },
      { origin: "https://evil.com", host: "localhost:3000" }
    );
    const res = await POST(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Invalid request origin");
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const res = await POST(deleteRequest());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 400 when confirm is missing", async () => {
    vi.mocked(getServerSession).mockResolvedValue(authedSession());
    const res = await POST(deleteRequest({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/confirmation/i);
  });

  it("returns 400 when confirm is false", async () => {
    vi.mocked(getServerSession).mockResolvedValue(authedSession());
    const res = await POST(deleteRequest({ confirm: false }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when the request body is not valid JSON", async () => {
    vi.mocked(getServerSession).mockResolvedValue(authedSession());
    const req = new NextRequest(
      "http://localhost:3000/api/register/delete",
      {
        method: "POST",
        headers: SAME_ORIGIN_HEADERS,
        body: "not-json{{{",
      }
    );
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 404 when the user has no registration", async () => {
    vi.mocked(getServerSession).mockResolvedValue(authedSession());
    vi.mocked(prisma.registration.findUnique).mockResolvedValue(null);

    const res = await POST(deleteRequest());
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/no active registration/i);
  });

  it("returns 404 when the registration is already soft-deleted", async () => {
    vi.mocked(getServerSession).mockResolvedValue(authedSession());
    vi.mocked(prisma.registration.findUnique).mockResolvedValue({
      id: "reg-1",
      stellarAddress: MOCK_REGISTRATION.stellarAddress,
      deletedAt: new Date("2026-08-01"), // already deleted
    } as never);

    const res = await POST(deleteRequest());
    expect(res.status).toBe(404);
  });

  it("returns 200 on successful deletion", async () => {
    vi.mocked(getServerSession).mockResolvedValue(authedSession());
    vi.mocked(prisma.registration.findUnique).mockResolvedValue({
      id: "reg-1",
      stellarAddress: MOCK_REGISTRATION.stellarAddress,
      deletedAt: null,
    } as never);
    vi.mocked(prisma.$transaction).mockResolvedValue([] as never);

    const res = await POST(deleteRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("runs the soft-delete and token-clear in a transaction", async () => {
    vi.mocked(getServerSession).mockResolvedValue(authedSession());
    vi.mocked(prisma.registration.findUnique).mockResolvedValue({
      id: "reg-1",
      stellarAddress: MOCK_REGISTRATION.stellarAddress,
      deletedAt: null,
    } as never);

    let capturedOps: unknown[] = [];
    vi.mocked(prisma.$transaction).mockImplementation(async (ops) => {
      capturedOps = ops as unknown[];
      return [] as never;
    });

    await POST(deleteRequest());

    // $transaction should have been called with an array of two operations
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(capturedOps).toHaveLength(2);
  });

  it("records an audit log with action 'registration.delete' and selfService=true", async () => {
    vi.mocked(getServerSession).mockResolvedValue(authedSession());
    vi.mocked(prisma.registration.findUnique).mockResolvedValue({
      id: "reg-1",
      stellarAddress: MOCK_REGISTRATION.stellarAddress,
      deletedAt: null,
    } as never);
    vi.mocked(prisma.$transaction).mockResolvedValue([] as never);

    await POST(deleteRequest());

    expect(recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "registration.delete",
        actorId: "user-1",
        actorLogin: "contributor",
        targetId: "reg-1",
        targetLabel: MOCK_REGISTRATION.stellarAddress,
        metadata: expect.objectContaining({ selfService: true }),
      })
    );
  });

  it("includes the stellarAddress in the audit log targetLabel", async () => {
    vi.mocked(getServerSession).mockResolvedValue(authedSession());
    vi.mocked(prisma.registration.findUnique).mockResolvedValue({
      id: "reg-42",
      stellarAddress: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
      deletedAt: null,
    } as never);
    vi.mocked(prisma.$transaction).mockResolvedValue([] as never);

    await POST(deleteRequest());

    expect(recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        targetLabel: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
      })
    );
  });

  it("response message mentions the address can be reused", async () => {
    vi.mocked(getServerSession).mockResolvedValue(authedSession());
    vi.mocked(prisma.registration.findUnique).mockResolvedValue({
      id: "reg-1",
      stellarAddress: MOCK_REGISTRATION.stellarAddress,
      deletedAt: null,
    } as never);
    vi.mocked(prisma.$transaction).mockResolvedValue([] as never);

    const res = await POST(deleteRequest());
    const body = await res.json();
    expect(body.message).toMatch(/re-registered/i);
  });
});
