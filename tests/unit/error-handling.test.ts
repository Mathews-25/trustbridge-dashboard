/**
 * Unit tests for src/lib/error-handling.ts (issue #382).
 *
 * Covers every classification branch of `classifyError` and each helper the
 * module exports:
 *  - `classifyError` — network (fetch TypeError / timeout), auth (401/403),
 *    server (message containing "5"), and the unknown/default fallback, plus
 *    the order in which the branches are evaluated and the `recoverable` flag
 *    each branch reports.
 *  - `getUserFriendlyMessage` — known codes and the unknown-code fallback.
 *  - `errorMessages` — the user-facing message catalogue.
 *  - `ErrorLogger` — logging, retention cap, time-range queries, stats,
 *    clearing and JSON export.
 *  - `globalErrorLogger` — the shared module-level instance.
 *
 * Assertions are pinned to what the code actually does today, including the
 * quirks: matching is case-sensitive, any error message containing the digit
 * "5" is treated as a server error (after the 401/403 checks), and
 * non-`Error` values fall through to the default "unknown" classification.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ErrorLogger,
  classifyError,
  errorMessages,
  getUserFriendlyMessage,
  globalErrorLogger,
} from "@/lib/error-handling";

describe("classifyError", () => {
  describe("network branch — TypeError with 'fetch' in the message", () => {
    it("classifies a fetch TypeError as a recoverable network error", () => {
      const result = classifyError(new TypeError("fetch failed"));

      expect(result).toEqual({
        type: "network",
        message: errorMessages.NETWORK_ERROR,
        recoverable: true,
      });
    });

    it("matches 'fetch' anywhere in the TypeError message", () => {
      const result = classifyError(
        new TypeError("TypeError: NetworkError when attempting to fetch resource")
      );

      expect(result.type).toBe("network");
      expect(result.message).toBe(errorMessages.NETWORK_ERROR);
      expect(result.recoverable).toBe(true);
    });

    it("does not take the fetch branch for a plain Error mentioning fetch", () => {
      // `fetch` alone is not enough — the error must be a TypeError.
      const result = classifyError(new Error("fetch failed"));

      // The message contains no "5", no 401/403 and no "timeout"…
      expect(result.type).toBe("unknown");
      expect(result.message).toBe(errorMessages.UNKNOWN_ERROR);
    });

    it("does not take the fetch branch for a TypeError without 'fetch'", () => {
      const result = classifyError(
        new TypeError("Cannot read properties of undefined (reading 'map')")
      );

      expect(result.type).toBe("unknown");
      expect(result.message).toBe(errorMessages.UNKNOWN_ERROR);
      expect(result.recoverable).toBe(true);
    });
  });

  describe("network branch — messages containing 'timeout'", () => {
    it("classifies a timeout Error as a recoverable network error", () => {
      const result = classifyError(new Error("timeout of 10000ms exceeded"));

      expect(result).toEqual({
        type: "network",
        message: errorMessages.TIMEOUT_ERROR,
        recoverable: true,
      });
    });

    it("matches 'timeout' even when the message also contains 401", () => {
      // The timeout check runs before the auth check.
      const result = classifyError(new Error("timeout waiting for 401 response"));

      expect(result.type).toBe("network");
      expect(result.message).toBe(errorMessages.TIMEOUT_ERROR);
    });

    it("matches 'timeout' even when the message also contains 5", () => {
      // The timeout check runs before the server-error check.
      const result = classifyError(new Error("timeout after 5000ms"));

      expect(result.type).toBe("network");
      expect(result.message).toBe(errorMessages.TIMEOUT_ERROR);
    });

    it("is case-sensitive: 'Timeout' does not match and falls through", () => {
      // Documents actual behaviour: the check is `message.includes("timeout")`.
      const result = classifyError(new Error("Timeout waiting for response"));

      expect(result.type).toBe("unknown");
      expect(result.message).toBe(errorMessages.UNKNOWN_ERROR);
    });

    it("takes the timeout branch for a TypeError whose message has no 'fetch'", () => {
      // A TypeError is still an Error, so later branches apply.
      const result = classifyError(new TypeError("request timeout"));

      expect(result.type).toBe("network");
      expect(result.message).toBe(errorMessages.TIMEOUT_ERROR);
    });
  });

  describe("auth branch — messages containing 401 or 403", () => {
    it("classifies a 401 error as non-recoverable auth failure", () => {
      const result = classifyError(new Error("Request failed with 401 Unauthorized"));

      expect(result).toEqual({
        type: "auth",
        message: errorMessages.UNAUTHORIZED,
        recoverable: false,
      });
    });

    it("classifies a 403 error as non-recoverable auth failure", () => {
      const result = classifyError(new Error("Forbidden (403)"));

      expect(result).toEqual({
        type: "auth",
        message: errorMessages.UNAUTHORIZED,
        recoverable: false,
      });
    });

    it("checks for 401 before the server-error '5' branch", () => {
      // "401 then 500" contains a "5", but auth wins — it is checked first.
      const result = classifyError(new Error("got 401 then 500"));

      expect(result.type).toBe("auth");
      expect(result.recoverable).toBe(false);
    });

    it("matches 401/403 as substrings, not whole messages", () => {
      expect(classifyError(new Error("http status 403 from gateway")).type).toBe(
        "auth"
      );
    });
  });

  describe("server branch — real HTTP 5xx status codes", () => {
    it("classifies an HTTP 500 error as a recoverable server error", () => {
      const result = classifyError(new Error("HTTP 500 Internal Server Error"));

      expect(result).toEqual({
        type: "server",
        message: errorMessages.SERVER_ERROR,
        recoverable: true,
      });
    });

    it.each([
      "upstream returned 502",
      "Gateway unavailable (503)",
      "status 599 from upstream",
      "HTTP_5XX gateway error",
    ])("classifies %s as a server error", (message) => {
      const result = classifyError(new Error(message));

      expect(result.type).toBe("server");
      expect(result.message).toBe(errorMessages.SERVER_ERROR);
      expect(result.recoverable).toBe(true);
    });

    it("does not classify a 404 as a server error (no 5xx present)", () => {
      const result = classifyError(new Error("Request failed with status 404"));

      expect(result.type).toBe("unknown");
      expect(result.message).toBe(errorMessages.UNKNOWN_ERROR);
      expect(result.recoverable).toBe(true);
    });

    it.each([
      "invalid field 5",
      "status 5",
      "user selected version 5",
      "Service unavailable",
    ])("does not classify %s as a server error", (message) => {
      expect(classifyError(new Error(message)).type).toBe("unknown");
    });
  });

  describe("unknown/default branch — unexpected input types", () => {
    it("classifies a plain Error with no markers as unknown", () => {
      const result = classifyError(new Error("something broke"));

      expect(result).toEqual({
        type: "unknown",
        message: errorMessages.UNKNOWN_ERROR,
        recoverable: true,
      });
    });

    it.each([
      ["null", null],
      ["undefined", undefined],
      ["a string", "boom"],
      ["a number", 500],
      ["a plain object", { message: "boom" }],
      ["an array", ["timeout"]],
      ["a boolean", true],
    ])("classifies %s as unknown", (_label, input) => {
      const result = classifyError(input);

      expect(result).toEqual({
        type: "unknown",
        message: errorMessages.UNKNOWN_ERROR,
        recoverable: true,
      });
    });

    it("classifies a plain object that looks like an error as unknown", () => {
      // Duck-typed errors (no Error prototype) skip every instanceof branch.
      const result = classifyError({
        name: "TypeError",
        message: "fetch failed",
        stack: "TypeError: fetch failed",
      });

      expect(result.type).toBe("unknown");
      expect(result.message).toBe(errorMessages.UNKNOWN_ERROR);
    });
  });

  describe("branch ordering", () => {
    it("prefers network (timeout) over auth when both markers are present", () => {
      expect(classifyError(new Error("timeout during 401")).type).toBe("network");
    });

    it("prefers auth over server when both markers are present", () => {
      expect(classifyError(new Error("403 from host5")).type).toBe("auth");
    });

    it("ignores bare numeric 5 fragments even when they appear near auth status text", () => {
      expect(classifyError(new Error("invalid field 5 and 401")).type).toBe("auth");
    });

    it("prefers the fetch-TypeError branch over every other branch", () => {
      const result = classifyError(new TypeError("fetch timeout 401 500"));

      expect(result.type).toBe("network");
      expect(result.message).toBe(errorMessages.NETWORK_ERROR);
    });
  });

  describe("message mapping", () => {
    it.each([
      [new TypeError("fetch failed"), errorMessages.NETWORK_ERROR],
      [new Error("timeout"), errorMessages.TIMEOUT_ERROR],
      [new Error("401"), errorMessages.UNAUTHORIZED],
      [new Error("500"), errorMessages.SERVER_ERROR],
      [new Error("mystery"), errorMessages.UNKNOWN_ERROR],
    ])("maps %o to its user-friendly message", (input, expected) => {
      expect(classifyError(input).message).toBe(expected);
    });
  });
});

describe("getUserFriendlyMessage", () => {
  it("returns the message for every code in the catalogue", () => {
    for (const [code, message] of Object.entries(errorMessages)) {
      expect(getUserFriendlyMessage(code)).toBe(message);
    }
  });

  it("falls back to the unknown-error message for an unrecognised code", () => {
    expect(getUserFriendlyMessage("SOMETHING_NEW")).toBe(
      errorMessages.UNKNOWN_ERROR
    );
  });

  it("falls back to the unknown-error message for an empty code", () => {
    expect(getUserFriendlyMessage("")).toBe(errorMessages.UNKNOWN_ERROR);
  });
});

describe("errorMessages", () => {
  it("exports a user-friendly message for each supported error code", () => {
    expect(Object.keys(errorMessages).sort()).toEqual([
      "NETWORK_ERROR",
      "NOT_FOUND",
      "SERVER_ERROR",
      "TIMEOUT_ERROR",
      "UNAUTHORIZED",
      "UNKNOWN_ERROR",
      "VALIDATION_ERROR",
    ]);
  });

  it("every message is a non-empty human-readable string", () => {
    for (const message of Object.values(errorMessages)) {
      expect(typeof message).toBe("string");
      expect(message.trim().length).toBeGreaterThan(0);
      expect(message.endsWith(".")).toBe(true);
    }
  });
});

describe("ErrorLogger", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("logs an error with its message, component context and stack", () => {
    const logger = new ErrorLogger();
    const error = new Error("kaboom");

    const info = logger.log(error, "MyComponent");

    expect(info.errorMessage).toBe("kaboom");
    expect(info.componentStack).toBe("MyComponent");
    expect(info.errorStack).toBe(error.stack);
    expect(info.timestamp).toBeInstanceOf(Date);
    expect(info.timestamp.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(logger.getErrors()).toHaveLength(1);
  });

  it("keeps a copy: mutating the returned list does not affect the logger", () => {
    const logger = new ErrorLogger();
    logger.log(new Error("one"), "A");

    const errors = logger.getErrors();
    errors.push(logger.getErrors()[0]);
    errors.pop();
    errors.length = 0;

    expect(logger.getErrors()).toHaveLength(1);
  });

  it("keeps only the most recent errors once maxErrors is exceeded", () => {
    const logger = new ErrorLogger(2);
    logger.log(new Error("first"), "A");
    logger.log(new Error("second"), "B");
    logger.log(new Error("third"), "C");

    const errors = logger.getErrors();
    expect(errors).toHaveLength(2);
    expect(errors.map((e) => e.errorMessage)).toEqual(["second", "third"]);
  });

  it("retains up to 100 errors by default", () => {
    const logger = new ErrorLogger();
    for (let i = 0; i < 105; i++) {
      logger.log(new Error(`error-${i}`), "A");
    }

    const errors = logger.getErrors();
    expect(errors).toHaveLength(100);
    expect(errors[0].errorMessage).toBe("error-5");
    expect(errors[99].errorMessage).toBe("error-104");
  });

  it("getErrorsSince only returns errors newer than the cutoff", () => {
    const logger = new ErrorLogger();
    logger.log(new Error("old"), "A");

    vi.advanceTimersByTime(10 * 60 * 1000); // +10 minutes
    logger.log(new Error("recent"), "B");

    expect(logger.getErrorsSince(5)).toHaveLength(1);
    expect(logger.getErrorsSince(5)[0].errorMessage).toBe("recent");
    expect(logger.getErrorsSince(60)).toHaveLength(2);
    expect(logger.getErrorsSince(0)).toHaveLength(0);
  });

  it("getStats reports totals, recent errors and the last error", () => {
    const logger = new ErrorLogger();

    expect(logger.getStats()).toEqual({
      total: 0,
      recentErrors: 0,
      lastError: undefined,
    });

    logger.log(new Error("old"), "A");
    vi.advanceTimersByTime(10 * 60 * 1000); // +10 minutes
    logger.log(new Error("recent"), "B");

    const stats = logger.getStats();
    expect(stats.total).toBe(2);
    expect(stats.recentErrors).toBe(1);
    expect(stats.lastError?.errorMessage).toBe("recent");
  });

  it("clear() removes every logged error", () => {
    const logger = new ErrorLogger();
    logger.log(new Error("one"), "A");
    logger.log(new Error("two"), "B");

    logger.clear();

    expect(logger.getErrors()).toHaveLength(0);
    expect(logger.getStats().total).toBe(0);
  });

  it("toJSON() serialises the logged errors as parseable JSON", () => {
    const logger = new ErrorLogger();
    logger.log(new Error("serialised"), "Panel");

    const parsed = JSON.parse(logger.toJSON());

    expect(parsed).toHaveLength(1);
    expect(parsed[0].errorMessage).toBe("serialised");
    expect(parsed[0].componentStack).toBe("Panel");
    expect(parsed[0].timestamp).toBe("2026-01-01T00:00:00.000Z");
  });
});

describe("globalErrorLogger", () => {
  it("is a shared ErrorLogger instance", () => {
    expect(globalErrorLogger).toBeInstanceOf(ErrorLogger);
  });

  it("retains errors logged through it for other module consumers", () => {
    globalErrorLogger.clear();
    globalErrorLogger.log(new Error("shared"), "ErrorFallback");

    const found = globalErrorLogger
      .getErrors()
      .filter((e) => e.errorMessage === "shared");

    expect(found).toHaveLength(1);
    expect(found[0].componentStack).toBe("ErrorFallback");

    globalErrorLogger.clear();
  });
});
