import { createHmac } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — must be declared before any import of the modules under test.
// ---------------------------------------------------------------------------
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      upsert: vi.fn(),
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "crypto";
import { NextRequest } from "next/server";
import { POST, verifyWebhookSignature } from "@/app/api/webhooks/github-org-membership/route";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/audit", () => ({
  recordAuditLog: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { recordAuditLog } from "@/lib/audit";

import {
  verifyWebhookSignature,
  processGithubOrgMembershipEvent,
  type GithubOrgMembershipPayload,
} from "@/lib/github-org-membership-webhook";

import { POST as webhookPOST } from "@/app/api/webhooks/github-org-membership/route";
import { POST as replayPOST } from "@/app/api/webhooks/github-org-membership/replay/route";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const TEST_SECRET = "test-webhook-secret";

function sign(body: string, secret = TEST_SECRET): string {
  return "sha256=" + createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

function makePayload(
  action = "member_added",
  login = "octocat",
  githubId = 1
): GithubOrgMembershipPayload {
  return {
    action,
    membership: { user: { id: githubId, login }, role: "member", state: "active" },
    organization: { login: "stellar-org" },
    sender: { login: "admin" },
  };
}

function webhookRequest(body: string, sig: string | null): NextRequest {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (sig !== null) headers["x-hub-signature-256"] = sig;
  return new NextRequest(
    "http://localhost:3000/api/webhooks/github-org-membership",
    { method: "POST", headers, body }
  );
}

const sameOriginHeaders: Record<string, string> = {
  origin: "http://localhost:3000",
  host: "localhost:3000",
  "content-type": "application/json",
};

function replayRequest(body: unknown, headers?: Record<string, string>): NextRequest {
  return new NextRequest(
    "http://localhost:3000/api/webhooks/github-org-membership/replay",
    { method: "POST", headers: headers ?? sameOriginHeaders, body: JSON.stringify(body) }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.GITHUB_WEBHOOK_SECRET = TEST_SECRET;
});

afterEach(() => {
  delete process.env.GITHUB_WEBHOOK_SECRET;
});

// ---------------------------------------------------------------------------
// verifyWebhookSignature (lib — pure)
// ---------------------------------------------------------------------------
describe("verifyWebhookSignature", () => {
  it("returns ok=true for a correct signature (success path)", () => {
    const body = '{"action":"member_added"}';
    const sig = sign(body);
    expect(verifyWebhookSignature(body, sig)).toEqual({ ok: true });
  });

  it("returns ok=false for a tampered body (failure path)", () => {
    const body = '{"action":"member_added"}';
    const sig = sign("different-body");
    const result = verifyWebhookSignature(body, sig);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/mismatch/i);
  });

  it("returns ok=false when signature header is missing", () => {
    const result = verifyWebhookSignature('{"a":1}', null);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/missing/i);
  });

  it("returns ok=false when GITHUB_WEBHOOK_SECRET is not set", () => {
    delete process.env.GITHUB_WEBHOOK_SECRET;
    const result = verifyWebhookSignature('{"a":1}', sign('{"a":1}'));
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/not configured/i);
  });

  it("returns ok=false for a non-sha256 scheme", () => {
    const result = verifyWebhookSignature('{"a":1}', "sha1=abc123");
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// processGithubOrgMembershipEvent (lib)
// ---------------------------------------------------------------------------
describe("processGithubOrgMembershipEvent", () => {
  it("upserts user and returns handled=true for member_added", async () => {
    vi.mocked(prisma.user.upsert).mockResolvedValue({} as any);
    vi.mocked(recordAuditLog).mockResolvedValue({} as any);

    const result = await processGithubOrgMembershipEvent(makePayload("member_added"));
    expect(result.handled).toBe(true);
    expect(result.action).toBe("member_added");
    expect(result.login).toBe("octocat");
    expect(prisma.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { githubId: "1" } })
    );
    expect(recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "webhook.github_org_membership.member_added" })
    );
  });

  it("upserts user for member_invited", async () => {
    vi.mocked(prisma.user.upsert).mockResolvedValue({} as any);
    vi.mocked(recordAuditLog).mockResolvedValue({} as any);

    const result = await processGithubOrgMembershipEvent(makePayload("member_invited"));
    expect(result.handled).toBe(true);
    expect(prisma.user.upsert).toHaveBeenCalled();
  });

  it("logs removal and returns handled=true for member_removed without touching DB", async () => {
    vi.mocked(recordAuditLog).mockResolvedValue({} as any);

    const result = await processGithubOrgMembershipEvent(makePayload("member_removed"));
    expect(result.handled).toBe(true);
    expect(prisma.user.upsert).not.toHaveBeenCalled();
    expect(recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "webhook.github_org_membership.member_removed",
      })
    );
  });

  it("returns handled=false for an unrecognised action", async () => {
    vi.mocked(recordAuditLog).mockResolvedValue({} as any);

    const result = await processGithubOrgMembershipEvent(
      makePayload("member_edited")
    );
    expect(result.handled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// POST /api/webhooks/github-org-membership (route)
// ---------------------------------------------------------------------------
describe("POST /api/webhooks/github-org-membership", () => {
  it("returns 401 when signature is missing", async () => {
    const body = JSON.stringify(makePayload());
    const res = await webhookPOST(webhookRequest(body, null));
    expect(res.status).toBe(401);
  });

  it("returns 401 for a bad signature", async () => {
    const body = JSON.stringify(makePayload());
    const res = await webhookPOST(webhookRequest(body, sign("wrong-body")));
    expect(res.status).toBe(401);
  });

  it("returns 200 and processes a valid signed payload", async () => {
    vi.mocked(prisma.user.upsert).mockResolvedValue({} as any);
    vi.mocked(recordAuditLog).mockResolvedValue({} as any);

    const body = JSON.stringify(makePayload("member_added"));
    const sig = sign(body);
    const res = await webhookPOST(webhookRequest(body, sig));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.handled).toBe(true);
  });

  it("returns 400 for an invalid JSON body with correct signature", async () => {
    const body = "not-json";
    const sig = sign(body);
    const res = await webhookPOST(webhookRequest(body, sig));
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// POST /api/webhooks/github-org-membership/replay (route)
// ---------------------------------------------------------------------------
describe("POST /api/webhooks/github-org-membership/replay", () => {
  it("returns 403 for cross-origin request", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const r = replayRequest(makePayload(), {
      origin: "https://evil.com",
      host: "localhost:3000",
      "content-type": "application/json",
    });
    const res = await replayPOST(r);
    expect(res.status).toBe(403);
  });

  it("returns 403 when not a maintainer", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user-1", isMaintainer: false },
    } as any);
    const r = replayRequest(makePayload());
    const res = await replayPOST(r);
    expect(res.status).toBe(403);
  });

  it("returns 200 and processes the replayed payload for a maintainer", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user-1", isMaintainer: true },
    } as any);
    vi.mocked(prisma.user.upsert).mockResolvedValue({} as any);
    vi.mocked(recordAuditLog).mockResolvedValue({} as any);

    const r = replayRequest(makePayload("member_added"));
    const res = await replayPOST(r);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.replayed).toBe(true);
    expect(json.handled).toBe(true);
  });
