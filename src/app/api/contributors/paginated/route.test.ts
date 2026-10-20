import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-auth", () => ({
  requireMaintainerSession: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    registration: {
      count: vi.fn(),
    },
  },
}));

vi.mock("@/lib/registrations", () => ({
  getContributorsPaginated: vi.fn(),
}));

import { requireMaintainerSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { getContributorsPaginated } from "@/lib/registrations";
import { GET } from "@/app/api/contributors/paginated/route";

function get(url: string) {
  return new NextRequest(url, {
    method: "GET",
    headers: { host: "localhost:3000" },
  });
}

describe("GET /api/contributors/paginated", () => {
  beforeEach(() => {
    vi.mocked(requireMaintainerSession).mockResolvedValue({
      user: { id: "u-1", isMaintainer: true },
    } as never);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 without a maintainer session", async () => {
    vi.mocked(requireMaintainerSession).mockResolvedValue(null);

    const res = await GET(
      get("http://localhost:3000/api/contributors/paginated")
    );

    expect(res.status).toBe(403);
    expect(getContributorsPaginated).not.toHaveBeenCalled();
  });

  it("delegates cursor pagination to getContributorsPaginated with defaults", async () => {
    vi.mocked(getContributorsPaginated).mockResolvedValue({
      contributors: [],
      nextCursor: null,
      hasMore: false,
    });
    vi.mocked(prisma.registration.count).mockResolvedValue(0);

    const res = await GET(
      get("http://localhost:3000/api/contributors/paginated")
    );

    expect(res.status).toBe(200);
    expect(getContributorsPaginated).toHaveBeenCalledWith(undefined, 25);
    const json = await res.json();
    expect(json.registryMode).toBe("live");
  });

  it("passes the requested limit and cursor straight through", async () => {
    vi.mocked(getContributorsPaginated).mockResolvedValue({
      contributors: [],
      nextCursor: "opaque-cursor",
      hasMore: true,
    });
    vi.mocked(prisma.registration.count).mockResolvedValue(42);

    const res = await GET(
      get(
        "http://localhost:3000/api/contributors/paginated?limit=10&cursor=abc123"
      )
    );

    expect(getContributorsPaginated).toHaveBeenCalledWith("abc123", 10);
    const json = await res.json();
    expect(json.total).toBe(42);
    expect(json.hasMore).toBe(true);
    expect(json.nextCursor).toBe("opaque-cursor");
  });

  it("ignores an out-of-range limit and falls back to the default", async () => {
    vi.mocked(getContributorsPaginated).mockResolvedValue({
      contributors: [],
      nextCursor: null,
      hasMore: false,
    });
    vi.mocked(prisma.registration.count).mockResolvedValue(0);

    await GET(
      get("http://localhost:3000/api/contributors/paginated?limit=500")
    );

    expect(getContributorsPaginated).toHaveBeenCalledWith(undefined, 25);
  });
});
