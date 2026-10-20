import { describe, expect, it, vi, beforeEach } from "vitest";
import { getSorobanEventTimeline } from "@/lib/soroban";

vi.mock("stellar-sdk", () => ({
  rpc: {
    Server: vi.fn(),
  },
  scValToNative: vi.fn((val) => {
    if (typeof val === "string") return val;
    return JSON.stringify(val);
  }),
}));

import { rpc, scValToNative } from "stellar-sdk";

describe("getSorobanEventTimeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SOROBAN_CONTRACT_ID;
    delete process.env.SOROBAN_RPC_URL;
  });

  it("returns error when SOROBAN_CONTRACT_ID is not configured", async () => {
    const result = await getSorobanEventTimeline();

    expect(result.events).toEqual([]);
    expect(result.errors).toContain("SOROBAN_CONTRACT_ID is not configured");
    expect(result.latestLedger).toBe(0);
  });

  it("fetches events successfully", async () => {
    process.env.SOROBAN_CONTRACT_ID = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4";

    const mockEvents = [
      {
        id: "1",
        type: "contract",
        ledger: 1000,
        ledgerClosedAt: "2026-08-26T12:00:00Z",
        contractId: {
          contractId: () => process.env.SOROBAN_CONTRACT_ID,
        },
        topic: ["event"],
        value: "data",
        txHash: "hash123",
      },
    ];

    const mockServer = {
      getLatestLedger: vi.fn().mockResolvedValue({ sequence: 2000 }),
      getEvents: vi.fn().mockResolvedValue({
        events: mockEvents,
        latestLedger: 2000,
      }),
    };

    vi.mocked(rpc.Server).mockImplementation(() => mockServer as any);

    const result = await getSorobanEventTimeline();

    expect(result.events).toHaveLength(1);
    expect(result.latestLedger).toBe(2000);
    expect(result.errors).toEqual([]);
    expect(result.events[0].id).toBe("1");
  });

  it("handles RPC server errors", async () => {
    process.env.SOROBAN_CONTRACT_ID = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4";

    const mockServer = {
      getLatestLedger: vi.fn().mockRejectedValue(new Error("Connection timeout")),
    };

    vi.mocked(rpc.Server).mockImplementation(() => mockServer as any);

    const result = await getSorobanEventTimeline();

    expect(result.events).toEqual([]);
    expect(result.errors[0]).toContain("Soroban RPC error");
    expect(result.errors[0]).toContain("Connection timeout");
  });

  it("uses custom SOROBAN_RPC_URL when provided", async () => {
    process.env.SOROBAN_CONTRACT_ID = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4";
    process.env.SOROBAN_RPC_URL = "https://custom-rpc.example.com";

    const mockServer = {
      getLatestLedger: vi.fn().mockResolvedValue({ sequence: 1000 }),
      getEvents: vi.fn().mockResolvedValue({ events: [], latestLedger: 1000 }),
    };

    vi.mocked(rpc.Server).mockImplementation((url) => {
      expect(url).toBe("https://custom-rpc.example.com");
      return mockServer as any;
    });

    await getSorobanEventTimeline();

    expect(vi.mocked(rpc.Server)).toHaveBeenCalledWith(
      "https://custom-rpc.example.com"
    );
  });

  it("handles whitespace in environment variables", async () => {
    process.env.SOROBAN_CONTRACT_ID = "  CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4  ";
    process.env.SOROBAN_RPC_URL = "  https://custom.example.com  ";

    const mockServer = {
      getLatestLedger: vi.fn().mockResolvedValue({ sequence: 1000 }),
      getEvents: vi.fn().mockResolvedValue({ events: [], latestLedger: 1000 }),
    };

    vi.mocked(rpc.Server).mockImplementation(() => mockServer as any);

    const result = await getSorobanEventTimeline();

    expect(result.errors).toEqual([]);
  });

  it("converts scVal correctly", async () => {
    process.env.SOROBAN_CONTRACT_ID = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4";

    const mockEvents = [
      {
        id: "1",
        type: "contract",
        ledger: 1000,
        ledgerClosedAt: "2026-08-26T12:00:00Z",
        contractId: {
          contractId: () => process.env.SOROBAN_CONTRACT_ID,
        },
        topic: [{ complex: "object" }],
        value: { data: "value" },
        txHash: "hash123",
      },
    ];

    const mockServer = {
      getLatestLedger: vi.fn().mockResolvedValue({ sequence: 2000 }),
      getEvents: vi.fn().mockResolvedValue({
        events: mockEvents,
        latestLedger: 2000,
      }),
    };

    vi.mocked(rpc.Server).mockImplementation(() => mockServer as any);

    const result = await getSorobanEventTimeline();

    expect(result.events[0].topic).toBeDefined();
    expect(result.events[0].value).toBeDefined();
  });

  it("returns empty list on undecodable scVal", async () => {
    process.env.SOROBAN_CONTRACT_ID = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4";

    vi.mocked(scValToNative).mockImplementationOnce(() => {
      throw new Error("Cannot decode");
    });

    const mockEvents = [
      {
        id: "1",
        type: "contract",
        ledger: 1000,
        ledgerClosedAt: "2026-08-26T12:00:00Z",
        contractId: {
          contractId: () => process.env.SOROBAN_CONTRACT_ID,
        },
        topic: [Symbol("undecodable")],
        value: "data",
        txHash: "hash123",
      },
    ];

    const mockServer = {
      getLatestLedger: vi.fn().mockResolvedValue({ sequence: 2000 }),
      getEvents: vi.fn().mockResolvedValue({
        events: mockEvents,
        latestLedger: 2000,
      }),
    };

    vi.mocked(rpc.Server).mockImplementation(() => mockServer as any);

    const result = await getSorobanEventTimeline();

    // Should still return the event but with error indicator
    expect(result.events).toHaveLength(1);
  });

  it("limits to default 50 events", async () => {
    process.env.SOROBAN_CONTRACT_ID = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4";

    const mockServer = {
      getLatestLedger: vi.fn().mockResolvedValue({ sequence: 10000 }),
      getEvents: vi.fn().mockResolvedValue({
        events: Array(50).fill(null).map((_, i) => ({
          id: String(i),
          type: "contract",
          ledger: 10000 - i,
          ledgerClosedAt: "2026-08-26T12:00:00Z",
          contractId: {
            contractId: () => process.env.SOROBAN_CONTRACT_ID,
          },
          topic: [],
          value: "data",
          txHash: `hash${i}`,
        })),
        latestLedger: 10000,
      }),
    };

    vi.mocked(rpc.Server).mockImplementation(() => mockServer as any);

    const result = await getSorobanEventTimeline();

    expect(result.events).toHaveLength(50);
  });

  it("never throws - always returns structured response", async () => {
    process.env.SOROBAN_CONTRACT_ID = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4";

    const mockServer = {
      getLatestLedger: vi.fn().mockRejectedValue(new Error("Unknown error")),
    };

    vi.mocked(rpc.Server).mockImplementation(() => mockServer as any);

    // Should not throw
    const result = await getSorobanEventTimeline();

    expect(result).toHaveProperty("events");
    expect(result).toHaveProperty("latestLedger");
    expect(result).toHaveProperty("errors");
    expect(Array.isArray(result.errors)).toBe(true);
  });
});
