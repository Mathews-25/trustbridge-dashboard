import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { GET } from "@/app/api/registrations/deleted/route";

vi.mock("@/lib/api-auth", () => ({
  requireMaintainerSession: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    registration: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/cursor-pagination", () => ({
  encodeCursor: (id: string) => Buffer.from(id).toString("base64"),
  decodeCursor: (cursor: string) => Buffer.from(cursor, "base64").toString("utf-8"),
}));

import { requireMaintainerSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

const headers = {
  origin: "http://localhost:3000",
  host: "localhost:3000",
};

function request(url: string) {
  return new NextRequest(url, { method: "GET", headers });
}

const maintainerSession = {
  user: { id: "maintainer-1", githubUsername: "maintainer", isMaintainer: true },
};

const mockDeletedRegistrations = [
  {
    id: "reg-1",
    stellarAddress: "GADDRESS1",
    userId: "user-1",
    user: { githubUsername: "contributor1" },
    deletedAt: new Date("2026-08-28T00:00:00Z"),
    createdAt: new Date("2026-08-01T00:00:00Z"),
    updatedAt: new Date("2026-08-28T00:00:00Z"),
  },
  {
    id: "reg-2",
    stellarAddress: "GADDRESS2",
    userId: "user-2",
    user: { githubUsername: "contributor2" },
    deletedAt: new Date("2026-08-27T00:00:00Z"),
    createdAt: new Date("2026-07-01T00:00:00Z"),
    updatedAt: new Date("2026-08-27T00:00:00Z"),
  },
];

describe("GET /api/registrations/deleted", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 403 for non-maintainers", async () => {
    vi.mocked(requireMaintainerSession).mockResolvedValue(null);

    const response = await GET(request("http://localhost:3000/api/registrations/deleted"));

    expect(response.status).toBe(403);
    expect(prisma.registration.findMany).not.toHaveBeenCalled();
  });

  it("returns soft-deleted registrations for maintainers", async () => {
    vi.mocked(requireMaintainerSession).mockResolvedValue(maintainerSession as any);
    vi.mocked(prisma.registration.findMany).mockResolvedValue(mockDeletedRegistrations as any);

    const response = await GET(request("http://localhost:3000/api/registrations/deleted"));

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.registrations).toHaveLength(2);
    expect(json.registrations[0].id).toBe("reg-1");
    expect(json.registrations[0].deletedAt).toBeDefined();
    expect(json.hasMore).toBe(false);
    expect(json.nextCursor).toBeUndefined();
  });

  it("passes correct where clause to find only deleted registrations", async () => {
    vi.mocked(requireMaintainerSession).mockResolvedValue(maintainerSession as any);
    vi.mocked(prisma.registration.findMany).mockResolvedValue([]);

    await GET(request("http://localhost:3000/api/registrations/deleted"));

    expect(prisma.registration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deletedAt: { not: null } },
      })
    );
  });

  it("supports limit parameter", async () => {
    vi.mocked(requireMaintainerSession).mockResolvedValue(maintainerSession as any);
    vi.mocked(prisma.registration.findMany).mockResolvedValue([]);

    await GET(request("http://localhost:3000/api/registrations/deleted?limit=50"));

    expect(prisma.registration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 51,
      })
    );
  });

  it("caps limit at 100", async () => {
    vi.mocked(requireMaintainerSession).mockResolvedValue(maintainerSession as any);
    vi.mocked(prisma.registration.findMany).mockResolvedValue([]);

    await GET(request("http://localhost:3000/api/registrations/deleted?limit=500"));

    expect(prisma.registration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 101,
      })
    );
  });

  it("uses default limit of 25 when not specified", async () => {
    vi.mocked(requireMaintainerSession).mockResolvedValue(maintainerSession as any);
    vi.mocked(prisma.registration.findMany).mockResolvedValue([]);

    await GET(request("http://localhost:3000/api/registrations/deleted"));

    expect(prisma.registration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 26,
      })
    );
  });

  it("supports cursor-based pagination", async () => {
    vi.mocked(requireMaintainerSession).mockResolvedValue(maintainerSession as any);
    vi.mocked(prisma.registration.findMany).mockResolvedValue([]);

    const cursor = Buffer.from("reg-1").toString("base64");
    await GET(request(`http://localhost:3000/api/registrations/deleted?cursor=${cursor}`));

    expect(prisma.registration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        cursor: { id: "reg-1" },
        skip: 1,
      })
    );
  });

  it("returns hasMore and nextCursor when more results exist", async () => {
    vi.mocked(requireMaintainerSession).mockResolvedValue(maintainerSession as any);
    // Return limit + 1 results to trigger hasMore
    const manyResults = Array.from({ length: 26 }, (_, i) => ({
      id: `reg-${i}`,
      stellarAddress: `GADDRESS${i}`,
      userId: `user-${i}`,
      user: { githubUsername: `contributor${i}` },
      deletedAt: new Date("2026-08-28T00:00:00Z"),
      createdAt: new Date("2026-08-01T00:00:00Z"),
      updatedAt: new Date("2026-08-28T00:00:00Z"),
    }));
    vi.mocked(prisma.registration.findMany).mockResolvedValue(manyResults as any);

    const response = await GET(request("http://localhost:3000/api/registrations/deleted?limit=25"));

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.hasMore).toBe(true);
    expect(json.nextCursor).toBeDefined();
    expect(json.registrations).toHaveLength(25);
  });
});
