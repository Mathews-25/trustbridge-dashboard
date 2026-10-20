import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/audit", () => ({
  recordAuditLog: vi.fn(),
}));

vi.mock("@/lib/feature-flags", () => ({
  isFeatureEnabled: vi.fn(),
}));

import { isFeatureEnabled } from "@/lib/feature-flags";
import { enforceFreezeWindowGuard, isFreezeWindowActive } from "@/lib/freeze-window";
import { recordAuditLog } from "@/lib/audit";

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  delete process.env.FREEZE_WINDOW_ENABLED;
  delete process.env.FREEZE_WINDOW_START;
  delete process.env.FREEZE_WINDOW_END;
  vi.clearAllMocks();
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
});

function createRequest(url = "http://localhost:3000/api/test"): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: {
      origin: "http://localhost:3000",
      host: "localhost:3000",
      "content-type": "application/json",
    },
  });
}

describe("isFreezeWindowActive", () => {
  it("returns inactive when FREEZE_WINDOW_ENABLED is false", () => {
    process.env.FREEZE_WINDOW_ENABLED = "false";
    const status = isFreezeWindowActive();
    expect(status.active).toBe(false);
  });

  it("returns inactive when start/end are not set", () => {
    const status = isFreezeWindowActive();
    expect(status.active).toBe(false);
  });

  it("returns inactive when current time is before start", () => {
    process.env.FREEZE_WINDOW_START = "2099-01-01T00:00:00Z";
    process.env.FREEZE_WINDOW_END = "2099-12-31T00:00:00Z";
    const status = isFreezeWindowActive(new Date("2026-01-01T00:00:00Z"));
    expect(status.active).toBe(false);
  });

  it("returns inactive when current time is after end", () => {
    process.env.FREEZE_WINDOW_START = "2020-01-01T00:00:00Z";
    process.env.FREEZE_WINDOW_END = "2020-12-31T00:00:00Z";
    const status = isFreezeWindowActive(new Date("2026-01-01T00:00:00Z"));
    expect(status.active).toBe(false);
  });

  it("returns active when current time is within window", () => {
    process.env.FREEZE_WINDOW_START = "2026-01-01T00:00:00Z";
    process.env.FREEZE_WINDOW_END = "2099-12-31T00:00:00Z";
    const status = isFreezeWindowActive(new Date("2026-06-01T00:00:00Z"));
    expect(status.active).toBe(true);
    expect(status.reason).toContain("freeze");
  });

  it("includes both start and end boundaries but excludes adjacent milliseconds", () => {
    process.env.FREEZE_WINDOW_START = "2026-06-01T00:00:00.000Z";
    process.env.FREEZE_WINDOW_END = "2026-06-01T01:00:00.000Z";

    expect(isFreezeWindowActive(new Date("2026-06-01T00:00:00.000Z")).active).toBe(true);
    expect(isFreezeWindowActive(new Date("2026-06-01T01:00:00.000Z")).active).toBe(true);
    expect(isFreezeWindowActive(new Date("2026-05-31T23:59:59.999Z")).active).toBe(false);
    expect(isFreezeWindowActive(new Date("2026-06-01T01:00:00.001Z")).active).toBe(false);
  });

  it("treats a zero-duration window as active only at its exact instant", () => {
    process.env.FREEZE_WINDOW_START = "2026-06-01T00:00:00.000Z";
    process.env.FREEZE_WINDOW_END = "2026-06-01T00:00:00.000Z";

    expect(isFreezeWindowActive(new Date("2026-06-01T00:00:00.000Z")).active).toBe(true);
    expect(isFreezeWindowActive(new Date("2026-06-01T00:00:00.001Z")).active).toBe(false);
  });

  it("treats a reversed window as invalid", () => {
    process.env.FREEZE_WINDOW_START = "2026-06-01T01:00:00.000Z";
    process.env.FREEZE_WINDOW_END = "2026-06-01T00:00:00.000Z";

    expect(isFreezeWindowActive(new Date("2026-06-01T00:30:00.000Z"))).toEqual({
      active: false,
    });
  });
});

describe("enforceFreezeWindowGuard with freeze_window feature flag", () => {
  it("does not block when freeze_window flag is OFF even if window is active", async () => {
    vi.mocked(isFeatureEnabled).mockResolvedValue(false);
    process.env.FREEZE_WINDOW_START = "2026-01-01T00:00:00Z";
    process.env.FREEZE_WINDOW_END = "2099-12-31T00:00:00Z";

    const result = await enforceFreezeWindowGuard({
      request: createRequest(),
      actionLabel: "test",
    });

    expect(result.blocked).toBe(false);
    expect(result.response).toBeUndefined();
    expect(recordAuditLog).not.toHaveBeenCalled();
  });

  it("blocks when freeze_window flag is ON and window is active", async () => {
    vi.mocked(isFeatureEnabled).mockResolvedValue(true);
    process.env.FREEZE_WINDOW_START = "2026-01-01T00:00:00Z";
    process.env.FREEZE_WINDOW_END = "2099-12-31T00:00:00Z";

    const result = await enforceFreezeWindowGuard({
      request: createRequest(),
      actionLabel: "test",
    });

    expect(result.blocked).toBe(true);
    expect(result.response).toBeDefined();
    expect(result.response?.status).toBe(423);
    expect(recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "test.freeze_blocked" })
    );
  });

  it("does not block when freeze_window flag is ON but window is inactive", async () => {
    vi.mocked(isFeatureEnabled).mockResolvedValue(true);
    process.env.FREEZE_WINDOW_ENABLED = "false";

    const result = await enforceFreezeWindowGuard({
      request: createRequest(),
      actionLabel: "test",
    });

    expect(result.blocked).toBe(false);
    expect(result.response).toBeUndefined();
  });

  it("allows maintainer override when flag is ON and window is active", async () => {
    vi.mocked(isFeatureEnabled).mockResolvedValue(true);
    process.env.FREEZE_WINDOW_START = "2026-01-01T00:00:00Z";
    process.env.FREEZE_WINDOW_END = "2099-12-31T00:00:00Z";

    const request = createRequest();
    request.headers.set("x-freeze-override", "true");

    const result = await enforceFreezeWindowGuard({
      request,
      isMaintainer: true,
      userId: "maintainer-1",
      userLogin: "maintainer",
      actionLabel: "test",
    });

    expect(result.blocked).toBe(false);
    expect(result.isOverride).toBe(true);
    expect(recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "test.freeze_override" })
    );
  });

  it("blocks non-maintainer override attempt when flag is ON", async () => {
    vi.mocked(isFeatureEnabled).mockResolvedValue(true);
    process.env.FREEZE_WINDOW_START = "2026-01-01T00:00:00Z";
    process.env.FREEZE_WINDOW_END = "2099-12-31T00:00:00Z";

    const request = createRequest();
    request.headers.set("x-freeze-override", "true");

    const result = await enforceFreezeWindowGuard({
      request,
      isMaintainer: false,
      userId: "user-1",
      userLogin: "user",
      actionLabel: "test",
    });

    expect(result.blocked).toBe(true);
    expect(result.response?.status).toBe(423);
  });
});
