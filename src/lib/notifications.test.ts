import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createNotification,
  getNotificationsForUser,
  markNotificationsAsRead,
  sanitizeNotificationPii,
  truncateNotificationText,
} from "./notifications";

// Mock Prisma
vi.mock("@/lib/prisma", () => ({
  prisma: {
    notification: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";

describe("notifications library", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("sanitizeNotificationPii", () => {
    it("redacts email addresses", () => {
      const input = "User alice@example.com submitted a request for bob.smith@domain.co.uk";
      const sanitized = sanitizeNotificationPii(input);
      expect(sanitized).toBe(
        "User [redacted-email] submitted a request for [redacted-email]"
      );
    });

    it("redacts Stellar G-addresses", () => {
      const address = "GDXNXL25GDM3N5LAR5FALA3VSGHFET3EOKLXRP3ITPPMR3PISTQSKSFS";
      const input = `Wallet ${address} was checked`;
      const sanitized = sanitizeNotificationPii(input);
      expect(sanitized).toBe("Wallet [redacted-address] was checked");
    });
  });

  describe("truncateNotificationText", () => {
    it("returns unchanged text if under maxLength", () => {
      expect(truncateNotificationText("Short text", 20)).toBe("Short text");
    });

    it("truncates and appends ellipsis if over maxLength", () => {
      const text = "A".repeat(150);
      const truncated = truncateNotificationText(text, 100);
      expect(truncated.length).toBe(100);
      expect(truncated.endsWith("...")).toBe(true);
    });
  });

  describe("createNotification", () => {
    it("sanitizes and truncates inputs before creating DB record", async () => {
      vi.mocked(prisma.notification.create).mockResolvedValue({} as any);

      await createNotification({
        userId: "user-1",
        type: "BATCH_JOB_COMPLETED",
        title: `Batch check for alice@example.com finished ${"!".repeat(100)}`,
        body: `Details for GDXNXL25GDM3N5LAR5FALA3VSGHFET3EOKLXRP3ITPPMR3PISTQSKSFS`,
      });

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: "user-1",
          maintainerOrgId: "default",
          type: "BATCH_JOB_COMPLETED",
          title: expect.not.stringContaining("alice@example.com"),
          body: expect.not.stringContaining("GDXNXL25GDM3N5LAR5FALA3VSGHFET3EOKLXRP3ITPPMR3PISTQSKSFS"),
        }),
      });
    });
  });

  describe("getNotificationsForUser", () => {
    it("fetches user-only notifications for non-maintainers", async () => {
      vi.mocked(prisma.notification.findMany).mockResolvedValue([]);
      vi.mocked(prisma.notification.count).mockResolvedValue(0);

      await getNotificationsForUser("user-1", false);

      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: "user-1",
            maintainerOrgId: "default",
          }),
        })
      );
    });

    it("includes broadcast notifications (userId null) for maintainers", async () => {
      vi.mocked(prisma.notification.findMany).mockResolvedValue([]);
      vi.mocked(prisma.notification.count).mockResolvedValue(0);

      await getNotificationsForUser("maintainer-1", true);

      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [{ userId: "maintainer-1" }, { userId: null }],
            maintainerOrgId: "default",
          }),
        })
      );
    });
  });

  describe("markNotificationsAsRead (IDOR Protection)", () => {
    it("restricts updates to the authenticated user's notifications", async () => {
      vi.mocked(prisma.notification.updateMany).mockResolvedValue({ count: 1 });
      vi.mocked(prisma.notification.count).mockResolvedValue(0);

      await markNotificationsAsRead("user-1", false, ["notif-1"]);

      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          userId: "user-1",
          id: { in: ["notif-1"] },
          read: false,
        }),
        data: expect.objectContaining({
          read: true,
        }),
      });
    });
  });
});
