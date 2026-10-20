/**
 * Issue #148 — session facts derived from JWT claims.
 */

import { describe, expect, it } from "vitest";

import {
  buildSessionInfo,
  describeRemaining,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/session-info";

const NOW = new Date("2026-08-27T12:00:00.000Z");
const NOW_SECONDS = Math.floor(NOW.getTime() / 1000);

describe("buildSessionInfo", () => {
  it("reports issued-at and expiry from the token claims", () => {
    const info = buildSessionInfo(
      { iat: NOW_SECONDS - 3_600, exp: NOW_SECONDS + 3_600 },
      NOW
    );

    expect(info.issuedAt).toBe("2026-08-27T11:00:00.000Z");
    expect(info.expiresAt).toBe("2026-08-27T13:00:00.000Z");
    expect(info.expiresInSeconds).toBe(3_600);
  });

  it("derives expiry from issued-at when exp is absent", () => {
    const info = buildSessionInfo({ iat: NOW_SECONDS }, NOW, 86_400);

    expect(info.expiresAt).toBe("2026-08-28T12:00:00.000Z");
    expect(info.expiresInSeconds).toBe(86_400);
  });

  it("floors an expired session at zero rather than going negative", () => {
    const info = buildSessionInfo(
      { iat: NOW_SECONDS - 7_200, exp: NOW_SECONDS - 60 },
      NOW
    );

    expect(info.expiresInSeconds).toBe(0);
  });

  it("returns nulls rather than guesses when claims are missing", () => {
    const info = buildSessionInfo(null, NOW);

    expect(info.issuedAt).toBeNull();
    expect(info.expiresAt).toBeNull();
    expect(info.expiresInSeconds).toBeNull();
  });

  it("ignores non-numeric claims", () => {
    const info = buildSessionInfo({ iat: "yesterday", exp: null }, NOW);
    expect(info.issuedAt).toBeNull();
  });

  it("reports the JWT strategy and its two consequences", () => {
    const info = buildSessionInfo({ iat: NOW_SECONDS }, NOW);

    // These flags are what stops the UI quietly implying device management.
    expect(info.strategy).toBe("jwt");
    expect(info.canListOtherSessions).toBe(false);
    expect(info.signOutEndsAllSessions).toBe(false);
  });

  it("reports the configured lifetime so the UI need not hardcode it", () => {
    expect(buildSessionInfo({ iat: NOW_SECONDS }, NOW).maxAgeSeconds).toBe(
      SESSION_MAX_AGE_SECONDS
    );
  });

  it("carries no identity or credential fields", () => {
    // Whatever else changes, this endpoint must not grow into a PII surface.
    const info = buildSessionInfo({ iat: NOW_SECONDS, exp: NOW_SECONDS + 60 }, NOW);
    const keys = Object.keys(info).join(",");

    expect(keys).not.toMatch(/token|accessToken|ip|userAgent|email|location/i);
  });
});

describe("describeRemaining", () => {
  it.each([
    [null, "Unknown"],
    [0, "Expired"],
    [-30, "Expired"],
    [45, "1m"],
    [90, "1m"],
    [3_600, "1h"],
    [5_400, "1h 30m"],
    [86_400, "1d"],
    [90_000, "1d 1h"],
    [SESSION_MAX_AGE_SECONDS, "30d"],
  ])("formats %s as %s", (seconds, expected) => {
    expect(describeRemaining(seconds as number | null)).toBe(expected);
  });
});

describe("session lifetime stays in step with the auth config", () => {
  it("matches the maxAge declared in authOptions", async () => {
    // The panel tells the user "up to N days"; if these drift, it lies.
    const source = await import("node:fs").then(({ readFileSync }) =>
      readFileSync("src/lib/auth.ts", "utf8")
    );

    expect(source).toContain("maxAge: SESSION_MAX_AGE_SECONDS");
  });
});
