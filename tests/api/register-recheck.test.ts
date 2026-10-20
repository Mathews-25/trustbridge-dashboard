import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/register/recheck/route";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/horizon", () => ({
  checkStellarAddress: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    registration: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/audit", () => ({
  recordAuditLog: vi.fn(),
}));

vi.mock("@/lib/registrations", () => ({
  toContributorRow: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { checkStellarAddress } from "@/lib/horizon";
import { prisma } from "@/lib/prisma";
import { recordAuditLog } from "@/lib/audit";
import { toContributorRow } from "@/lib/registrations";

const sameOriginHeaders: Record<string, string> = {
  origin: "http://localhost:3000",
  host: "localhost:3000",
  "content-type": "application/json",
};

function post(headers?: Record<string, string>) {
  return new NextRequest("http://localhost:3000/api/register/recheck", {
    method: "POST",
    headers: headers ?? sameOriginHeaders,
  });
}

describe("POST /api/register/recheck (self-service)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects cross-origin with CSRF error", async () => {
    const r = post({
      origin: "https://evil.com",
      host: "localhost:3000",
    });
    const res = await POST(r);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("Invalid request origin");
  });

  it("returns 401 for unauthenticated request", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const r = post();
    const res = await POST(r);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Unauthorized");
  });

  it("returns 404 when no registration exists", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user-1", githubUsername: "testuser" },
    } as any);
    vi.mocked(prisma.registration.findFirst).mockResolvedValue(null);

    const r = post();
    const res = await POST(r);
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toContain("No registration found");
  });

  it("successfully rechecks and updates registration", async () => {
    const mockRegistration = {
      id: "reg-1",
      userId: "user-1",
      stellarAddress: "GXXXXXX",
      funded: false,
      trustlineReady: false,
      trustlineAuthorized: false,
      xlmBalance: "0",
      spendableXlmBalance: "0",
      lastCheckedAt: null,
      user: { githubUsername: "testuser" },
    };

    const mockHorizonResult = {
      funded: true,
      trustline: true,
      trustline_authorized: true,
      verified: true,
      xlm_balance: "10",
      spendable_xlm_balance: "9",
      errors: [],
      readiness: "ready" as const,
    };

    const mockUpdatedRegistration = {
      ...mockRegistration,
      funded: true,
      trustlineReady: true,
      trustlineAuthorized: true,
      xlmBalance: "10",
      spendableXlmBalance: "9",
      lastCheckedAt: new Date(),
    };

    const mockContributorRow = {
      id: "reg-1",
      githubUsername: "testuser",
      stellarAddress: "GXXXXXX",
      funded: true,
      trustlineReady: true,
      trustlineAuthorized: true,
      verified: true,
      xlmBalance: "10",
      spendableXlmBalance: "9",
      lastCheckedAt: new Date().toISOString(),
      readiness: "ready" as const,
    };

    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user-1", githubUsername: "testuser" },
    } as any);
    vi.mocked(prisma.registration.findFirst).mockResolvedValue(
      mockRegistration as any
    );
    vi.mocked(checkStellarAddress).mockResolvedValue(mockHorizonResult);
    vi.mocked(prisma.registration.update).mockResolvedValue(
      mockUpdatedRegistration as any
    );
    vi.mocked(toContributorRow).mockReturnValue(mockContributorRow as any);

    const r = post();
    const res = await POST(r);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.contributor).toEqual(mockContributorRow);
    expect(json.check).toEqual(mockHorizonResult);

    // Verify audit log was recorded
    expect(recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "recheck.self_service",
        actorId: "user-1",
        actorLogin: "testuser",
      })
    );
  });

  it("handles Horizon check errors gracefully", async () => {
    const mockRegistration = {
      id: "reg-1",
      userId: "user-1",
      stellarAddress: "GXXXXXX",
      user: { githubUsername: "testuser" },
    };

    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user-1", githubUsername: "testuser" },
    } as any);
    vi.mocked(prisma.registration.findFirst).mockResolvedValue(
      mockRegistration as any
    );
    vi.mocked(checkStellarAddress).mockRejectedValue(
      new Error("Horizon is temporarily unavailable")
    );

    const r = post();
    const res = await POST(r);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toContain("Horizon is temporarily unavailable");
  });
});
