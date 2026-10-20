import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    sorobanEventCursor: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  getStoredEventCursor,
  updateStoredEventCursor,
  backfillSorobanEvents,
} from "./soroban-events-backfill";

describe("Soroban Event Backfill with Persistent Cursor (#198)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retrieves stored cursor for maintainer org and event type", async () => {
    vi.mocked(prisma.sorobanEventCursor.findUnique).mockResolvedValueOnce({
      id: "cursor-1",
      maintainerOrgId: "default",
      eventType: "contract",
      cursor: "token-100",
      lastPagingToken: "token-100",
      lastSyncedAt: new Date(),
      updatedAt: new Date(),
    });

    const cursor = await getStoredEventCursor("contract", "default");
    expect(cursor).toBe("token-100");
  });

  it("upserts new cursor when backfilling events", async () => {
    vi.mocked(prisma.sorobanEventCursor.upsert).mockResolvedValueOnce({} as any);

    const mockEvents = [
      {
        id: "evt-1",
        ledger: 100,
        type: "contract" as const,
        topic: "register",
        contractId: "C123",
        createdAt: "2026-08-29T10:00:00Z",
        pagingToken: "token-100",
      },
      {
        id: "evt-2",
        ledger: 105,
        type: "contract" as const,
        topic: "register",
        contractId: "C123",
        createdAt: "2026-08-29T10:05:00Z",
        pagingToken: "token-105",
      },
    ];

    const result = await backfillSorobanEvents(mockEvents, { eventType: "contract" });

    expect(result.eventsSynced).toBe(2);
    expect(result.newCursor).toBe("token-105");
    expect(prisma.sorobanEventCursor.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          maintainerOrgId_eventType: {
            maintainerOrgId: "default",
            eventType: "contract",
          },
        },
        create: expect.objectContaining({ cursor: "token-105" }),
      })
    );
  });
});
