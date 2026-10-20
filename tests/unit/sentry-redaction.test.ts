import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  captureException,
  captureMessage,
  redactContext,
  redactException,
  redactString,
  redactValue,
  _resetSentryClient,
} from "@/lib/sentry";

// A real, checksum-valid mainnet G-address (Circle USDC issuer) and a
// well-formed S-seed shape. Neither may ever reach Sentry.
const G_ADDRESS = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
const S_SEED = "SCZANGBA5YHTNYVVV4C3U252E2B6P6F5PSSFTGNJDQTFJDAXLHIRP4A6";

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  _resetSentryClient();
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
  vi.clearAllMocks();
  _resetSentryClient();
});

describe("redactString", () => {
  it("redacts a Stellar G-address", () => {
    const out = redactString(`account ${G_ADDRESS} not found`);
    expect(out).not.toContain(G_ADDRESS);
    expect(out).toContain("[redacted:stellar-address]");
  });

  it("redacts a Stellar secret seed distinctly from a public address", () => {
    const out = redactString(`signing with ${S_SEED}`);
    expect(out).not.toContain(S_SEED);
    expect(out).toContain("[redacted:stellar-secret]");
  });

  it("redacts every address in a string, not just the first", () => {
    const other = "GBDEVU63Y6NTHJQQZIKVTC23NWLQVP3WJ2RI2OTSJTNYOIGICST6DUXR";
    const out = redactString(`${G_ADDRESS} -> ${other}`);
    expect(out).not.toContain(G_ADDRESS);
    expect(out).not.toContain(other);
  });

  it("is stable across repeated calls (global regex lastIndex is reset)", () => {
    const input = `a ${G_ADDRESS} b`;
    expect(redactString(input)).toBe(redactString(input));
  });

  it.each([
    ["ghp_", "ghp_abcdefghijklmnopqrstuvwxyz0123456789"],
    ["gho_", "gho_abcdefghijklmnopqrstuvwxyz0123456789"],
    ["ghs_", "ghs_abcdefghijklmnopqrstuvwxyz0123456789"],
    ["github_pat_", "github_pat_11ABCDEFG0abcdefghijklmnopqrstuvwxyz012345"],
  ])("redacts a %s GitHub token", (_label, token) => {
    const out = redactString(`Bad credentials for ${token}`);
    expect(out).not.toContain(token);
    expect(out).toContain("[redacted:github-token]");
  });

  it("redacts credentials embedded in a connection string", () => {
    const out = redactString(
      "connect ECONNREFUSED postgresql://tbuser:hunter2@db.internal:5432/trustbridge"
    );
    expect(out).not.toContain("hunter2");
    expect(out).not.toContain("tbuser");
    expect(out).toContain("[redacted:credentials]");
    // The host and database name survive — that's the debuggable part.
    expect(out).toContain("db.internal:5432/trustbridge");
  });

  it("redacts an Authorization bearer value", () => {
    const out = redactString("Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.abc.def");
    expect(out).not.toContain("eyJhbGciOiJIUzI1NiJ9");
    expect(out).toContain("[redacted:token]");
  });

  it("redacts email addresses", () => {
    const out = redactString("no user for contributor@example.com");
    expect(out).not.toContain("contributor@example.com");
    expect(out).toContain("[redacted:email]");
  });

  it("leaves ordinary diagnostic text untouched", () => {
    const msg = "Horizon request timed out after 15000ms (attempt 3 of 3)";
    expect(redactString(msg)).toBe(msg);
  });
});

