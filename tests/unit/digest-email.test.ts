import { describe, expect, it, beforeEach, afterEach } from "vitest";

import { buildDigestEmailBody } from "@/lib/email";

/**
 * Unit tests for buildDigestEmailBody.
 *
 * Tests verify:
 * - Privacy default: only counts and dashboard link, no contributor names
 * - Opt-in full list: contributor usernames and reasons rendered
 * - XSS safety: HTML-special chars in usernames are escaped
 * - Cadence label in subject line content
 * - Alert banner: shown when notReadyCount > 0, green when all ready
 * - All-ready case: no alert warning in output
 * - Stats table: correct counts rendered
 * - Unsubscribe notice always present
 *
 * Watch for: raw Stellar addresses, raw emails, PII in default mode.
 */

const baseDetails = {
  cadence: "daily" as const,
  totalContributors: 10,
  readyCount: 7,
  lowReserveCount: 1,
  notReadyCount: 2,
  generatedAt: "2026-09-25T02:00:00.000Z",
};

describe("buildDigestEmailBody — privacy default (no full list)", () => {
  it("contains total contributor count", () => {
    const body = buildDigestEmailBody(baseDetails);
    expect(body).toContain("10");
  });

  it("contains ready count", () => {
    const body = buildDigestEmailBody(baseDetails);
    expect(body).toContain("7");
  });

  it("contains low-reserve count", () => {
    const body = buildDigestEmailBody(baseDetails);
    expect(body).toContain("1");
  });

  it("contains not-ready count", () => {
    const body = buildDigestEmailBody(baseDetails);
    expect(body).toContain("2");
  });

  it("contains a link to the dashboard", () => {
    const body = buildDigestEmailBody(baseDetails);
    expect(body).toContain("/dashboard");
  });

  it("does NOT contain contributor usernames or @-handles from data", () => {
    const body = buildDigestEmailBody({
      ...baseDetails,
      // notReadyList NOT provided — privacy default
    });
    // Ensure no synthetic contributor names appear
    expect(body).not.toContain("bob");
    expect(body).not.toContain("carol");
  });

  it("does NOT include the full-list table section", () => {
    const body = buildDigestEmailBody(baseDetails);
    expect(body).not.toContain("Not-ready contributors (");
    expect(body).not.toContain("DIGEST_INCLUDE_FULL_LIST");
  });

  it("includes an unsubscribe notice", () => {
    const body = buildDigestEmailBody(baseDetails);
    expect(body).toContain("DIGEST_EMAIL");
  });

  it("shows the generation timestamp", () => {
    const body = buildDigestEmailBody(baseDetails);
    expect(body).toContain("2026-09-25T02:00:00.000Z");
  });
});

describe("buildDigestEmailBody — cadence label", () => {
  it("includes 'Daily' for daily cadence", () => {
    const body = buildDigestEmailBody({ ...baseDetails, cadence: "daily" });
    expect(body).toContain("Daily");
  });

  it("includes 'Weekly' for weekly cadence", () => {
    const body = buildDigestEmailBody({ ...baseDetails, cadence: "weekly" });
    expect(body).toContain("Weekly");
  });
});

describe("buildDigestEmailBody — alert banner", () => {
  it("shows warning banner when there are not-ready contributors", () => {
    const body = buildDigestEmailBody({
      ...baseDetails,
      notReadyCount: 3,
      lowReserveCount: 1,
    });
    expect(body).toContain("Action required");
    expect(body).toContain("4"); // 3 + 1
  });

  it("shows all-ready banner when everyone is ready", () => {
    const body = buildDigestEmailBody({
      cadence: "daily",
      totalContributors: 5,
      readyCount: 5,
      lowReserveCount: 0,
      notReadyCount: 0,
    });
    expect(body).toContain("All contributors are ready");
    expect(body).not.toContain("Action required");
  });

  it("banner message is singular for exactly one blocked contributor", () => {
    const body = buildDigestEmailBody({
      ...baseDetails,
      notReadyCount: 1,
      lowReserveCount: 0,
    });
    // "1 contributor cannot" — singular
    expect(body).toMatch(/1 contributor[^s]/);
  });

  it("banner message is plural for multiple blocked contributors", () => {
    const body = buildDigestEmailBody({
      ...baseDetails,
      notReadyCount: 2,
      lowReserveCount: 1,
    });
    expect(body).toContain("contributors");
  });
});

