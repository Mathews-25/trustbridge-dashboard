import crypto from "crypto";
import { NextRequest } from "next/server";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { POST } from "@/app/api/webhooks/trustbridge-action/route";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    registration: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/audit", () => ({
  recordAuditLog: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { recordAuditLog } from "@/lib/audit";

const WEBHOOK_SECRET = "test-secret-456";

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

  return new NextRequest("http://localhost:3000/api/webhooks/trustbridge-action", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-TrustBridge-Signature": sig,
      "X-GitHub-Delivery": "delivery-id-456",
    },
    body: payload,
  });
}

describe("POST /api/webhooks/trustbridge-action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TRUSTBRIDGE_ACTION_SECRET = WEBHOOK_SECRET;
  });

  it("rejects invalid signature with 401", async () => {
    const event = {
      schema_version: "1",
      event: "validation_complete",
      timestamp: "2026-08-27T10:00:00.000Z",
      repository: "owner/repo",
      issue_number: 107,
      stellar_address: "GBX7...4Y5Z",
      result: {
        valid: true,
        account_funded: true,
        trustline_exists: true,
        xlm_balance: "100.0",
        checks: [],
      },
    };

    const req = createWebhookRequest(event, "sha256=invalid");
    const res = await POST(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Unauthorized");
  });

  it("rejects missing signature with 401", async () => {
    const event = {
      schema_version: "1",
      event: "validation_complete",
      timestamp: "2026-08-27T10:00:00.000Z",
      repository: "owner/repo",
      issue_number: 107,
      stellar_address: "GBX7...4Y5Z",
      result: {
        valid: true,
        account_funded: true,
        trustline_exists: true,
        xlm_balance: "100.0",
        checks: [],
      },
    };

    const payload = Buffer.from(JSON.stringify(event));
    const req = new NextRequest(
      "http://localhost:3000/api/webhooks/trustbridge-action",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: payload,
      }
    );

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("rejects unsupported schema version with 400", async () => {
    const event = {
      schema_version: "2",
      event: "validation_complete",
      timestamp: "2026-08-27T10:00:00.000Z",
      repository: "owner/repo",
      issue_number: 107,
      stellar_address: "GBX7...4Y5Z",
      result: {
        valid: true,
        account_funded: true,
        trustline_exists: true,
        xlm_balance: "100.0",
        checks: [],
      },
    };

    const req = createWebhookRequest(event);
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Unsupported schema version");
  });

  it("rejects unsupported event with 400", async () => {
    const event = {
      schema_version: "1",
      event: "something_else",
      timestamp: "2026-08-27T10:00:00.000Z",
      repository: "owner/repo",
      issue_number: 107,
      stellar_address: "GBX7...4Y5Z",
      result: {
        valid: true,
        account_funded: true,
        trustline_exists: true,
        xlm_balance: "100.0",
        checks: [],
      },
    };

    const req = createWebhookRequest(event);
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Unsupported event type");
  });

  it("handles valid webhook and updates DB for matching contributor", async () => {
    const event = {
      schema_version: "1",
      event: "validation_complete",
      timestamp: "2026-08-27T10:00:00.000Z",
      repository: "owner/repo",
      issue_number: 107,
      stellar_address: "GBX7...4Y5Z",
      result: {
        valid: true,
        account_funded: true,
        trustline_exists: true,
        xlm_balance: "100.0",
        checks: [],
      },
    };

    vi.mocked(prisma.registration.findMany).mockResolvedValue([
      {
        id: "reg-1",
        userId: "user-123",
        stellarAddress: "GBX7AAAAAAABBBBBBCCCCCCCDDDDDDEEEEEEFFFFFFFGGGGGGG4Y5Z",
        user: {
          id: "user-123",
          githubUsername: "test-contributor",
        },
      } as any,
    ]);

    vi.mocked(prisma.registration.update).mockResolvedValue({
      id: "reg-1",
      funded: true,
      trustlineReady: true,
      trustlineAuthorized: true,
    } as any);

    const req = createWebhookRequest(event);
    const res = await POST(req);
    expect(res.status).toBe(202);

    const json = await res.json();
    expect(json.status).toBe("accepted");
    expect(json.updated.githubUsername).toBe("test-contributor");

    expect(prisma.registration.update).toHaveBeenCalledWith({
      where: { id: "reg-1" },
      data: {
        funded: true,
        trustlineReady: true,
        trustlineAuthorized: true,
        xlmBalance: "100.0",
        spendableXlmBalance: "100.0",
        lastCheckedAt: expect.any(Date),
      },
    });

    expect(recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "webhook.trustbridge_action_validation",
        targetId: "user-123",
        targetLabel: "test-contributor",
      })
    );
  });

  it("returns 202 status ignored when no matching contributor is registered", async () => {
    const event = {
      schema_version: "1",
      event: "validation_complete",
      timestamp: "2026-08-27T10:00:00.000Z",
      repository: "owner/repo",
      issue_number: 107,
      stellar_address: "GBX7...4Y5Z",
      result: {
        valid: true,
        account_funded: true,
        trustline_exists: true,
        xlm_balance: "100.0",
        checks: [],
      },
    };

    vi.mocked(prisma.registration.findMany).mockResolvedValue([]);

    const req = createWebhookRequest(event);
    const res = await POST(req);
    expect(res.status).toBe(202);

    const json = await res.json();
    expect(json.status).toBe("ignored");
    expect(json.reason).toContain("No matching registered stellar address");
    expect(prisma.registration.update).not.toHaveBeenCalled();
  });

  it("returns 202 status ignored when ambiguous matches occur", async () => {
    const event = {
      schema_version: "1",
      event: "validation_complete",
      timestamp: "2026-08-27T10:00:00.000Z",
      repository: "owner/repo",
      issue_number: 107,
      stellar_address: "GBX7...4Y5Z",
      result: {
        valid: true,
        account_funded: true,
        trustline_exists: true,
        xlm_balance: "100.0",
        checks: [],
      },
    };

    vi.mocked(prisma.registration.findMany).mockResolvedValue([
      {
        id: "reg-1",
        stellarAddress: "GBX7AAAAAAABBBBBBCCCCCCCDDDDDDEEEEEEFFFFFFFGGGGGGG4Y5Z",
        user: { githubUsername: "c1" },
      } as any,
      {
        id: "reg-2",
        stellarAddress: "GBX71111111222222333333344444455555566666677777774Y5Z",
        user: { githubUsername: "c2" },
      } as any,
    ]);

    const req = createWebhookRequest(event);
    const res = await POST(req);
    expect(res.status).toBe(202);

    const json = await res.json();
    expect(json.status).toBe("ignored");
    expect(json.reason).toContain("Ambiguous");
    expect(prisma.registration.update).not.toHaveBeenCalled();
  });
});
