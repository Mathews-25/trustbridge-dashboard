import { describe, expect, it } from "vitest";

import {
  generateApiKey,
  hashApiKey,
  isValidApiKeyFormat,
} from "@/lib/api-key-crypto";

/**
 * Unit tests for API key cryptography utilities.
 *
 * Tests verify:
 * - Key generation format and entropy characteristics
 * - Hash determinism and uniqueness
 * - Format validation (prefix, minimum length)
 *
 * Watch for: raw keys in assertions (use length/prefix checks, not full value),
 * hash collisions (not tested exhaustively — rely on SHA-256 properties).
 */

describe("generateApiKey", () => {
  it("produces a string with the tb_ prefix", () => {
    const key = generateApiKey();
    expect(key).toMatch(/^tb_/);
  });

  it("produces a key of at least 44 characters", () => {
    // "tb_" (3) + base64url of 32 bytes (43 chars) = 46 minimum
    const key = generateApiKey();
    expect(key.length).toBeGreaterThanOrEqual(44);
  });

  it("generates unique keys on each call", () => {
    const keys = new Set(Array.from({ length: 100 }, generateApiKey));
    expect(keys.size).toBe(100);
  });

  it("uses only URL-safe characters after the prefix", () => {
    const key = generateApiKey();
    const suffix = key.slice(3); // strip "tb_"
    expect(suffix).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("hashApiKey", () => {
  it("returns a lowercase hex string of 64 characters (SHA-256)", () => {
    const hash = hashApiKey("tb_some-key");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for the same input", () => {
    const raw = generateApiKey();
    expect(hashApiKey(raw)).toBe(hashApiKey(raw));
  });

  it("produces different hashes for different inputs", () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(hashApiKey(a)).not.toBe(hashApiKey(b));
  });

  it("is sensitive to a single character difference", () => {
    const base = "tb_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const diff = "tb_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaab";
    expect(hashApiKey(base)).not.toBe(hashApiKey(diff));
  });

  it("never returns the raw key in the hash output", () => {
    const raw = generateApiKey();
    const hash = hashApiKey(raw);
    expect(hash).not.toContain(raw);
    expect(hash).not.toContain(raw.slice(3)); // strip prefix too
  });
});

describe("isValidApiKeyFormat", () => {
  it("accepts a generated key", () => {
    expect(isValidApiKeyFormat(generateApiKey())).toBe(true);
  });

  it("rejects a key without the tb_ prefix", () => {
    expect(isValidApiKeyFormat("no_prefix_key_12345")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isValidApiKeyFormat("")).toBe(false);
  });

  it("rejects a key that is too short", () => {
    expect(isValidApiKeyFormat("tb_")).toBe(false);
    expect(isValidApiKeyFormat("tb_abc")).toBe(false);
  });

  it("rejects non-string values", () => {
    expect(isValidApiKeyFormat(null as unknown as string)).toBe(false);
    expect(isValidApiKeyFormat(undefined as unknown as string)).toBe(false);
    expect(isValidApiKeyFormat(123 as unknown as string)).toBe(false);
  });

  it("accepts a key of exactly 10 characters", () => {
    // "tb_" (3) + 7 chars = 10 total — minimum valid length
    expect(isValidApiKeyFormat("tb_1234567")).toBe(true);
  });
});