describe("buildDigestEmailBody — ready percentage", () => {
  it("shows 70% ready when 7 of 10 are ready", () => {
    const body = buildDigestEmailBody(baseDetails);
    expect(body).toContain("70%");
  });

  it("shows 100% ready when all contributors are ready", () => {
    const body = buildDigestEmailBody({
      cadence: "daily",
      totalContributors: 4,
      readyCount: 4,
      lowReserveCount: 0,
      notReadyCount: 0,
    });
    expect(body).toContain("100%");
  });

  it("shows 0% when no contributors are ready", () => {
    const body = buildDigestEmailBody({
      cadence: "daily",
      totalContributors: 3,
      readyCount: 0,
      lowReserveCount: 2,
      notReadyCount: 1,
    });
    expect(body).toContain("0%");
  });

  it("handles zero total contributors without division by zero", () => {
    expect(() =>
      buildDigestEmailBody({
        cadence: "daily",
        totalContributors: 0,
        readyCount: 0,
        lowReserveCount: 0,
        notReadyCount: 0,
      })
    ).not.toThrow();
  });
});

describe("buildDigestEmailBody — opt-in full list", () => {
  const notReadyList = [
    { githubUsername: "bob", reason: "no_trustline" as const },
    { githubUsername: "carol", reason: "low_reserve" as const },
    { githubUsername: "dave", reason: "unfunded" as const },
  ];

  it("renders contributor usernames when notReadyList is provided", () => {
    const body = buildDigestEmailBody({ ...baseDetails, notReadyList });
    expect(body).toContain("bob");
    expect(body).toContain("carol");
    expect(body).toContain("dave");
  });

  it("renders human-readable reason labels", () => {
    const body = buildDigestEmailBody({ ...baseDetails, notReadyList });
    expect(body).toContain("USDC trustline not established");
    expect(body).toContain("Insufficient spendable XLM balance");
    expect(body).toContain("Account not funded with XLM");
  });

  it("includes the full-list table header", () => {
    const body = buildDigestEmailBody({ ...baseDetails, notReadyList });
    expect(body).toContain(`Not-ready contributors (${notReadyList.length})`);
  });

  it("shows opt-in configuration note", () => {
    const body = buildDigestEmailBody({ ...baseDetails, notReadyList });
    expect(body).toContain("DIGEST_INCLUDE_FULL_LIST");
  });
});

describe("buildDigestEmailBody — XSS safety", () => {
  it("escapes < and > in contributor usernames", () => {
    const body = buildDigestEmailBody({
      ...baseDetails,
      notReadyList: [
        { githubUsername: "<script>alert(1)</script>", reason: "unfunded" },
      ],
    });
    expect(body).not.toContain("<script>");
    expect(body).toContain("&lt;script&gt;");
  });

  it("escapes & in contributor usernames", () => {
    const body = buildDigestEmailBody({
      ...baseDetails,
      notReadyList: [{ githubUsername: "alice&bob", reason: "unfunded" }],
    });
    expect(body).not.toContain("alice&bob");
    expect(body).toContain("alice&amp;bob");
  });

  it("escapes double-quotes in contributor usernames", () => {
    const body = buildDigestEmailBody({
      ...baseDetails,
      notReadyList: [{ githubUsername: 'user"name', reason: "unfunded" }],
    });
    expect(body).not.toContain('"name');
    expect(body).toContain("&quot;name");
  });
});

describe("buildDigestEmailBody — NEXTAUTH_URL", () => {
  beforeEach(() => {
    delete process.env.NEXTAUTH_URL;
  });

  afterEach(() => {
    delete process.env.NEXTAUTH_URL;
  });

  it("uses NEXTAUTH_URL for the dashboard link when set", () => {
    process.env.NEXTAUTH_URL = "https://my-deployment.vercel.app";
    const body = buildDigestEmailBody(baseDetails);
    expect(body).toContain("https://my-deployment.vercel.app/dashboard");
  });

  it("falls back to trustbridge.dev when NEXTAUTH_URL is unset", () => {
    const body = buildDigestEmailBody(baseDetails);
    expect(body).toContain("trustbridge.dev/dashboard");
  });
});
