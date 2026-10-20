import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Tests for /api/settings/api-keys (GET, POST) and
 *           /api/settings/api-keys/[id] (DELETE)
 *
 * Tests verify:
 * - Authorization (403 without operator+ session)
 * - CSRF protection on mutating methods
 * - Create: validation, key-limit enforcement, secret-once response
 * - List: returns only caller's non-revoked keys
 * - Revoke: ownership check, already-revoked guard, audit log
 *
 * Watch for: raw key appearing in any persisted call, cross-user revocation.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────────────────────────────────────

vi.mock("@/lib/api-auth", () => ({
  requireOperator: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  recordAuditLog: vi.fn(),
}));

vi.mock("@/lib/csrf", () => ({
  assertSameOrigin: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    apiKey: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
  },
}));

// Keep crypto deterministic in create tests
vi.mock("@/lib/api-key-crypto", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/api-key-crypto")>();
  return {
    ...original,
    generateApiKey: vi.fn().mockReturnValue("tb_test-secret-key-abc123"),
    hashApiKey: vi.fn().mockReturnValue("aabbcc00".repeat(8)), // 64 hex chars
  };
});

import { GET, POST } from "@/app/api/settings/api-keys/route";
import { DELETE } from "@/app/api/settings/api-keys/[id]/route";
import { requireOperator } from "@/lib/api-auth";
import { recordAuditLog } from "@/lib/audit";
import { assertSameOrigin } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";
import { generateApiKey, hashApiKey } from "@/lib/api-key-crypto";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const mockSession = {
  user: {
    id: "operator-1",
    isMaintainer: true,
    role: "operator",
    githubUsername: "op-user",
  },
};

