import { describe, it, expect, vi, afterEach } from "vitest";
import { GET } from "@/app/api/settings/network/route";
import * as networkRoute from "@/app/api/settings/network/route";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  recordAuditLog: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { recordAuditLog } from "@/lib/audit";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.clearAllMocks();
});

describe("GET /api/settings/network", () => {
  it("does not expose settings write handlers", () => {
    expect(networkRoute).not.toHaveProperty("POST");
    expect(networkRoute).not.toHaveProperty("PUT");
    expect(networkRoute).not.toHaveProperty("PATCH");
    expect(networkRoute).not.toHaveProperty("DELETE");
  });

  it("returns 403 for an unauthenticated request", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);

    const res = await GET();
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("Forbidden");
    expect(recordAuditLog).not.toHaveBeenCalled();
  });

  it("returns 403 for a non-maintainer session", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user-1", isMaintainer: false },
    } as any);

    const res = await GET();
    expect(res.status).toBe(403);
    expect(recordAuditLog).not.toHaveBeenCalled();
  });

  it("returns 200 with network config for a maintainer and does not audit when networks match", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user-1", isMaintainer: true, githubUsername: "octocat" },
    } as any);
    process.env.NEXT_PUBLIC_HORIZON_URL = "https://horizon-testnet.stellar.org";
    process.env.SOROBAN_RPC_URL = "https://soroban-testnet.stellar.org";

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.mismatched).toBe(false);
    expect(json.horizonNetwork).toBe("testnet");
    expect(json.sorobanNetwork).toBe("testnet");
    expect(recordAuditLog).not.toHaveBeenCalled();
  });

  it("records an audit entry when a network mismatch is detected", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user-1", isMaintainer: true, githubUsername: "octocat" },
    } as any);
    process.env.NEXT_PUBLIC_HORIZON_URL = "https://horizon.stellar.org";
    process.env.SOROBAN_RPC_URL = "https://soroban-testnet.stellar.org";

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.mismatched).toBe(true);
    expect(recordAuditLog).toHaveBeenCalledTimes(1);
    expect(recordAuditLog).toHaveBeenCalledWith(
      {
        action: "network_config_mismatch_detected",
        actorId: "user-1",
        actorLogin: "octocat",
        targetLabel: "network-config",
        metadata: {
          horizonNetwork: "mainnet",
          sorobanNetwork: "testnet",
          horizonUrl: "https://horizon.stellar.org",
          sorobanUrl: "https://soroban-testnet.stellar.org",
        },
      }
    );
  });
});
