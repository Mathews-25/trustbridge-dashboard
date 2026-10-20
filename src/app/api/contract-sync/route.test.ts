import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-auth", () => ({
  requireMaintainerSession: vi.fn(),
  isAuthorizedScheduler: vi.fn((req: NextRequest) => {
    const secret = process.env.CRON_SECRET?.trim();
    if (!secret) return false;
    return req.headers.get("authorization") === `Bearer ${secret}`;
  }),
}));

vi.mock("@/lib/contract-sync", () => ({
  syncContractToPostgres: vi.fn(),
  getContractSyncHealth: vi.fn(),
}));

import { requireMaintainerSession } from "@/lib/api-auth";
import {
  getContractSyncHealth,
  syncContractToPostgres,
} from "@/lib/contract-sync";
import { GET, POST } from "@/app/api/contract-sync/route";

function post(headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost:3000/api/contract-sync", {
    method: "POST",
    headers: { host: "localhost:3000", ...headers },
  });
}

describe("POST /api/contract-sync", () => {
  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.CRON_SECRET;
  });

  it("returns 403 with no maintainer session and no scheduler secret", async () => {
    vi.mocked(requireMaintainerSession).mockResolvedValue(null);

    const res = await POST(post());

    expect(res.status).toBe(403);
    expect(syncContractToPostgres).not.toHaveBeenCalled();
  });

  it("allows a maintainer session to trigger a sync", async () => {
    vi.mocked(requireMaintainerSession).mockResolvedValue({
      user: { id: "u1", isMaintainer: true },
    } as never);
    vi.mocked(syncContractToPostgres).mockResolvedValue({
      status: "ok",
      startedAt: new Date().toISOString(),
      durationMs: 5,
    });

    const res = await POST(post());

    expect(res.status).toBe(200);
    expect(syncContractToPostgres).toHaveBeenCalledTimes(1);
  });

  it("allows a request bearing a valid CRON_SECRET even without a session", async () => {
    process.env.CRON_SECRET = "s3cr3t";
    vi.mocked(requireMaintainerSession).mockResolvedValue(null);
    vi.mocked(syncContractToPostgres).mockResolvedValue({
      status: "ok",
      startedAt: new Date().toISOString(),
      durationMs: 5,
    });

    const res = await POST(post({ authorization: "Bearer s3cr3t" }));

    expect(res.status).toBe(200);
  });

  it("rejects an invalid CRON_SECRET", async () => {
    process.env.CRON_SECRET = "s3cr3t";
    vi.mocked(requireMaintainerSession).mockResolvedValue(null);

    const res = await POST(post({ authorization: "Bearer wrong" }));

    expect(res.status).toBe(403);
  });

  it("returns 502 when the sync run reports an error", async () => {
    vi.mocked(requireMaintainerSession).mockResolvedValue({
      user: { id: "u1", isMaintainer: true },
    } as never);
    vi.mocked(syncContractToPostgres).mockResolvedValue({
      status: "error",
      startedAt: new Date().toISOString(),
      durationMs: 5,
      error: "Horizon RPC outage",
    });

    const res = await POST(post());

    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error).toBe("Horizon RPC outage");
  });
});

describe("GET /api/contract-sync", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns the last sync result without triggering a new run", async () => {
    vi.mocked(getContractSyncHealth).mockReturnValue({
      status: "ok",
      startedAt: "2026-07-27T00:00:00.000Z",
      durationMs: 12,
    });

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.lastRun.status).toBe("ok");
    expect(syncContractToPostgres).not.toHaveBeenCalled();
  });
});
