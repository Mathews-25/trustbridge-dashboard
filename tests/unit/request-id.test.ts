import { describe, it, expect } from "vitest";
import {
  generateRequestId,
  isValidRequestId,
  extractRequestId,
} from "@/lib/request-id";

describe("generateRequestId", () => {
  it("returns a string", () => {
    expect(typeof generateRequestId()).toBe("string");
  });

  it("generates a valid UUID v4", () => {
    const id = generateRequestId();
    // Standard UUID v4 regex: version nibble is '4', variant nibble is [89ab]
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it("generates unique IDs on each call", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateRequestId()));
    expect(ids.size).toBe(100);
  });

  it("does not contain session tokens or secrets", () => {
    const id = generateRequestId();
    // Must only be hex digits and hyphens — no base64, no alphanumeric bleed
    expect(id).toMatch(/^[0-9a-f-]+$/i);
  });
});

describe("isValidRequestId", () => {
  it("accepts a valid UUID v4", () => {
    const id = generateRequestId();
    expect(isValidRequestId(id)).toBe(true);
  });

  it("accepts uppercase UUID v4", () => {
    const id = generateRequestId().toUpperCase();
    expect(isValidRequestId(id)).toBe(true);
  });

  it("rejects an empty string", () => {
    expect(isValidRequestId("")).toBe(false);
  });

  it("rejects a UUID v1 (version bit 1)", () => {
    // Version nibble is '1' — should fail because we only accept v4
    expect(isValidRequestId("550e8400-e29b-11d4-a716-446655440000")).toBe(false);
  });

  it("rejects a UUID with wrong variant nibble", () => {
    // Variant nibble changed from '8' to '0'
    expect(isValidRequestId("550e8400-e29b-4d4f-0716-446655440000")).toBe(false);
  });

  it("rejects arbitrary strings", () => {
    expect(isValidRequestId("not-a-uuid")).toBe(false);
    expect(isValidRequestId("abc123")).toBe(false);
  });

  it("rejects UUIDs with extra characters", () => {
    const id = `{${generateRequestId()}}`;
    expect(isValidRequestId(id)).toBe(false);
  });

  it("rejects UUIDs with missing segments", () => {
    expect(isValidRequestId("550e8400-e29b-4d4f")).toBe(false);
  });
});

describe("extractRequestId", () => {
  it("extracts a valid request ID from headers", () => {
    const id = generateRequestId();
    const headers = { get: (name: string) => (name === "x-request-id" ? id : null) };
    expect(extractRequestId(headers)).toBe(id);
  });

  it("returns null when header is absent", () => {
    const headers = { get: () => null };
    expect(extractRequestId(headers)).toBeNull();
  });

  it("returns null for an invalid / tampered header value", () => {
    const headers = { get: (name: string) => (name === "x-request-id" ? "not-a-uuid" : null) };
    expect(extractRequestId(headers)).toBeNull();
  });

  it("returns null for an empty header value", () => {
    const headers = { get: () => "" };
    expect(extractRequestId(headers)).toBeNull();
  });

  it("works with the native Headers API", () => {
    const id = generateRequestId();
    const headers = new Headers({ "x-request-id": id });
    expect(extractRequestId(headers)).toBe(id);
  });

  it("rejects a header value that looks like a JWT (no tokens in IDs)", () => {
    const fakeJwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.abc";
    const headers = { get: (name: string) => (name === "x-request-id" ? fakeJwt : null) };
    expect(extractRequestId(headers)).toBeNull();
  });
});