import { prisma } from "@/lib/prisma";
import { recordAuditLog } from "@/lib/audit";
import { captureException } from "@/lib/sentry";

vi.mock("@/lib/sentry", () => ({
  captureException: vi.fn(),
}));

const WEBHOOK_SECRET = "test-secret-123";

function createSignature(payload: Buffer): string {
  const hmac = crypto.createHmac("sha256", WEBHOOK_SECRET);
  hmac.update(payload);
  return `sha256=${hmac.digest("hex")}`;
}

function createWebhookRequest(
  event: Record<string, unknown>,
  signature: string | null = null
) {
  const payload = Buffer.from(JSON.stringify(event));
  const sig = signature ?? createSignature(payload);

  return new NextRequest("http://localhost:3000/api/webhooks/github-org-membership", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Hub-Signature-256": sig,
      "X-GitHub-Delivery": "delivery-id-123",
    },
    body: payload,
  });
}

describe("POST /api/webhooks/github-org-membership", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("GITHUB_WEBHOOK_SECRET", WEBHOOK_SECRET);
    vi.stubEnv("GITHUB_MAINTAINER_ORG", "test-org");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe("verifyWebhookSignature", () => {
    it("logs error and returns false when GITHUB_WEBHOOK_SECRET is not configured", () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      delete process.env.GITHUB_WEBHOOK_SECRET;

      const payload = Buffer.from(JSON.stringify({ test: true }));
      const result = verifyWebhookSignature(payload, "sha256=abcdef");

      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "GITHUB_WEBHOOK_SECRET not configured — rejecting webhook (fail closed)"
      );

      consoleErrorSpy.mockRestore();
    });

    it("logs error and returns false when GITHUB_WEBHOOK_SECRET is whitespace only", () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      process.env.GITHUB_WEBHOOK_SECRET = "   ";

      const payload = Buffer.from(JSON.stringify({ test: true }));
      const result = verifyWebhookSignature(payload, "sha256=abcdef");

      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "GITHUB_WEBHOOK_SECRET not configured — rejecting webhook (fail closed)"
      );

      consoleErrorSpy.mockRestore();
    });

    it("logs warning and returns false when X-Hub-Signature-256 is missing", () => {
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.stubEnv("GITHUB_WEBHOOK_SECRET", WEBHOOK_SECRET);

      const payload = Buffer.from(JSON.stringify({ test: true }));
      const result = verifyWebhookSignature(payload, undefined);

      expect(result).toBe(false);
      expect(consoleWarnSpy).toHaveBeenCalledWith("Missing X-Hub-Signature-256 header");

      consoleWarnSpy.mockRestore();
    });
  });

  it("rejects invalid signature", async () => {
    const event = {
      action: "added",
      member: { login: "user1", id: 123 },
      organization: { login: "test-org" },
      sender: { login: "admin" },
    };

    const req = createWebhookRequest(event, "sha256=invalid");
    const res = await POST(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Unauthorized");
  });

  it("rejects request and logs error when webhook secret not configured", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    delete process.env.GITHUB_WEBHOOK_SECRET;

    const event = {
      action: "added",
      member: { login: "user1", id: 123 },
      organization: { login: "test-org" },
      sender: { login: "admin" },
    };

    const payload = Buffer.from(JSON.stringify(event));
    const req = new NextRequest(
      "http://localhost:3000/api/webhooks/github-org-membership",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Hub-Signature-256": "sha256=ignored",
        },
        body: payload,
      }
    );

    const res = await POST(req);
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toBe("Webhook secret not configured");

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "GITHUB_WEBHOOK_SECRET not configured — rejecting webhook (fail closed)"
    );
    expect(recordAuditLog).not.toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it("ignores events from different org", async () => {
    const event = {
      action: "added",
      member: { login: "user1", id: 123 },
      organization: { login: "other-org" },
      sender: { login: "admin" },
    };

    const req = createWebhookRequest(event);
    const res = await POST(req);
    expect(res.status).toBe(202);
    const json = await res.json();
    expect(json.status).toBe("ignored");
    expect(recordAuditLog).not.toHaveBeenCalled();
  });

  it("handles member added event", async () => {
    const event = {
      action: "added",
      member: { login: "testuser", id: 123 },
      organization: { login: "test-org" },
      sender: { login: "admin" },
    };

    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user-1",
      maintainerOrgId: "default",
      banned: false,
      bannedAt: null,
      banReason: null,
      bannedById: null,
      githubId: "123",
      githubUsername: "testuser",
      name: "Test User",
      email: "test@example.com",
      image: null,
      accessToken: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const req = createWebhookRequest(event);
    const res = await POST(req);
    expect(res.status).toBe(202);
    const json = await res.json();
    expect(json.status).toBe("accepted");

    // Verify audit log was recorded
    expect(recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "webhook.org_membership_changed",
        targetId: "user-1",
        targetLabel: "testuser",
        metadata: expect.objectContaining({
          membershipAction: "added",
          org: "test-org",
        }),
      })
    );
  });

  it("handles member removed event", async () => {
    const event = {
      action: "deleted",
      member: { login: "testuser", id: 123 },
      organization: { login: "test-org" },
      sender: { login: "admin" },
    };

    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user-1",
      maintainerOrgId: "default",
      banned: false,
      bannedAt: null,
      banReason: null,
      bannedById: null,
      githubId: "123",
      githubUsername: "testuser",
      name: "Test User",
      email: "test@example.com",
      image: null,
      accessToken: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const req = createWebhookRequest(event);
    const res = await POST(req);
    expect(res.status).toBe(202);

    expect(recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "webhook.org_membership_changed",
        metadata: expect.objectContaining({
          membershipAction: "deleted",
        }),
      })
    );
  });

  it("handles member not found gracefully", async () => {
    const event = {
      action: "added",
      member: { login: "newuser", id: 123 },
      organization: { login: "test-org" },
      sender: { login: "admin" },
    };

    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const req = createWebhookRequest(event);
    const res = await POST(req);
    expect(res.status).toBe(202);
    const json = await res.json();
    expect(json.status).toBe("accepted");
    expect(recordAuditLog).not.toHaveBeenCalled();
  });

  it("handles processing errors gracefully", async () => {
    const event = {
      action: "added",
      member: { login: "testuser", id: 123 },
      organization: { login: "test-org" },
      sender: { login: "admin" },
    };

    vi.mocked(prisma.user.findUnique).mockRejectedValue(
      new Error("Database error")
    );

    const req = createWebhookRequest(event);
    const res = await POST(req);
    // Should still return 202 to prevent retry storm
    expect(res.status).toBe(202);
    const json = await res.json();
    expect(json.status).toBe("error");
    expect(captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        route: "/api/webhooks/github-org-membership",
        method: "POST",
      })
    );
  });

  it("valid webhook with correct signature", async () => {
    const event = {
      action: "added",
      member: { login: "testuser", id: 123 },
      organization: { login: "test-org" },
      sender: { login: "admin" },
    };

    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user-1",
      maintainerOrgId: "default",
      banned: false,
      bannedAt: null,
      banReason: null,
      bannedById: null,
      githubId: "123",
      githubUsername: "testuser",
      name: "Test User",
      email: "test@example.com",
      image: null,
      accessToken: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const req = createWebhookRequest(event);
    const res = await POST(req);
    expect(res.status).toBe(202);
  });

});
