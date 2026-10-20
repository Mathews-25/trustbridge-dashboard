import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getConfiguredCadence,
  getDigestDestinationEmail,
  getLastDigestHealth,
  isFullListEnabled,
  resetDigestState,
  runCronDigest,
} from "@/lib/cron-digest";
import { recordAuditLog } from "@/lib/audit";
import { sendEmailNotification } from "@/lib/email";
import { prisma } from "@/lib/prisma";

/**
 * Tests for the cron digest core logic (src/lib/cron-digest.ts).
 *
 * Tests verify:
 * - Successful digest with email when destination is configured
 * - Privacy default: no contributor list in email body unless opt-in
 * - Opt-in full list: NotReadyEntry list populated when DIGEST_INCLUDE_FULL_LIST=true
 * - Readiness tallying: ready / low_reserve / not_ready counts
 * - No email when no destination configured
 * - Rate-limit gate (skipped within interval, force bypasses)
 * - DB error handling → status: "error", digest.cron.failed audit
 * - Config helpers: getDigestDestinationEmail, getConfiguredCadence, isFullListEnabled
 *
 * Watch for: PII (usernames / addresses) in email body when full list is OFF.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────────────────────────────────────

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

vi.mock("@/lib/email", async () => {
  const actual = await vi.importActual<typeof import("@/lib/email")>("@/lib/email");
  return {
    ...actual,
    sendEmailNotification: vi.fn().mockResolvedValue(true),
  };
});

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

/** Ready contributor — funded, trustline present and authorized, healthy balance */
const readyReg = {
  id: "reg-ready",
  stellarAddress: "GBBD47GYE3DOE6SXR46LEN4DFSLE3THQ5VS37GAMMA5SMVVSAVOI5TESL",
  funded: true,
  trustlineReady: true,
  trustlineAuthorized: true,
  xlmBalance: "100.0",
  spendableXlmBalance: "98.5",
  usdcBalance: "50.0",
  lastCheckedAt: new Date(Date.now() - 3_600_000),
  horizonLatencyMs: 120,
  deletedAt: null,
  user: { githubUsername: "alice" },
};

/** Not-ready contributor — funded but no trustline */
const notReadyReg = {
  id: "reg-notready",
  stellarAddress: "GCKFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  funded: true,
  trustlineReady: false,
  trustlineAuthorized: false,
  xlmBalance: "10.0",
  spendableXlmBalance: "8.5",
  usdcBalance: "0.0",
  lastCheckedAt: new Date(Date.now() - 3_600_000),
  horizonLatencyMs: 100,
  deletedAt: null,
  user: { githubUsername: "bob" },
};

/** Low-reserve contributor — funded, trustline present but spendable XLM too low */
const lowReserveReg = {
  id: "reg-lowreserve",
  stellarAddress: "GCCCAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  funded: true,
  trustlineReady: true,
  trustlineAuthorized: true,
  xlmBalance: "1.0",
  spendableXlmBalance: "0.5",   // below default 1.5 threshold → low_reserve
  usdcBalance: "0.0",
  lastCheckedAt: new Date(Date.now() - 3_600_000),
  horizonLatencyMs: 110,
  deletedAt: null,
  user: { githubUsername: "carol" },
};

/** Unfunded contributor */
const unfundedReg = {
  id: "reg-unfunded",
  stellarAddress: "GDDDAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  funded: false,
  trustlineReady: false,
  trustlineAuthorized: false,
  xlmBalance: "0.0",
  spendableXlmBalance: "0.0",
  usdcBalance: "0.0",
  lastCheckedAt: null,
  horizonLatencyMs: null,
  deletedAt: null,
  user: { githubUsername: "dave" },
};

// ─────────────────────────────────────────────────────────────────────────────
// Main digest tests
// ─────────────────────────────────────────────────────────────────────────────

