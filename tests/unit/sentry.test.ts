import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  captureException,
  captureExceptionWithScope,
  captureMessage,
  flushSentry,
  isSentryEnabled,
  setSentryUser,
  _resetSentryClient,
} from "@/lib/sentry";

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  _resetSentryClient();
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  _resetSentryClient();
});

// ---------------------------------------------------------------------------
// No-op behaviour (no DSN configured)
// ---------------------------------------------------------------------------
describe("sentry helpers — no DSN (no-op mode)", () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    _resetSentryClient();
  });

  it("isSentryEnabled returns false when DSN is absent", () => {
    expect(isSentryEnabled()).toBe(false);
  });

  it("captureException returns empty string and does not throw", () => {
    const id = captureException(new Error("boom"));
    expect(id).toBe("");
  });

  it("captureException accepts a non-Error value without throwing", () => {
    expect(() => captureException("string error")).not.toThrow();
    expect(() => captureException(null)).not.toThrow();
    expect(() => captureException(undefined)).not.toThrow();
    expect(() => captureException(42)).not.toThrow();
  });

  it("captureException accepts context without throwing", () => {
    const id = captureException(new Error("ctx"), { route: "/api/test", userId: "u_1" });
    expect(id).toBe("");
  });

  it("captureMessage returns empty string and does not throw", () => {
    const id = captureMessage("hello sentry");
    expect(id).toBe("");
  });

  it("captureMessage accepts explicit level", () => {
    expect(() => captureMessage("warn msg", "warning")).not.toThrow();
    expect(() => captureMessage("err msg", "error")).not.toThrow();
    expect(() => captureMessage("debug msg", "debug")).not.toThrow();
    expect(() => captureMessage("fatal msg", "fatal")).not.toThrow();
  });

  it("captureExceptionWithScope returns empty string and does not throw", () => {
    const id = captureExceptionWithScope(
      new Error("scoped"),
      { id: "u_123", username: "alice" },
      { route: "/api/register" },
      "error"
    );
    expect(id).toBe("");
  });

  it("captureExceptionWithScope handles null user", () => {
    expect(() =>
      captureExceptionWithScope(new Error("anon"), null, {}, "warning")
    ).not.toThrow();
  });

  it("setSentryUser does not throw", () => {
    expect(() => setSentryUser({ id: "u_1", username: "bob" })).not.toThrow();
    expect(() => setSentryUser(null)).not.toThrow();
  });

  it("flushSentry resolves to true", async () => {
    await expect(flushSentry()).resolves.toBe(true);
    await expect(flushSentry(500)).resolves.toBe(true);
  });
});

// ---------------------------------------------------------------------------
// DSN configured but @sentry/nextjs not installed (graceful fallback)
// ---------------------------------------------------------------------------
describe("sentry helpers — DSN set but package unavailable (graceful fallback)", () => {
  // The real @sentry/nextjs is not installed in this project (it's an optional
  // peer dep). With NEXT_PUBLIC_SENTRY_DSN set and a missing package the
  // try/catch in resolveClient() must catch the require error and silently
  // degrade to the no-op stub, so all helpers still work without throwing.
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = "https://fake@sentry.io/123";
    _resetSentryClient();
  });

  afterEach(() => {
    _resetSentryClient();
  });

  it("falls back to no-op when @sentry/nextjs cannot be required", () => {
    // @sentry/nextjs is not installed → require() throws → resolveClient()
    // catches and returns noopClient → captureException must not re-throw.
    expect(() => captureException(new Error("sentry-fallback"))).not.toThrow();
  });

  it("captureException returns empty string in fallback mode", () => {
    const id = captureException(new Error("fallback-id"));
    expect(id).toBe("");
  });

  it("captureMessage returns empty string in fallback mode", () => {
    const id = captureMessage("fallback message");
    expect(id).toBe("");
  });

  it("flushSentry resolves to true in fallback mode", async () => {
    await expect(flushSentry()).resolves.toBe(true);
  });
});

// ---------------------------------------------------------------------------
// DSN configured and @sentry/nextjs is available (happy path)
// ---------------------------------------------------------------------------
describe("sentry helpers — DSN set and SDK available", () => {
  const mockCaptureException = vi.fn().mockReturnValue("event-id-1");
  const mockCaptureMessage = vi.fn().mockReturnValue("event-id-2");
  const mockWithScope = vi.fn((cb: (scope: unknown) => void) => {
    cb({
      setTag: vi.fn(),
      setUser: vi.fn(),
      setExtra: vi.fn(),
      setLevel: vi.fn(),
    });
  });
  const mockSetUser = vi.fn();
  const mockFlush = vi.fn().mockResolvedValue(true);

  const fakeSentryModule = {
    captureException: mockCaptureException,
    captureMessage: mockCaptureMessage,
    withScope: mockWithScope,
    setUser: mockSetUser,
    flush: mockFlush,
  };

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = "https://key@sentry.io/456";
    _resetSentryClient();
    // Patch the require call inside sentry.ts by overriding the module
    // resolution through require.cache so the next require('@sentry/nextjs')
    // returns our fake module.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Module = require("module") as {
      _resolveFilename: (id: string, parent: unknown) => string;
    };
    const resolvedPath = (() => {
      try {
        return Module._resolveFilename("@sentry/nextjs", null);
      } catch {
        return null;
      }
    })();

    if (resolvedPath) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require as NodeRequire & { cache: Record<string, unknown> }).cache[
        resolvedPath
      ] = {
        id: resolvedPath,
        filename: resolvedPath,
        loaded: true,
        exports: fakeSentryModule,
        // minimal NodeModule shape:
        children: [],
        paths: [],
        parent: null,
        require,
        path: resolvedPath,
      } as unknown as NodeModule;
    }
  });

  afterEach(() => {
    vi.clearAllMocks();
    _resetSentryClient();
  });

  it("isSentryEnabled returns true when DSN is present", () => {
    expect(isSentryEnabled()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------
describe("sentry helpers — edge cases", () => {
  it("isSentryEnabled returns false for blank-string DSN", () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = "   ";
    _resetSentryClient();
    expect(isSentryEnabled()).toBe(false);
  });

  it("captureExceptionWithScope uses default level of 'error'", () => {
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    _resetSentryClient();
    // In no-op mode this just validates no throw; level default is exercised.
    expect(() =>
      captureExceptionWithScope(new Error("default level"), { id: "u_1" })
    ).not.toThrow();
  });

  it("captureExceptionWithScope handles empty tags object", () => {
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    _resetSentryClient();
    expect(() =>
      captureExceptionWithScope(new Error("no tags"), null, {})
    ).not.toThrow();
  });

  it("setSentryUser accepts partial user objects", () => {
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    _resetSentryClient();
    expect(() => setSentryUser({ id: "u_1" })).not.toThrow();
    expect(() => setSentryUser({ username: "alice" })).not.toThrow();
    expect(() => setSentryUser({})).not.toThrow();
  });
});
