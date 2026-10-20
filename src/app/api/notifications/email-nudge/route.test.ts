import type { Session } from "next-auth";
import { describe, expect, it, vi } from "vitest";

import { POST, GET } from "@/app/api/notifications/email-nudge/route";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {},
}));

vi.mock("@/lib/email", () => ({
  sendEmailNotification: vi.fn(),
  buildNotReadyEmailBody: vi.fn(),
}));

vi.mock("@/lib/readiness", () => ({
  computeReadiness: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    registration: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/audit", () => ({
  recordAuditLog: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { sendEmailNotification, buildNotReadyEmailBody } from "@/lib/email";
import { computeReadiness } from "@/lib/readiness";
import { prisma } from "@/lib/prisma";
import { recordAuditLog } from "@/lib/audit";
import { NextRequest } from "next/server";

describe("Email nudge endpoint", () => {
  describe("GET /api/notifications/email-nudge", () => {
    it("returns 403 for non-maintainer session", async () => {
      vi.mocked(getServerSession).mockResolvedValue({
        user: { id: "user-1", isMaintainer: false },
        expires: "2099-01-01T00:00:00.000Z",
      } satisfies Session);

      const res = await GET(new NextRequest("http://localhost/api/notifications/email-nudge"));
      expect(res.status).toBe(403);
    });

    it("returns not-ready contributors list", async () => {
      vi.mocked(getServerSession).mockResolvedValue({
        user: { id: "user-1", isMaintainer: true, email: "maintainer@test.com" },
        expires: "2099-01-01T00:00:00.000Z",
      } satisfies Session);

      vi.mocked(prisma.registration.findMany).mockResolvedValue([
        {
          id: "reg-1",
          userId: "user-2",
          funded: false,
          trustlineReady: true,
          trustlineAuthorized: true,
          xlmBalance: "100",
          spendableXlmBalance: "100",
          user: {
            githubUsername: "testuser",
            email: "test@example.com",
          },
        },
      ] as any);

      vi.mocked(computeReadiness).mockReturnValue("not_ready");

      const res = await GET(new NextRequest("http://localhost/api/notifications/email-nudge"));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.notReady).toHaveLength(1);
      expect(json.notReady[0].githubUsername).toBe("testuser");
    });
  });

  describe("POST /api/notifications/email-nudge", () => {
    it("sends emails to not-ready contributors", async () => {
      vi.mocked(getServerSession).mockResolvedValue({
        user: {
          id: "user-1",
          isMaintainer: true,
          email: "maintainer@test.com",
          name: "Test Maintainer",
          githubUsername: "maintainer",
        },
        expires: "2099-01-01T00:00:00.000Z",
      } satisfies Session);

      vi.mocked(prisma.registration.findMany).mockResolvedValue([
        {
          id: "reg-1",
          userId: "user-2",
          funded: false,
          trustlineReady: true,
          trustlineAuthorized: true,
          xlmBalance: "100",
          spendableXlmBalance: "100",
          user: {
            githubUsername: "testuser",
            email: "test@example.com",
          },
        },
      ] as any);

      vi.mocked(computeReadiness).mockReturnValue("not_ready");
      vi.mocked(buildNotReadyEmailBody).mockReturnValue("<p>Not ready</p>");
      vi.mocked(sendEmailNotification).mockResolvedValue(true);

      const res = await POST(
        new NextRequest("http://localhost/api/notifications/email-nudge", {
          method: "POST",
          headers: { origin: "http://localhost" },
        })
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.sentCount).toBe(1);
      expect(json.totalNotReady).toBe(1);
      expect(sendEmailNotification).toHaveBeenCalled();
      expect(recordAuditLog).toHaveBeenCalled();
    });

    it("returns 403 for non-maintainer", async () => {
      vi.mocked(getServerSession).mockResolvedValue({
        user: { id: "user-1", isMaintainer: false },
        expires: "2099-01-01T00:00:00.000Z",
      } satisfies Session);

      const res = await POST(
        new NextRequest("http://localhost/api/notifications/email-nudge", {
          method: "POST",
          headers: { origin: "http://localhost" },
        })
      );

      expect(res.status).toBe(403);
    });

    it("returns 400 if maintainer email not configured", async () => {
      vi.mocked(getServerSession).mockResolvedValue({
        user: { id: "user-1", isMaintainer: true, email: null },
        expires: "2099-01-01T00:00:00.000Z",
      } satisfies Session);

      const res = await POST(
        new NextRequest("http://localhost/api/notifications/email-nudge", {
          method: "POST",
          headers: { origin: "http://localhost" },
        })
      );

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("email not configured");
    });
  });
});
