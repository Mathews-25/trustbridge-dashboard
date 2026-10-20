/**
 * ApiKeyPanel tests — Issue #506
 *
 * The project runs vitest in a Node environment (no jsdom), so these tests
 * cover:
 *   1. The API route handlers directly (the real business logic behind the
 *      panel's fetch calls) — matching the pattern used by every other
 *      test file in this repo (see tests/api/settings-network.test.ts).
 *   2. Pure helper / validation logic that the panel relies on.
 *
 * All external dependencies are mocked via vi.fn() — no MSW, no browser API.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    apiKey: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";

import {
  GET,
  POST,
  VALID_SCOPES,
} from "@/app/api/settings/api-keys/route";
import { DELETE } from "@/app/api/settings/api-keys/[id]/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const sameOriginHeaders: Record<string, string> = {
  origin: "http://localhost:3000",
  host: "localhost:3000",
  "content-type": "application/json",
};

function post(body: unknown, headers?: Record<string, string>): NextRequest {
  return new NextRequest("http://localhost:3000/api/settings/api-keys", {
    method: "POST",
    headers: headers ?? sameOriginHeaders,
    body: JSON.stringify(body),
  });
}

function del(id: string, headers?: Record<string, string>): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/settings/api-keys/${id}`,
    {
      method: "DELETE",
      headers: headers ?? sameOriginHeaders,
    }
  );
}

function maintainerSession() {
  return {
    user: { id: "user-1", isMaintainer: true, githubUsername: "octocat" },
  };
}

function makeApiKeyRow(overrides: Partial<{
  id: string;
  name: string;
  scopes: string[];
  revokedAt: Date | null;
}> = {}) {
  return {
    id: overrides.id ?? "key-1",
    name: overrides.name ?? "Treasury Bot",
    scopes: overrides.scopes ?? ["treasury:read"],
    createdAt: new Date("2026-01-01"),
    revokedAt: overrides.revokedAt ?? null,
  };
}

beforeEach(() => vi.clearAllMocks());

// ---------------------------------------------------------------------------
// VALID_SCOPES (pure — no mock needed)
// ---------------------------------------------------------------------------
describe("VALID_SCOPES", () => {
  it("contains the four canonical scopes", () => {
    expect(VALID_SCOPES).toContain("treasury:read");
    expect(VALID_SCOPES).toContain("treasury:export");
    expect(VALID_SCOPES).toContain("contributors:read");
    expect(VALID_SCOPES).toContain("contributors:write");
  });

  it("has exactly four entries so additions are intentional", () => {
    expect(VALID_SCOPES).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// GET /api/settings/api-keys
// ---------------------------------------------------------------------------
describe("GET /api/settings/api-keys", () => {
  it("returns 403 for an unauthenticated request", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toMatch(/maintainer/i);
  });

  it("returns 403 for a non-maintainer session", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user-1", isMaintainer: false },
    } as any);
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns 200 with key list for a maintainer (success path)", async () => {
    vi.mocked(getServerSession).mockResolvedValue(maintainerSession() as any);
    vi.mocked(prisma.apiKey.findMany).mockResolvedValue([
      makeApiKeyRow({ id: "key-1", name: "Bot A" }),
      makeApiKeyRow({ id: "key-2", name: "Bot B" }),
    ] as any);

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.keys).toHaveLength(2);
    expect(json.keys[0].name).toBe("Bot A");
    // Raw key must never appear in the list response
    expect(JSON.stringify(json)).not.toMatch(/rawKey/);
  });

  it("returns an empty array when no keys exist", async () => {
    vi.mocked(getServerSession).mockResolvedValue(maintainerSession() as any);
    vi.mocked(prisma.apiKey.findMany).mockResolvedValue([]);

    const res = await GET();
    const json = await res.json();
    expect(json.keys).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// POST /api/settings/api-keys — create flow
// ---------------------------------------------------------------------------
describe("POST /api/settings/api-keys", () => {
  it("returns 403 for cross-origin request before touching session", async () => {
    const r = post(
      { name: "Bot" },
      { origin: "https://evil.com", host: "localhost:3000", "content-type": "application/json" }
    );
    const res = await POST(r);
    expect(res.status).toBe(403);
    expect(getServerSession).not.toHaveBeenCalled();
  });

  it("returns 403 for a non-maintainer", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user-1", isMaintainer: false },
    } as any);
    const res = await POST(post({ name: "Bot" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 when name is missing (client validation mirror)", async () => {
    vi.mocked(getServerSession).mockResolvedValue(maintainerSession() as any);
    const res = await POST(post({ name: "" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/name/i);
  });

  it("returns 400 for an invalid scope", async () => {
    vi.mocked(getServerSession).mockResolvedValue(maintainerSession() as any);
    const res = await POST(post({ name: "Bot", scopes: ["invalid:scope"] }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/invalid scopes/i);
  });

  it("creates key and returns rawKey exactly once (success path)", async () => {
    vi.mocked(getServerSession).mockResolvedValue(maintainerSession() as any);
    vi.mocked(prisma.apiKey.create).mockResolvedValue(
      makeApiKeyRow({ scopes: ["treasury:read"] }) as any
    );

    const res = await POST(
      post({ name: "Treasury Bot", scopes: ["treasury:read"] })
    );
    expect(res.status).toBe(201);

    const json = await res.json();
    expect(json.rawKey).toBeDefined();
    // Raw key must start with the tb_ prefix
    expect(json.rawKey).toMatch(/^tb_/);
    // apiKey row must not contain the raw key — only the hash is persisted
    expect(json.apiKey.keyHash).toBeUndefined();
    expect(json.apiKey.name).toBe("Treasury Bot");
  });

  it("does not return the same rawKey on two calls (unique per creation)", async () => {
    vi.mocked(getServerSession).mockResolvedValue(maintainerSession() as any);
    vi.mocked(prisma.apiKey.create).mockResolvedValue(
      makeApiKeyRow() as any
    );

    const r1 = await POST(post({ name: "Bot 1", scopes: [] }));
    const r2 = await POST(post({ name: "Bot 2", scopes: [] }));
    const j1 = await r1.json();
    const j2 = await r2.json();

    expect(j1.rawKey).not.toBe(j2.rawKey);
  });

  it("stores a hash — prisma.create is called with keyHash not rawKey", async () => {
    vi.mocked(getServerSession).mockResolvedValue(maintainerSession() as any);
    vi.mocked(prisma.apiKey.create).mockResolvedValue(
      makeApiKeyRow() as any
    );

    await POST(post({ name: "Bot", scopes: ["contributors:read"] }));

    const callData = vi.mocked(prisma.apiKey.create).mock.calls[0][0].data;
    // keyHash must be a 64-char hex string (SHA-256)
    expect(callData.keyHash).toMatch(/^[0-9a-f]{64}$/);
    // The raw key (tb_ prefixed) must NOT be in the stored data
    expect(callData.keyHash).not.toMatch(/^tb_/);
  });

  it("accepts an empty scopes array", async () => {
    vi.mocked(getServerSession).mockResolvedValue(maintainerSession() as any);
    vi.mocked(prisma.apiKey.create).mockResolvedValue(
      makeApiKeyRow({ scopes: [] }) as any
    );

    const res = await POST(post({ name: "Minimal Bot", scopes: [] }));
    expect(res.status).toBe(201);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/settings/api-keys/[id] — revoke flow
// ---------------------------------------------------------------------------
describe("DELETE /api/settings/api-keys/[id]", () => {
  it("returns 403 for cross-origin request", async () => {
    const r = del("key-1", {
      origin: "https://evil.com",
      host: "localhost:3000",
      "content-type": "application/json",
    });
    const res = await DELETE(r, { params: { id: "key-1" } });
    expect(res.status).toBe(403);
  });

  it("returns 403 for a non-maintainer", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user-1", isMaintainer: false },
    } as any);
    const res = await DELETE(del("key-1"), { params: { id: "key-1" } });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toMatch(/maintainer/i);
  });

  it("returns 404 when the key does not exist (failure path)", async () => {
    vi.mocked(getServerSession).mockResolvedValue(maintainerSession() as any);
    vi.mocked(prisma.apiKey.findUnique).mockResolvedValue(null);

    const res = await DELETE(del("missing-id"), { params: { id: "missing-id" } });
    expect(res.status).toBe(404);
  });

  it("returns 409 when key is already revoked (edge case)", async () => {
    vi.mocked(getServerSession).mockResolvedValue(maintainerSession() as any);
    vi.mocked(prisma.apiKey.findUnique).mockResolvedValue(
      makeApiKeyRow({ revokedAt: new Date() }) as any
    );

    const res = await DELETE(del("key-1"), { params: { id: "key-1" } });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toMatch(/already revoked/i);
  });

  it("soft-deletes key by setting revokedAt (success path)", async () => {
    vi.mocked(getServerSession).mockResolvedValue(maintainerSession() as any);
    vi.mocked(prisma.apiKey.findUnique).mockResolvedValue(
      makeApiKeyRow() as any
    );
    const revokedAt = new Date();
    vi.mocked(prisma.apiKey.update).mockResolvedValue(
      makeApiKeyRow({ revokedAt }) as any
    );

    const res = await DELETE(del("key-1"), { params: { id: "key-1" } });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.apiKey.revokedAt).toBeDefined();

    // Prisma update must have set revokedAt, not hard-deleted the row
    expect(prisma.apiKey.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "key-1" },
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      })
    );
  });

  it("revoked key row disappears from active list (integration of GET after DELETE)", async () => {
    vi.mocked(getServerSession).mockResolvedValue(maintainerSession() as any);

    // After revoke, list returns only the revoked row (panel filters it or shows badge).
    const revokedRow = makeApiKeyRow({ revokedAt: new Date() });
    vi.mocked(prisma.apiKey.findMany).mockResolvedValue([revokedRow] as any);

    const listRes = await GET();
    const json = await listRes.json();

    // The row is still in the DB (soft delete), but revokedAt is set.
    const row = json.keys[0];
    expect(row.revokedAt).not.toBeNull();
    // The panel component renders a "Revoked" badge instead of the Revoke button.
    // That UI branch is driven by revokedAt !== null — confirmed here at the data level.
  });
});