function makeRequest(
  path: string,
  options: { method?: string; body?: unknown; origin?: string } = {}
): NextRequest {
  const { method = "GET", body, origin = "http://localhost:3000" } = options;
  return new NextRequest(`http://localhost:3000${path}`, {
    method,
    headers: {
      host: "localhost:3000",
      origin,
      "content-type": "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

const existingKey = {
  id: "key-1",
  name: "nightly-export",
  scopes: ["export:read"],
  createdAt: new Date("2026-09-01T00:00:00Z"),
  expiresAt: null,
  lastUsedAt: null,
  createdById: "operator-1",
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/settings/api-keys
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/settings/api-keys", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(assertSameOrigin).mockReturnValue(null);
  });

  describe("Authorization", () => {
    it("returns 403 without operator session", async () => {
      vi.mocked(requireOperator).mockResolvedValue(null);

      const res = await GET();

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toBe("Forbidden");
    });

    it("allows operator access", async () => {
      vi.mocked(requireOperator).mockResolvedValue(mockSession as never);
      vi.mocked(prisma.apiKey.findMany).mockResolvedValue([existingKey] as never);

      const res = await GET();

      expect(res.status).toBe(200);
    });
  });

  describe("Response Shape", () => {
    beforeEach(() => {
      vi.mocked(requireOperator).mockResolvedValue(mockSession as never);
    });

    it("returns keys array", async () => {
      vi.mocked(prisma.apiKey.findMany).mockResolvedValue([existingKey] as never);

      const res = await GET();
      const json = await res.json();

      expect(json.keys).toHaveLength(1);
      expect(json.keys[0].id).toBe("key-1");
      expect(json.keys[0].name).toBe("nightly-export");
    });

    it("returns empty array when no keys exist", async () => {
      vi.mocked(prisma.apiKey.findMany).mockResolvedValue([]);

      const res = await GET();
      const json = await res.json();

      expect(json.keys).toHaveLength(0);
    });

    it("does not include keyHash or revokedAt in the response", async () => {
      vi.mocked(prisma.apiKey.findMany).mockResolvedValue([existingKey] as never);

      const res = await GET();
      const json = await res.json();
      const serialized = JSON.stringify(json);

      expect(serialized).not.toContain("keyHash");
      expect(serialized).not.toContain("revokedAt");
    });

    it("queries only non-revoked keys for the current user", async () => {
      vi.mocked(prisma.apiKey.findMany).mockResolvedValue([]);

      await GET();

      expect(prisma.apiKey.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdById: "operator-1",
            revokedAt: null,
          }),
        })
      );
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/settings/api-keys
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/settings/api-keys", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(assertSameOrigin).mockReturnValue(null);
  });

  describe("Authorization", () => {
    it("returns 403 without operator session", async () => {
      vi.mocked(requireOperator).mockResolvedValue(null);

      const res = await POST(
        makeRequest("/api/settings/api-keys", {
          method: "POST",
          body: { name: "test", scopes: ["export:read"] },
        })
      );

      expect(res.status).toBe(403);
    });
  });

  describe("CSRF", () => {
    it("returns 403 when CSRF check fails", async () => {
      vi.mocked(requireOperator).mockResolvedValue(mockSession as never);
      const { NextResponse } = await import("next/server");
      vi.mocked(assertSameOrigin).mockReturnValue(
        NextResponse.json({ error: "Invalid request origin" }, { status: 403 })
      );

      const res = await POST(
        makeRequest("/api/settings/api-keys", {
          method: "POST",
          origin: "https://evil.example.com",
          body: { name: "test", scopes: ["export:read"] },
        })
      );

      expect(res.status).toBe(403);
    });
  });

  describe("Validation", () => {
    beforeEach(() => {
      vi.mocked(requireOperator).mockResolvedValue(mockSession as never);
    });

    it("returns 422 when name is missing", async () => {
      const res = await POST(
        makeRequest("/api/settings/api-keys", {
          method: "POST",
          body: { scopes: ["export:read"] },
        })
      );

      expect(res.status).toBe(422);
    });

    it("returns 422 when name is empty string", async () => {
      const res = await POST(
        makeRequest("/api/settings/api-keys", {
          method: "POST",
          body: { name: "  ", scopes: ["export:read"] },
        })
      );

      expect(res.status).toBe(422);
    });

    it("returns 422 when name exceeds 80 characters", async () => {
      const res = await POST(
        makeRequest("/api/settings/api-keys", {
          method: "POST",
          body: { name: "a".repeat(81), scopes: ["export:read"] },
        })
      );

      expect(res.status).toBe(422);
    });

    it("returns 422 when scopes array is empty", async () => {
      const res = await POST(
        makeRequest("/api/settings/api-keys", {
          method: "POST",
          body: { name: "valid-name", scopes: [] },
        })
      );

      expect(res.status).toBe(422);
    });

    it("returns 422 when scope is unrecognised", async () => {
      const res = await POST(
        makeRequest("/api/settings/api-keys", {
          method: "POST",
          body: { name: "valid-name", scopes: ["admin:write"] },
        })
      );

      expect(res.status).toBe(422);
    });

    it("returns 422 when body is not JSON", async () => {
      const req = new NextRequest("http://localhost:3000/api/settings/api-keys", {
        method: "POST",
        headers: { "content-type": "text/plain", origin: "http://localhost:3000" },
        body: "not json",
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
    });
  });

  describe("Key Limit", () => {
    beforeEach(() => {
      vi.mocked(requireOperator).mockResolvedValue(mockSession as never);
    });

    it("returns 422 when 10 active keys already exist", async () => {
      vi.mocked(prisma.apiKey.count).mockResolvedValue(10);

      const res = await POST(
        makeRequest("/api/settings/api-keys", {
          method: "POST",
          body: { name: "eleventh-key", scopes: ["export:read"] },
        })
      );

      expect(res.status).toBe(422);
      const json = await res.json();
      expect(json.error).toContain("Maximum of 10");
    });
  });

  describe("Response Shape", () => {
    beforeEach(() => {
      vi.mocked(requireOperator).mockResolvedValue(mockSession as never);
      vi.mocked(prisma.apiKey.count).mockResolvedValue(0);
      vi.mocked(prisma.apiKey.create).mockResolvedValue({
        id: "new-key-id",
        name: "ci-export",
        scopes: ["export:read"],
        createdAt: new Date("2026-09-25T00:00:00Z"),
        expiresAt: null,
      } as never);
    });

    it("returns 201 with the secret on success", async () => {
      const res = await POST(
        makeRequest("/api/settings/api-keys", {
          method: "POST",
          body: { name: "ci-export", scopes: ["export:read"] },
        })
      );

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.key.secret).toBe("tb_test-secret-key-abc123");
      expect(json.warning).toContain("not be shown again");
    });

    it("returns key metadata alongside the secret", async () => {
      const res = await POST(
        makeRequest("/api/settings/api-keys", {
          method: "POST",
          body: { name: "ci-export", scopes: ["export:read"] },
        })
      );

      const json = await res.json();
      expect(json.key.id).toBe("new-key-id");
      expect(json.key.name).toBe("ci-export");
      expect(json.key.scopes).toEqual(["export:read"]);
    });

    it("stores only the hash, never the raw key", async () => {
      await POST(
        makeRequest("/api/settings/api-keys", {
          method: "POST",
          body: { name: "ci-export", scopes: ["export:read"] },
        })
      );

      expect(hashApiKey).toHaveBeenCalledWith("tb_test-secret-key-abc123");
      expect(prisma.apiKey.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            keyHash: "aabbcc00".repeat(8),
            // raw key must NOT appear in the create call
          }),
        })
      );
      // Confirm raw key is absent from the create call data
      const createCall = vi.mocked(prisma.apiKey.create).mock.calls[0][0];
      const serialized = JSON.stringify(createCall);
      expect(serialized).not.toContain("tb_test-secret-key-abc123");
    });
  });

  describe("Audit Logging", () => {
    beforeEach(() => {
      vi.mocked(requireOperator).mockResolvedValue(mockSession as never);
      vi.mocked(prisma.apiKey.count).mockResolvedValue(0);
      vi.mocked(prisma.apiKey.create).mockResolvedValue({
        id: "new-key-id",
        name: "ci-export",
        scopes: ["export:read"],
        createdAt: new Date(),
        expiresAt: null,
      } as never);
    });

    it("records api_key.created in audit log", async () => {
      await POST(
        makeRequest("/api/settings/api-keys", {
          method: "POST",
          body: { name: "ci-export", scopes: ["export:read"] },
        })
      );

      expect(recordAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "api_key.created",
          actorId: "operator-1",
          actorLogin: "op-user",
          targetId: "new-key-id",
          targetLabel: "ci-export",
        })
      );
    });

    it("does not log the raw key in audit metadata", async () => {
      await POST(
        makeRequest("/api/settings/api-keys", {
          method: "POST",
          body: { name: "ci-export", scopes: ["export:read"] },
        })
      );

      const auditCall = vi.mocked(recordAuditLog).mock.calls[0][0];
      const serialized = JSON.stringify(auditCall);
      expect(serialized).not.toContain("tb_test-secret-key-abc123");
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/settings/api-keys/[id]
// ─────────────────────────────────────────────────────────────────────────────

describe("DELETE /api/settings/api-keys/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(assertSameOrigin).mockReturnValue(null);
  });

  function makeDeleteRequest(id: string) {
    return makeRequest(`/api/settings/api-keys/${id}`, { method: "DELETE" });
  }

  describe("Authorization", () => {
    it("returns 403 without operator session", async () => {
      vi.mocked(requireOperator).mockResolvedValue(null);

      const res = await DELETE(makeDeleteRequest("key-1"), {
        params: { id: "key-1" },
      });

      expect(res.status).toBe(403);
    });
  });

  describe("Ownership", () => {
    beforeEach(() => {
      vi.mocked(requireOperator).mockResolvedValue(mockSession as never);
    });

    it("returns 404 when key does not exist", async () => {
      vi.mocked(prisma.apiKey.findUnique).mockResolvedValue(null);

      const res = await DELETE(makeDeleteRequest("missing-id"), {
        params: { id: "missing-id" },
      });

      expect(res.status).toBe(404);
    });

    it("returns 403 when key belongs to a different user", async () => {
      vi.mocked(prisma.apiKey.findUnique).mockResolvedValue({
        id: "key-1",
        name: "other-key",
        createdById: "other-user-id", // different from mockSession.user.id
        revokedAt: null,
      } as never);

      const res = await DELETE(makeDeleteRequest("key-1"), {
        params: { id: "key-1" },
      });

      expect(res.status).toBe(403);
    });

    it("returns 409 when key is already revoked", async () => {
      vi.mocked(prisma.apiKey.findUnique).mockResolvedValue({
        id: "key-1",
        name: "old-key",
        createdById: "operator-1",
        revokedAt: new Date("2026-09-01T00:00:00Z"),
      } as never);

      const res = await DELETE(makeDeleteRequest("key-1"), {
        params: { id: "key-1" },
      });

      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error).toContain("already revoked");
    });
  });

  describe("Successful Revocation", () => {
    beforeEach(() => {
      vi.mocked(requireOperator).mockResolvedValue(mockSession as never);
      vi.mocked(prisma.apiKey.findUnique).mockResolvedValue({
        id: "key-1",
        name: "nightly-export",
        createdById: "operator-1",
        revokedAt: null,
      } as never);
      vi.mocked(prisma.apiKey.update).mockResolvedValue({} as never);
    });

    it("returns 200 with success: true", async () => {
      const res = await DELETE(makeDeleteRequest("key-1"), {
        params: { id: "key-1" },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });

    it("sets revokedAt via prisma update", async () => {
      await DELETE(makeDeleteRequest("key-1"), { params: { id: "key-1" } });

      expect(prisma.apiKey.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "key-1" },
          data: expect.objectContaining({
            revokedAt: expect.any(Date),
          }),
        })
      );
    });

    it("records api_key.revoked in audit log", async () => {
      await DELETE(makeDeleteRequest("key-1"), { params: { id: "key-1" } });

      expect(recordAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "api_key.revoked",
          actorId: "operator-1",
          actorLogin: "op-user",
          targetId: "key-1",
          targetLabel: "nightly-export",
        })
      );
    });
  });

  describe("Audit on Cross-User Attempt", () => {
    it("records api_key.revoke_denied when not owner", async () => {
      vi.mocked(requireOperator).mockResolvedValue(mockSession as never);
      vi.mocked(prisma.apiKey.findUnique).mockResolvedValue({
        id: "key-99",
        name: "someone-elses-key",
        createdById: "another-user",
        revokedAt: null,
      } as never);

      await DELETE(makeDeleteRequest("key-99"), { params: { id: "key-99" } });

      expect(recordAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "api_key.revoke_denied",
          actorId: "operator-1",
          metadata: expect.objectContaining({ reason: "not_owner" }),
        })
      );
    });
  });
});
