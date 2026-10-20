import { describe, it, expect, vi, beforeEach } from "vitest";
import { StructuredLogger, createRequestLogger } from "@/lib/logger";

describe("StructuredLogger", () => {
  let consoleSpy: any;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("formats info logs with correct structure", () => {
    const logger = new StructuredLogger("test-context");
    logger.info("test message", { key: "value" });

    expect(consoleSpy).toHaveBeenCalledOnce();
    const call = consoleSpy.mock.calls[0][0];
    const parsed = JSON.parse(call);

    expect(parsed).toMatchObject({
      level: "info",
      context: "test-context",
      message: "test message",
      details: { key: "value" },
    });
    expect(parsed.timestamp).toBeDefined();
  });

  it("logs without details when not provided", () => {
    const logger = new StructuredLogger("test-context");
    logger.info("simple message");

    const call = consoleSpy.mock.calls[0][0];
    const parsed = JSON.parse(call);

    expect(parsed.details).toBeUndefined();
    expect(parsed.message).toBe("simple message");
  });

  it("respects different log levels", () => {
    const logger = new StructuredLogger("test-context");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    logger.info("info message");
    logger.warn("warn message");
    logger.error("error message");

    const infoLog = JSON.parse(consoleSpy.mock.calls[0][0]);
    const warnLog = JSON.parse(warnSpy.mock.calls[0][0]);
    const errorLog = JSON.parse(errorSpy.mock.calls[0][0]);

    expect(infoLog.level).toBe("info");
    expect(warnLog.level).toBe("warn");
    expect(errorLog.level).toBe("error");

    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("logs debug messages only when DEBUG env var is set", () => {
    const originalDebug = process.env.DEBUG;
    process.env.DEBUG = "false";

    const logger = new StructuredLogger("test-context");
    logger.debug("debug message");

    expect(consoleSpy).not.toHaveBeenCalled();

    process.env.DEBUG = "true";
    logger.debug("debug message 2");

    expect(consoleSpy).toHaveBeenCalledOnce();

    if (originalDebug === undefined) {
      delete process.env.DEBUG;
    } else {
      process.env.DEBUG = originalDebug;
    }
  });

  // ── request ID support ─────────────────────────────────────────────────

  it("omits requestId field when none is provided", () => {
    const logger = new StructuredLogger("test-context");
    logger.info("no-id message");

    const parsed = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(parsed.requestId).toBeUndefined();
  });

  it("includes requestId when passed to constructor", () => {
    const reqId = "550e8400-e29b-4d4f-a716-446655440000";
    const logger = new StructuredLogger("test-context", reqId);
    logger.info("with-id message");

    const parsed = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(parsed.requestId).toBe(reqId);
  });

  it("includes requestId on every log level emitted by the same logger", () => {
    const reqId = "550e8400-e29b-4d4f-a716-446655440001";
    const logger = new StructuredLogger("test-context", reqId);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    logger.info("info");
    logger.warn("warn");
    logger.error("error");

    const infoLog = JSON.parse(consoleSpy.mock.calls[0][0]);
    const warnLog = JSON.parse(warnSpy.mock.calls[0][0]);
    const errorLog = JSON.parse(errorSpy.mock.calls[0][0]);

    expect(infoLog.requestId).toBe(reqId);
    expect(warnLog.requestId).toBe(reqId);
    expect(errorLog.requestId).toBe(reqId);

    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("withRequestId() returns a new logger that includes the ID", () => {
    const reqId = "550e8400-e29b-4d4f-a716-446655440002";
    const base = new StructuredLogger("test-context");
    const scoped = base.withRequestId(reqId);

    // Original logger should not be affected
    base.info("base message");
    const baseParsed = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(baseParsed.requestId).toBeUndefined();

    consoleSpy.mockClear();

    // Scoped logger should include the ID
    scoped.info("scoped message");
    const scopedParsed = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(scopedParsed.requestId).toBe(reqId);
  });

  it("withRequestId() preserves the context of the original logger", () => {
    const reqId = "550e8400-e29b-4d4f-a716-446655440003";
    const base = new StructuredLogger("my-context");
    const scoped = base.withRequestId(reqId);

    scoped.info("check context");
    const parsed = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(parsed.context).toBe("my-context");
    expect(parsed.requestId).toBe(reqId);
  });
});

describe("createRequestLogger", () => {
  it("returns a function that logs request details", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const logger = createRequestLogger("api");

    const mockRequest = {
      method: "POST",
      nextUrl: {
        pathname: "/api/check",
        searchParams: new URLSearchParams(),
      },
      headers: new Map([
        ["user-agent", "test-agent"],
        ["origin", "http://localhost:3000"],
      ]),
    };

    logger(mockRequest as any);

    expect(consoleSpy).toHaveBeenCalled();
    const parsed = JSON.parse(consoleSpy.mock.calls[0][0]);

    expect(parsed.message).toBe("incoming_request");
    expect(parsed.details).toMatchObject({
      method: "POST",
      pathname: "/api/check",
      userAgent: "test-agent",
      origin: "http://localhost:3000",
    });

    consoleSpy.mockRestore();
  });
});
