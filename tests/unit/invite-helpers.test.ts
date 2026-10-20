import { createHash } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock prisma before importing the module under test so that no DB connection
// is attempted during the test run.
// ---------------------------------------------------------------------------
vi.mock("@/lib/prisma", () => ({
  prisma: {
    invite: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  deleteInvite,
  findInviteByToken,
  generateInviteToken,
  hashInviteToken,
  listInvites,
} from "@/lib/invite-helpers";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function makeInviteRow(overrides: Partial<{ id: string; email: string; tokenHash: string }> = {}) {
  return {
    id: overrides.id ?? "inv-1",
    email: overrides.email ?? "user@example.com",
    tokenHash: overrides.tokenHash ?? sha256("raw-token"),
    expiresAt: new Date(Date.now() + 86_400_000),
    createdAt: new Date(),
    usedAt: null,
  };
}

// ---------------------------------------------------------------------------
// hashInviteToken
// ---------------------------------------------------------------------------
describe("hashInviteToken", () => {
  it("produces the expected SHA-256 hex digest (success path)", () => {
    const raw = "my-super-secret-token";
    const expected = sha256(raw);
    expect(hashInviteToken(raw)).toBe(expected);
  });

  it("produces different hashes for different inputs", () => {
    expect(hashInviteToken("token-a")).not.toBe(hashInviteToken("token-b"));
  });

  it("is deterministic — same input always yields same hash", () => {
    const raw = "deterministic-token";
    expect(hashInviteToken(raw)).toBe(hashInviteToken(raw));
  });
});

// ---------------------------------------------------------------------------
// generateInviteToken
// ---------------------------------------------------------------------------
describe("generateInviteToken", () => {
  it("returns raw and hash fields", () => {
    const { raw, hash } = generateInviteToken();
    expect(typeof raw).toBe("string");
    expect(typeof hash).toBe("string");
  });

  it("hash matches sha256 of raw", () => {
    const { raw, hash } = generateInviteToken();
    expect(hash).toBe(sha256(raw));
  });

  it("generates unique tokens on each call", () => {
    const first = generateInviteToken();
    const second = generateInviteToken();
    expect(first.raw).not.toBe(second.raw);
    expect(first.hash).not.toBe(second.hash);
  });

  it("raw token does not contain the hash (never plaintext in storage)", () => {
    const { raw, hash } = generateInviteToken();
    expect(raw).not.toBe(hash);
  });
});

// ---------------------------------------------------------------------------
// listInvites
// ---------------------------------------------------------------------------
describe("listInvites", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns an array of invite records (success path)", async () => {
    const rows = [makeInviteRow({ id: "inv-1" }), makeInviteRow({ id: "inv-2" })];
    vi.mocked(prisma.invite.findMany).mockResolvedValue(rows as any);

    const result = await listInvites();
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("inv-1");
    expect(prisma.invite.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: "desc" },
    });
  });

  it("returns an empty array when there are no invites", async () => {
    vi.mocked(prisma.invite.findMany).mockResolvedValue([]);
    const result = await listInvites();
    expect(result).toEqual([]);
  });

  it("propagates unexpected database errors", async () => {
    vi.mocked(prisma.invite.findMany).mockRejectedValue(new Error("DB error"));
    await expect(listInvites()).rejects.toThrow("DB error");
  });
});

// ---------------------------------------------------------------------------
// deleteInvite
// ---------------------------------------------------------------------------
describe("deleteInvite", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns true when the record is deleted (success path)", async () => {
    vi.mocked(prisma.invite.delete).mockResolvedValue(makeInviteRow() as any);
    const result = await deleteInvite("inv-1");
    expect(result).toBe(true);
    expect(prisma.invite.delete).toHaveBeenCalledWith({ where: { id: "inv-1" } });
  });

  it("returns false when the record does not exist (failure path)", async () => {
    vi.mocked(prisma.invite.delete).mockRejectedValue(
      Object.assign(new Error("Record not found"), { code: "P2025" })
    );
    const result = await deleteInvite("non-existent-id");
    expect(result).toBe(false);
  });

  it("returns false on any prisma error, not just P2025", async () => {
    vi.mocked(prisma.invite.delete).mockRejectedValue(new Error("Unexpected DB error"));
    const result = await deleteInvite("inv-999");
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// findInviteByToken
// ---------------------------------------------------------------------------
describe("findInviteByToken", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the matching invite when found (success path)", async () => {
    const raw = "raw-token-xyz";
    const row = makeInviteRow({ tokenHash: sha256(raw) });
    vi.mocked(prisma.invite.findFirst).mockResolvedValue(row as any);

    const result = await findInviteByToken(raw);
    expect(result).not.toBeNull();
    expect(result?.tokenHash).toBe(sha256(raw));
    expect(prisma.invite.findFirst).toHaveBeenCalledWith({
      where: { tokenHash: sha256(raw) },
    });
  });

  it("returns null when no invite matches the token (failure path)", async () => {
    vi.mocked(prisma.invite.findFirst).mockResolvedValue(null);
    const result = await findInviteByToken("bogus-token");
    expect(result).toBeNull();
  });

  it("hashes the raw token before querying — never queries with plaintext", async () => {
    vi.mocked(prisma.invite.findFirst).mockResolvedValue(null);
    const raw = "plaintext-token";
    await findInviteByToken(raw);

    const callArg = vi.mocked(prisma.invite.findFirst).mock.calls[0][0];
    expect(callArg).toEqual({ where: { tokenHash: sha256(raw) } });
    // The raw token must not appear anywhere in the query.
    expect(JSON.stringify(callArg)).not.toContain(raw);
  });
});
