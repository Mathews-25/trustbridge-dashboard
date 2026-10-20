import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    registration: {
      findUnique: vi.fn(),
    },
    addressHistoryRecord: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  recordInitialAddress,
  recordAddressChange,
  getAddressHistory,
  getLatestAddress,
} from "@/lib/address-history";

describe("Address History", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("recordInitialAddress", () => {
    it("records initial address for a new registration", async () => {
      const userId = "user-1";
      const address = "GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTGSNLAYWBEJCLLWTG5V5TGO7Z";

      vi.mocked(prisma.registration.findUnique).mockResolvedValueOnce({
        id: "reg-1",
        userId,
        stellarAddress: address,
      } as any);

      vi.mocked(prisma.addressHistoryRecord.create).mockResolvedValueOnce({
        id: "hist-1",
        userId,
        previousAddress: null,
        newAddress: address,
        changeType: "initial",
        recordedAt: new Date(),
      } as any);

      await recordInitialAddress(userId, address);

      expect(prisma.addressHistoryRecord.create).toHaveBeenCalledWith({
        data: {
          userId,
          previousAddress: null,
          newAddress: address,
          changeType: "initial",
        },
      });
    });

    it("skips recording if no registration exists", async () => {
      const userId = "user-1";
      const address = "GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTGSNLAYWBEJCLLWTG5V5TGO7Z";

      vi.mocked(prisma.registration.findUnique).mockResolvedValueOnce(null);

      await recordInitialAddress(userId, address);

      expect(prisma.addressHistoryRecord.create).not.toHaveBeenCalled();
    });
  });

  describe("recordAddressChange", () => {
    it("records address change with previous address", async () => {
      const userId = "user-1";
      const previousAddress =
        "GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTGSNLAYWBEJCLLWTG5V5TGO7Z";
      const newAddress = "GBBD47UZM2HCF4DAELFSWHYQES7JJLSOHSZTW6YCHLYGUYMPLQMZCSSD";

      vi.mocked(prisma.addressHistoryRecord.create).mockResolvedValueOnce({
        id: "hist-2",
        userId,
        previousAddress,
        newAddress,
        changeType: "updated",
        recordedAt: new Date(),
      } as any);

      await recordAddressChange(userId, previousAddress, newAddress);

      expect(prisma.addressHistoryRecord.create).toHaveBeenCalledWith({
        data: {
          userId,
          previousAddress,
          newAddress,
          changeType: "updated",
        },
      });
    });
  });

  describe("getAddressHistory", () => {
    it("returns address history ordered by most recent first", async () => {
      const userId = "user-1";
      const now = new Date();
      const earlier = new Date(now.getTime() - 86400000); // 1 day earlier

      vi.mocked(prisma.addressHistoryRecord.findMany).mockResolvedValueOnce([
        {
          newAddress: "GBBD47UZM2HCF4DAELFSWHYQES7JJLSOHSZTW6YCHLYGUYMPLQMZCSSD",
          changeType: "updated",
          recordedAt: now,
        },
        {
          newAddress: "GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTGSNLAYWBEJCLLWTG5V5TGO7Z",
          changeType: "initial",
          recordedAt: earlier,
        },
      ] as any);

      const history = await getAddressHistory(userId);

      expect(history).toHaveLength(2);
      expect(history[0].stellarAddress).toBe(
        "GBBD47UZM2HCF4DAELFSWHYQES7JJLSOHSZTW6YCHLYGUYMPLQMZCSSD"
      );
      expect(history[0].changeType).toBe("updated");
      expect(history[1].changeType).toBe("initial");
    });

    it("returns empty array when no history exists", async () => {
      const userId = "user-1";

      vi.mocked(prisma.addressHistoryRecord.findMany).mockResolvedValueOnce([]);

      const history = await getAddressHistory(userId);

      expect(history).toEqual([]);
    });
  });

  describe("getLatestAddress", () => {
    it("returns the most recent address", async () => {
      const userId = "user-1";
      const latestAddress =
        "GBBD47UZM2HCF4DAELFSWHYQES7JJLSOHSZTW6YCHLYGUYMPLQMZCSSD";

      vi.mocked(prisma.addressHistoryRecord.findFirst).mockResolvedValueOnce({
        newAddress: latestAddress,
      } as any);

      const address = await getLatestAddress(userId);

      expect(address).toBe(latestAddress);
      expect(prisma.addressHistoryRecord.findFirst).toHaveBeenCalledWith({
        where: { userId },
        select: { newAddress: true },
        orderBy: { recordedAt: "desc" },
      });
    });

    it("returns null when no address history exists", async () => {
      const userId = "user-1";

      vi.mocked(prisma.addressHistoryRecord.findFirst).mockResolvedValueOnce(
        null
      );

      const address = await getLatestAddress(userId);

      expect(address).toBeNull();
    });
  });
});
