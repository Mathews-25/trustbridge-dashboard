import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

import { DELETE } from "@/app/api/registrations/[id]/route";
import { POST } from "@/app/api/registrations/[id]/restore/route";

vi.mock("@/lib/api-auth", () => ({
  requireMaintainerSession: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { registration: { findFirst: vi.fn(), update: vi.fn() } },
}));
vi.mock("@/lib/audit", () => ({ recordAuditLog: vi.fn() }));

import { requireMaintainerSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { recordAuditLog } from "@/lib/audit";

const headers = {
  origin: "http://localhost:3000",
  host: "localhost:3000",
};

function request(url: string, method: string) {
  return new NextRequest(url, { method, headers });
}

const session = {
  user: { id: "maintainer-1", githubUsername: "maintainer" },
};

describe("registration lifecycle", () => {
  beforeEach(() => vi.clearAllMocks());

  it("soft-deletes an active registration and audits it", async () => {
    const active = {
      id: "reg-1",
      stellarAddress: "GADDRESS",
      deletedAt: null,
    };
    const deleted = { ...active, deletedAt: new Date("2026-08-28T00:00:00Z") };
    vi.mocked(requireMaintainerSession).mockResolvedValue(session as any);
    vi.mocked(prisma.registration.findFirst).mockResolvedValue(active as any);
    vi.mocked(prisma.registration.update).mockResolvedValue(deleted as any);

    const response = await DELETE(
      request("http://localhost:3000/api/registrations/reg-1", "DELETE"),
      { params: { id: "reg-1" } }
    );

    expect(response.status).toBe(200);
    expect(prisma.registration.update).toHaveBeenCalledWith({
      where: { id: "reg-1" },
      data: { deletedAt: expect.any(Date) },
    });
    expect(recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "registration.delete", targetId: "reg-1" })
    );
  });

  it("restores a deleted registration and audits it", async () => {
    const deleted = {
      id: "reg-1",
      stellarAddress: "GADDRESS",
      deletedAt: new Date("2026-08-28T00:00:00Z"),
    };
    const restored = { ...deleted, deletedAt: null };
    vi.mocked(requireMaintainerSession).mockResolvedValue(session as any);
    vi.mocked(prisma.registration.findFirst).mockResolvedValue(deleted as any);
    vi.mocked(prisma.registration.update).mockResolvedValue(restored as any);

    const response = await POST(
      request(
        "http://localhost:3000/api/registrations/reg-1/restore",
        "POST"
      ),
      { params: { id: "reg-1" } }
    );

    expect(response.status).toBe(200);
    expect(prisma.registration.update).toHaveBeenCalledWith({
      where: { id: "reg-1" },
      data: { deletedAt: null },
    });
    expect(recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "registration.restore", targetId: "reg-1" })
    );
  });
});