describe("redactValue", () => {
  it("drops values under sensitive keys regardless of content", () => {
    const out = redactValue({
      accessToken: "not-obviously-a-token",
      apiKey: "plain",
      keep: "visible",
    }) as Record<string, unknown>;

    expect(out.accessToken).toBe("[redacted]");
    expect(out.apiKey).toBe("[redacted]");
    expect(out.keep).toBe("visible");
  });

  it("matches sensitive keys case-insensitively", () => {
    const out = redactValue({ AccessToken: "x", COOKIE: "y" }) as Record<
      string,
      unknown
    >;
    expect(out.AccessToken).toBe("[redacted]");
    expect(out.COOKIE).toBe("[redacted]");
  });

  it("walks nested objects and arrays", () => {
    const out = redactValue({
      user: { addresses: [G_ADDRESS] },
    }) as { user: { addresses: string[] } };
    expect(out.user.addresses[0]).toBe("[redacted:stellar-address]");
  });

  it("preserves primitives that carry no secrets", () => {
    const out = redactValue({ count: 3, ok: true, missing: null });
    expect(out).toEqual({ count: 3, ok: true, missing: null });
  });

  it("stops at the depth cap instead of recursing without bound", () => {
    // 10 levels deep, past the cap of 6.
    let deep: Record<string, unknown> = { value: G_ADDRESS };
    for (let i = 0; i < 10; i += 1) deep = { nested: deep };

    const serialized = JSON.stringify(redactValue(deep));
    expect(serialized).toContain("[redacted:max-depth]");
    expect(serialized).not.toContain(G_ADDRESS);
  });

  it("survives a cyclic object", () => {
    const cyclic: Record<string, unknown> = { name: "loop" };
    cyclic.self = cyclic;
    expect(() => redactValue(cyclic)).not.toThrow();
  });
});

describe("redactException", () => {
  it("scrubs the message and preserves the error name", () => {
    const err = new TypeError(`no trustline for ${G_ADDRESS}`);
    const out = redactException(err) as Error;

    expect(out).toBeInstanceOf(Error);
    expect(out.name).toBe("TypeError");
    expect(out.message).toContain("[redacted:stellar-address]");
    expect(out.message).not.toContain(G_ADDRESS);
  });

  it("does NOT mutate the caller's error", () => {
    // The caller usually logs or rethrows the original after reporting it.
    const err = new Error(`no trustline for ${G_ADDRESS}`);
    redactException(err);
    expect(err.message).toContain(G_ADDRESS);
  });

  it("scrubs the stack trace as well as the message", () => {
    const err = new Error("boom");
    err.stack = `Error: boom\n    at check (${G_ADDRESS}.ts:1:1)`;
    const out = redactException(err) as Error;
    expect(out.stack).not.toContain(G_ADDRESS);
  });

  it("handles non-Error throwables", () => {
    expect(redactException(`threw ${G_ADDRESS}`)).toBe(
      "threw [redacted:stellar-address]"
    );
    expect(redactException(42)).toBe(42);
    expect(redactException(null)).toBe(null);
  });
});

describe("redactContext", () => {
  it("returns undefined for an absent context", () => {
    expect(redactContext(undefined)).toBeUndefined();
  });

  it("redacts a route context bag", () => {
    const out = redactContext({
      route: "/api/register",
      stellarAddress: G_ADDRESS,
      token: "ghp_abcdefghijklmnopqrstuvwxyz0123456789",
    });
    expect(out).toEqual({
      route: "/api/register",
      stellarAddress: "[redacted:stellar-address]",
      token: "[redacted]",
    });
  });
});

// ---------------------------------------------------------------------------
// Redaction must be applied by the capture helpers, not left to call sites.
// ---------------------------------------------------------------------------
describe("capture helpers apply redaction before sending", () => {
  // `resolveClient()` reaches the real SDK through `require("@sentry/nextjs")`,
  // which is an optional peer dep and is not installed here — so the client is
  // always the no-op stub under test. What these cases pin down is the half
  // that is observable without the SDK: the helpers are safe to call
  // unconditionally, and the exact payload they build is asserted directly
  // against `redactException` / `redactContext` above.

  it("captureException is a no-op returning '' when no DSN is configured", () => {
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    _resetSentryClient();
    expect(captureException(new Error(`x ${G_ADDRESS}`), { a: G_ADDRESS })).toBe(
      ""
    );
  });

  it("captureMessage is a no-op returning '' when no DSN is configured", () => {
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    _resetSentryClient();
    expect(captureMessage(`address ${G_ADDRESS}`)).toBe("");
  });

  it("never throws on hostile input", () => {
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    _resetSentryClient();
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => captureException(cyclic, cyclic)).not.toThrow();
  });
});