describe("runCronDigest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDigestState();
    delete process.env.DIGEST_EMAIL;
    delete process.env.TREASURY_EXPORT_EMAIL;
    delete process.env.CRON_EXPORT_EMAIL;
    delete process.env.DIGEST_INCLUDE_FULL_LIST;
    delete process.env.DIGEST_CRON_MIN_INTERVAL_MS;
    delete process.env.DIGEST_CADENCE;
  });

  // ── Successful run ──────────────────────────────────────────────────────────

  it("returns ok status and correct counts with a mixed readiness set", async () => {
    vi.mocked(prisma.registration.findMany).mockResolvedValue(
      [readyReg, notReadyReg, lowReserveReg] as never
    );
    process.env.DIGEST_EMAIL = "ops@example.com";

    const result = await runCronDigest();

    expect(result.status).toBe("ok");
    expect(result.totalContributors).toBe(3);
    expect(result.readyCount).toBe(1);
    expect(result.lowReserveCount).toBe(1);
    expect(result.notReadyCount).toBe(2); // low_reserve + not_ready both counted
    expect(result.destination).toBe("ops@example.com");
    expect(result.emailSent).toBe(true);
  });

  it("sends exactly one email per run (not one per contributor)", async () => {
    vi.mocked(prisma.registration.findMany).mockResolvedValue(
      [readyReg, notReadyReg, lowReserveReg, unfundedReg] as never
    );
    process.env.DIGEST_EMAIL = "ops@example.com";

    await runCronDigest();

    expect(sendEmailNotification).toHaveBeenCalledTimes(1);
  });

  it("sends to DIGEST_EMAIL destination", async () => {
    vi.mocked(prisma.registration.findMany).mockResolvedValue([readyReg] as never);
    process.env.DIGEST_EMAIL = "digest@example.com";

    await runCronDigest();

    expect(sendEmailNotification).toHaveBeenCalledWith(
      expect.objectContaining({ to: "digest@example.com" })
    );
  });

  it("falls back to TREASURY_EXPORT_EMAIL when DIGEST_EMAIL is unset", async () => {
    vi.mocked(prisma.registration.findMany).mockResolvedValue([readyReg] as never);
    process.env.TREASURY_EXPORT_EMAIL = "treasury@example.com";

    await runCronDigest();

    expect(sendEmailNotification).toHaveBeenCalledWith(
      expect.objectContaining({ to: "treasury@example.com" })
    );
  });

  it("uses daily subject line by default", async () => {
    vi.mocked(prisma.registration.findMany).mockResolvedValue([readyReg] as never);
    process.env.DIGEST_EMAIL = "ops@example.com";

    await runCronDigest();

    expect(sendEmailNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: expect.stringContaining("Daily"),
      })
    );
  });

  it("uses weekly subject line when cadence option is weekly", async () => {
    vi.mocked(prisma.registration.findMany).mockResolvedValue([readyReg] as never);
    process.env.DIGEST_EMAIL = "ops@example.com";

    await runCronDigest({ cadence: "weekly" });

    expect(sendEmailNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: expect.stringContaining("Weekly"),
      })
    );
  });

  // ── Privacy default ─────────────────────────────────────────────────────────

  it("does NOT include contributor usernames in email body by default", async () => {
    vi.mocked(prisma.registration.findMany).mockResolvedValue(
      [notReadyReg, unfundedReg] as never
    );
    process.env.DIGEST_EMAIL = "ops@example.com";
    // DIGEST_INCLUDE_FULL_LIST not set → privacy default

    await runCronDigest();

    const emailCall = vi.mocked(sendEmailNotification).mock.calls[0][0];
    expect(emailCall.body).not.toContain("bob");
    expect(emailCall.body).not.toContain("dave");
    expect(emailCall.body).not.toContain("@");
  });

  it("does NOT include notReadyList in result by default", async () => {
    vi.mocked(prisma.registration.findMany).mockResolvedValue(
      [notReadyReg] as never
    );
    process.env.DIGEST_EMAIL = "ops@example.com";

    const result = await runCronDigest();

    expect(result.notReadyList).toBeUndefined();
  });

  // ── Opt-in full list ────────────────────────────────────────────────────────

  it("includes contributor usernames in email body when DIGEST_INCLUDE_FULL_LIST=true", async () => {
    vi.mocked(prisma.registration.findMany).mockResolvedValue(
      [notReadyReg, unfundedReg] as never
    );
    process.env.DIGEST_EMAIL = "ops@example.com";
    process.env.DIGEST_INCLUDE_FULL_LIST = "true";

    await runCronDigest();

    const emailCall = vi.mocked(sendEmailNotification).mock.calls[0][0];
    expect(emailCall.body).toContain("bob");
    expect(emailCall.body).toContain("dave");
  });

  it("includes notReadyList in result when DIGEST_INCLUDE_FULL_LIST=true", async () => {
    vi.mocked(prisma.registration.findMany).mockResolvedValue(
      [notReadyReg, lowReserveReg] as never
    );
    process.env.DIGEST_EMAIL = "ops@example.com";
    process.env.DIGEST_INCLUDE_FULL_LIST = "true";

    const result = await runCronDigest();

    expect(result.notReadyList).toBeDefined();
    expect(result.notReadyList).toHaveLength(2);
    const usernames = result.notReadyList!.map((e) => e.githubUsername);
    expect(usernames).toContain("bob");
    expect(usernames).toContain("carol");
  });

  it("correctly assigns reasons in the full list", async () => {
    vi.mocked(prisma.registration.findMany).mockResolvedValue(
      [notReadyReg, lowReserveReg, unfundedReg] as never
    );
    process.env.DIGEST_EMAIL = "ops@example.com";
    process.env.DIGEST_INCLUDE_FULL_LIST = "true";

    const result = await runCronDigest();

    const byUsername = Object.fromEntries(
      result.notReadyList!.map((e) => [e.githubUsername, e.reason])
    );
    expect(byUsername["bob"]).toBe("no_trustline");
    expect(byUsername["carol"]).toBe("low_reserve");
    expect(byUsername["dave"]).toBe("unfunded");
  });

  // ── No destination configured ───────────────────────────────────────────────

  it("returns ok and does not send email when no destination is configured", async () => {
    vi.mocked(prisma.registration.findMany).mockResolvedValue(
      [notReadyReg] as never
    );

    const result = await runCronDigest();

    expect(result.status).toBe("ok");
    expect(result.destination).toBeUndefined();
    expect(result.emailSent).toBe(false);
    expect(sendEmailNotification).not.toHaveBeenCalled();
  });

  // ── Audit logging ───────────────────────────────────────────────────────────

  it("records digest.cron audit log on success", async () => {
    vi.mocked(prisma.registration.findMany).mockResolvedValue(
      [readyReg, notReadyReg] as never
    );
    process.env.DIGEST_EMAIL = "ops@example.com";

    await runCronDigest({ actorId: "m-1", actorLogin: "alice" });

    expect(recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "digest.cron",
        actorId: "m-1",
        actorLogin: "alice",
        metadata: expect.objectContaining({
          totalContributors: 2,
          readyCount: 1,
          notReadyCount: 1,
          emailSent: true,
        }),
      })
    );
  });

  it("uses scheduler:cron as default actorLogin", async () => {
    vi.mocked(prisma.registration.findMany).mockResolvedValue([readyReg] as never);
    process.env.DIGEST_EMAIL = "ops@example.com";

    await runCronDigest();

    expect(recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ actorLogin: "scheduler:cron" })
    );
  });

  it("includes cadence in the audit log metadata", async () => {
    vi.mocked(prisma.registration.findMany).mockResolvedValue([readyReg] as never);
    process.env.DIGEST_EMAIL = "ops@example.com";

    await runCronDigest({ cadence: "weekly" });

    expect(recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ cadence: "weekly" }),
      })
    );
  });

  // ── Rate limiting ───────────────────────────────────────────────────────────

  it("skips a second run within the min-interval window", async () => {
    vi.mocked(prisma.registration.findMany).mockResolvedValue([readyReg] as never);
    process.env.DIGEST_CRON_MIN_INTERVAL_MS = "60000";

    const first = await runCronDigest();
    expect(first.status).toBe("ok");

    const second = await runCronDigest();
    expect(second.status).toBe("skipped");
    expect(second.error).toContain("Rate limited");
    expect(prisma.registration.findMany).toHaveBeenCalledTimes(1);
  });

  it("force option bypasses the rate gate", async () => {
    vi.mocked(prisma.registration.findMany).mockResolvedValue([readyReg] as never);
    process.env.DIGEST_CRON_MIN_INTERVAL_MS = "60000";

    await runCronDigest();
    const forced = await runCronDigest({ force: true });

    expect(forced.status).toBe("ok");
    expect(prisma.registration.findMany).toHaveBeenCalledTimes(2);
  });

  // ── Error handling ──────────────────────────────────────────────────────────

  it("returns error status on DB failure", async () => {
    vi.mocked(prisma.registration.findMany).mockRejectedValue(
      new Error("Connection timeout")
    );

    const result = await runCronDigest();

    expect(result.status).toBe("error");
    expect(result.error).toBe("Connection timeout");
  });

  it("records digest.cron.failed on DB failure", async () => {
    vi.mocked(prisma.registration.findMany).mockRejectedValue(
      new Error("Connection timeout")
    );

    await runCronDigest();

    expect(recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "digest.cron.failed",
        metadata: expect.objectContaining({ error: "Connection timeout" }),
      })
    );
  });

  it("handles non-Error thrown values gracefully", async () => {
    vi.mocked(prisma.registration.findMany).mockRejectedValue("string error");

    const result = await runCronDigest();

    expect(result.status).toBe("error");
    expect(result.error).toBe("string error");
  });

  // ── Health / state ──────────────────────────────────────────────────────────

  it("getLastDigestHealth returns null before first run", () => {
    expect(getLastDigestHealth()).toBeNull();
  });

  it("getLastDigestHealth reflects the most recent run result", async () => {
    vi.mocked(prisma.registration.findMany).mockResolvedValue([readyReg] as never);
    process.env.DIGEST_EMAIL = "ops@example.com";

    const result = await runCronDigest();
    expect(getLastDigestHealth()).toEqual(result);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Config helpers
// ─────────────────────────────────────────────────────────────────────────────

describe("getDigestDestinationEmail", () => {
  beforeEach(() => {
    delete process.env.DIGEST_EMAIL;
    delete process.env.TREASURY_EXPORT_EMAIL;
    delete process.env.CRON_EXPORT_EMAIL;
  });

  it("returns DIGEST_EMAIL when set", () => {
    process.env.DIGEST_EMAIL = "digest@example.com";
    expect(getDigestDestinationEmail()).toBe("digest@example.com");
  });

  it("falls back to TREASURY_EXPORT_EMAIL", () => {
    process.env.TREASURY_EXPORT_EMAIL = "treasury@example.com";
    expect(getDigestDestinationEmail()).toBe("treasury@example.com");
  });

  it("falls back to CRON_EXPORT_EMAIL as last resort", () => {
    process.env.CRON_EXPORT_EMAIL = "cron@example.com";
    expect(getDigestDestinationEmail()).toBe("cron@example.com");
  });

  it("returns empty string when none are set", () => {
    expect(getDigestDestinationEmail()).toBe("");
  });

  it("DIGEST_EMAIL takes precedence over TREASURY_EXPORT_EMAIL", () => {
    process.env.DIGEST_EMAIL = "digest@example.com";
    process.env.TREASURY_EXPORT_EMAIL = "treasury@example.com";
    expect(getDigestDestinationEmail()).toBe("digest@example.com");
  });
});

describe("getConfiguredCadence", () => {
  beforeEach(() => {
    delete process.env.DIGEST_CADENCE;
  });

  it("defaults to daily when unset", () => {
    expect(getConfiguredCadence()).toBe("daily");
  });

  it("returns weekly when DIGEST_CADENCE=weekly", () => {
    process.env.DIGEST_CADENCE = "weekly";
    expect(getConfiguredCadence()).toBe("weekly");
  });

  it("is case-insensitive", () => {
    process.env.DIGEST_CADENCE = "WEEKLY";
    expect(getConfiguredCadence()).toBe("weekly");
  });

  it("falls back to daily for unknown values", () => {
    process.env.DIGEST_CADENCE = "monthly";
    expect(getConfiguredCadence()).toBe("daily");
  });
});

describe("isFullListEnabled", () => {
  beforeEach(() => {
    delete process.env.DIGEST_INCLUDE_FULL_LIST;
  });

  it("returns false by default", () => {
    expect(isFullListEnabled()).toBe(false);
  });

  it("returns true for DIGEST_INCLUDE_FULL_LIST=true", () => {
    process.env.DIGEST_INCLUDE_FULL_LIST = "true";
    expect(isFullListEnabled()).toBe(true);
  });

  it("returns true for DIGEST_INCLUDE_FULL_LIST=1", () => {
    process.env.DIGEST_INCLUDE_FULL_LIST = "1";
    expect(isFullListEnabled()).toBe(true);
  });

  it("returns true for DIGEST_INCLUDE_FULL_LIST=yes", () => {
    process.env.DIGEST_INCLUDE_FULL_LIST = "yes";
    expect(isFullListEnabled()).toBe(true);
  });

  it("returns false for DIGEST_INCLUDE_FULL_LIST=false", () => {
    process.env.DIGEST_INCLUDE_FULL_LIST = "false";
    expect(isFullListEnabled()).toBe(false);
  });
});
