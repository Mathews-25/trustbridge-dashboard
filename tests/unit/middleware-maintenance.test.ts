/**
 * Maintenance-mode middleware unit tests (issue #202).
 *
 * `npm test -- middleware` picks this file up alongside middleware.test.ts.
 *
 * Verifies:
 *  - reads (GET/HEAD) are never blocked
 *  - mutating API requests are blocked only while MAINTENANCE is truthy
 *  - /api/auth, /api/webhooks and /api/health are exempt
 *  - non-API paths are untouched
 *  - the env var is the only signal the sync helper reads (no DB)
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  isMaintenanceBypassPath,
  isMaintenanceModeFromEnv,
  isMutatingMethod,
  shouldBlockForMaintenance,
} from "@/lib/maintenance";

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  delete process.env.MAINTENANCE;
  delete process.env.MAINTENANCE_MESSAGE;
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
});

describe("isMaintenanceModeFromEnv", () => {
  it("is false when unset", () => {
    expect(isMaintenanceModeFromEnv()).toBe(false);
  });

  it.each(["1", "true", "on", "YES", "enabled"])(
    "is true for %s",
    (value) => {
      process.env.MAINTENANCE = value;
      expect(isMaintenanceModeFromEnv()).toBe(true);
    },
  );

  it.each(["0", "false", "off", "", "no"])("is false for %s", (value) => {
    process.env.MAINTENANCE = value;
    expect(isMaintenanceModeFromEnv()).toBe(false);
  });
});

describe("isMutatingMethod", () => {
  it("classifies verbs", () => {
    expect(isMutatingMethod("POST")).toBe(true);
    expect(isMutatingMethod("put")).toBe(true);
    expect(isMutatingMethod("PATCH")).toBe(true);
    expect(isMutatingMethod("DELETE")).toBe(true);
    expect(isMutatingMethod("GET")).toBe(false);
    expect(isMutatingMethod("HEAD")).toBe(false);
    expect(isMutatingMethod(undefined)).toBe(false);
  });
});

describe("isMaintenanceBypassPath", () => {
  it("matches the exact prefix and sub-paths", () => {
    expect(isMaintenanceBypassPath("/api/auth")).toBe(true);
    expect(isMaintenanceBypassPath("/api/auth/callback/github")).toBe(true);
    expect(isMaintenanceBypassPath("/api/webhooks/github-org-membership")).toBe(
      true,
    );
    expect(isMaintenanceBypassPath("/api/health")).toBe(true);
    expect(isMaintenanceBypassPath("/api/check")).toBe(true);
  });

  it("does not match unrelated paths", () => {
    expect(isMaintenanceBypassPath("/api/contributors")).toBe(false);
    expect(isMaintenanceBypassPath("/api/authenticate")).toBe(false);
  });
});

describe("shouldBlockForMaintenance", () => {
  it("never blocks when maintenance mode is off", () => {
    expect(shouldBlockForMaintenance("POST", "/api/contributors")).toBe(false);
  });

  describe("with MAINTENANCE=1", () => {
    beforeEach(() => {
      process.env.MAINTENANCE = "1";
    });

    it("blocks mutating API requests", () => {
      expect(shouldBlockForMaintenance("POST", "/api/contributors")).toBe(true);
      expect(shouldBlockForMaintenance("DELETE", "/api/invites")).toBe(true);
    });

    it("allows reads through", () => {
      expect(shouldBlockForMaintenance("GET", "/api/contributors")).toBe(false);
      expect(shouldBlockForMaintenance("HEAD", "/api/health")).toBe(false);
    });

    it("allows webhooks, auth, health and check through", () => {
      expect(
        shouldBlockForMaintenance("POST", "/api/webhooks/trustbridge-action"),
      ).toBe(false);
      expect(shouldBlockForMaintenance("POST", "/api/auth/signin")).toBe(false);
      expect(shouldBlockForMaintenance("POST", "/api/health")).toBe(false);
      expect(shouldBlockForMaintenance("POST", "/api/check")).toBe(false);
    });

    it("ignores non-API paths", () => {
      expect(shouldBlockForMaintenance("POST", "/dashboard")).toBe(false);
    });
  });
});
