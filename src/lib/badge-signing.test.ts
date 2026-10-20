import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  generateBadgeUrl,
  getBadgeSigningKey,
  signBadge,
  verifyBadgeSignature,
} from "./badge-signing";

describe("badge-signing", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("getBadgeSigningKey", () => {
    it("returns BADGE_SIGNING_KEY if configured", () => {
      process.env.BADGE_SIGNING_KEY = "my-badge-key";
      process.env.NEXTAUTH_SECRET = "my-nextauth-key";
      expect(getBadgeSigningKey()).toBe("my-badge-key");
    });

    it("falls back to NEXTAUTH_SECRET if BADGE_SIGNING_KEY is missing", () => {
      delete process.env.BADGE_SIGNING_KEY;
      process.env.NEXTAUTH_SECRET = "my-nextauth-key";
      expect(getBadgeSigningKey()).toBe("my-nextauth-key");
    });

    it("falls back to TOKEN_ENCRYPTION_KEY if both are missing", () => {
      delete process.env.BADGE_SIGNING_KEY;
      delete process.env.NEXTAUTH_SECRET;
      process.env.TOKEN_ENCRYPTION_KEY = "my-token-key";
      expect(getBadgeSigningKey()).toBe("my-token-key");
    });

    it("returns development fallback in non-production if none configured", () => {
      delete process.env.BADGE_SIGNING_KEY;
      delete process.env.NEXTAUTH_SECRET;
      delete process.env.TOKEN_ENCRYPTION_KEY;
      delete process.env.NODE_ENV;
      expect(getBadgeSigningKey()).toBe("trustbridge-badge-secret-dev");
    });

    it("throws error in production if no key is configured", () => {
      delete process.env.BADGE_SIGNING_KEY;
      delete process.env.NEXTAUTH_SECRET;
      delete process.env.TOKEN_ENCRYPTION_KEY;
      process.env.NODE_ENV = "production";
      expect(() => getBadgeSigningKey()).toThrow(
        "BADGE_SIGNING_KEY or NEXTAUTH_SECRET must be configured in production"
      );
    });
  });

  describe("signBadge and verifyBadgeSignature", () => {
    beforeEach(() => {
      process.env.BADGE_SIGNING_KEY = "test-secret-key-12345";
    });

    it("generates a valid 64-character hex signature", () => {
      const sig = signBadge("alice");
      expect(sig).toMatch(/^[a-f0-9]{64}$/);
    });

    it("verifies a valid signature without expiration", () => {
      const sig = signBadge("alice");
      expect(verifyBadgeSignature("alice", sig)).toBe(true);
    });

    it("fails verification for a tampered signature", () => {
      const sig = signBadge("alice");
      const tampered = sig.substring(0, 63) + (sig.endsWith("0") ? "1" : "0");
      expect(verifyBadgeSignature("alice", tampered)).toBe(false);
    });

    it("fails verification for a different username", () => {
      const sig = signBadge("alice");
      expect(verifyBadgeSignature("bob", sig)).toBe(false);
    });

    it("verifies a valid signature with unexpired timestamp", () => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600; // 1 hr in future
      const sig = signBadge("alice", futureExp);
      expect(verifyBadgeSignature("alice", sig, futureExp)).toBe(true);
    });

    it("fails verification for an expired timestamp", () => {
      const pastExp = Math.floor(Date.now() / 1000) - 60; // 1 min in past
      const sig = signBadge("alice", pastExp);
      expect(verifyBadgeSignature("alice", sig, pastExp)).toBe(false);
    });

    it("returns false for null, undefined, or malformed signature string", () => {
      expect(verifyBadgeSignature("alice", null)).toBe(false);
      expect(verifyBadgeSignature("alice", undefined)).toBe(false);
      expect(verifyBadgeSignature("alice", "too-short")).toBe(false);
      expect(verifyBadgeSignature("alice", "g".repeat(64))).toBe(false);
    });
  });

  describe("generateBadgeUrl", () => {
    beforeEach(() => {
      process.env.BADGE_SIGNING_KEY = "test-secret-key-12345";
    });

    it("generates relative badge URL with sig parameter", () => {
      const url = generateBadgeUrl("alice");
      expect(url).toContain("/api/badge/alice?sig=");
      const params = new URLSearchParams(url.split("?")[1]);
      expect(params.get("sig")).toMatch(/^[a-f0-9]{64}$/);
    });

    it("includes base URL when provided", () => {
      const url = generateBadgeUrl("alice", { baseUrl: "https://example.com" });
      expect(url.startsWith("https://example.com/api/badge/alice?sig=")).toBe(true);
    });

    it("includes exp parameter when expiresInSeconds is specified", () => {
      const url = generateBadgeUrl("alice", { expiresInSeconds: 300 });
      const params = new URLSearchParams(url.split("?")[1]);
      expect(params.has("sig")).toBe(true);
      expect(params.has("exp")).toBe(true);
      const exp = parseInt(params.get("exp")!, 10);
      expect(exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });
  });
});
