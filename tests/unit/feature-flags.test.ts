/**
 * Unit tests for the feature-flags module (issue #201).
 *
 * Covers the resolution order (env override → DB row → built-in default),
 * the fail-closed behaviour for risky flags when the DB source is unreadable,
 * and the in-process cache.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    featureFlag: {
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  clearFeatureFlagCache,
  getAllFeatureFlags,
  isFeatureEnabled,
  isFeatureEnabledFromEnv,
  setFeatureFlag,
} from "@/lib/feature-flags";

const findMany = vi.mocked(prisma.featureFlag.findMany);
const upsert = vi.mocked(prisma.featureFlag.upsert);

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  delete process.env.FEATURE_FLAGS_DB_ENABLED;
  delete process.env.FEATURE_FLAG_BATCH_RECHECK;
  delete process.env.FEATURE_FLAG_OTEL_TRACES;
  delete process.env.FEATURE_FLAG_DLQ_RETRY;
  delete process.env.FEATURE_FLAG_FREEZE_WINDOW;
  clearFeatureFlagCache();
  vi.clearAllMocks();
  findMany.mockResolvedValue([]);
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
});

describe("built-in defaults", () => {
  it("returns the default when there is no env override and no DB source", async () => {
    expect(await isFeatureEnabled("batch_recheck")).toBe(true);
    expect(await isFeatureEnabled("otel_traces")).toBe(false);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("returns false for an unknown flag", async () => {
    // @ts-expect-error deliberately passing an unknown key
    expect(await isFeatureEnabled("nope")).toBe(false);
  });
});

describe("env overrides", () => {
  it("an env override wins over the default and is not a DB read", async () => {
    process.env.FEATURE_FLAG_BATCH_RECHECK = "off";
    expect(await isFeatureEnabled("batch_recheck")).toBe(false);

    process.env.FEATURE_FLAG_OTEL_TRACES = "1";
    expect(await isFeatureEnabled("otel_traces")).toBe(true);

    expect(findMany).not.toHaveBeenCalled();
  });

  it("isFeatureEnabledFromEnv ignores the DB entirely", () => {
    process.env.FEATURE_FLAGS_DB_ENABLED = "1";
    process.env.FEATURE_FLAG_DLQ_RETRY = "false";
    expect(isFeatureEnabledFromEnv("dlq_retry")).toBe(false);
    expect(isFeatureEnabledFromEnv("batch_recheck")).toBe(true); // default
    expect(findMany).not.toHaveBeenCalled();
  });

  it("an unrecognised env value falls through to the next source", async () => {
    process.env.FEATURE_FLAG_BATCH_RECHECK = "maybe";
    expect(await isFeatureEnabled("batch_recheck")).toBe(true); // default
  });
});

describe("database source", () => {
  beforeEach(() => {
    process.env.FEATURE_FLAGS_DB_ENABLED = "true";
  });

  it("uses the DB row when present", async () => {
    findMany.mockResolvedValue([
      { key: "otel_traces", enabled: true },
      { key: "batch_recheck", enabled: false },
    ] as never);

    expect(await isFeatureEnabled("otel_traces")).toBe(true);
    expect(await isFeatureEnabled("batch_recheck")).toBe(false);
  });

  it("falls back to the default when the DB has no row", async () => {
    findMany.mockResolvedValue([] as never);
    expect(await isFeatureEnabled("batch_recheck")).toBe(true);
  });

  it("caches the DB read within the TTL and re-reads after clear", async () => {
    findMany.mockResolvedValue([{ key: "otel_traces", enabled: true }] as never);

    await isFeatureEnabled("otel_traces");
    await isFeatureEnabled("batch_recheck");
    expect(findMany).toHaveBeenCalledTimes(1);

    clearFeatureFlagCache();
    await isFeatureEnabled("otel_traces");
    expect(findMany).toHaveBeenCalledTimes(2);
  });
});

describe("fail closed", () => {
  beforeEach(() => {
    process.env.FEATURE_FLAGS_DB_ENABLED = "1";
    findMany.mockRejectedValue(new Error("connection refused"));
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("resolves a risky flag to false when the DB source is unreadable", async () => {
    expect(await isFeatureEnabled("batch_recheck")).toBe(false);
    expect(await isFeatureEnabled("dlq_retry")).toBe(false);
    expect(await isFeatureEnabled("maintenance_mode")).toBe(false);
    expect(await isFeatureEnabled("freeze_window")).toBe(false);
  });

  it("resolves a non-risky flag to its default when the DB is unreadable", async () => {
    expect(await isFeatureEnabled("otel_traces")).toBe(false); // default false
  });

  it("still honours an env override even when the DB is down", async () => {
    process.env.FEATURE_FLAG_BATCH_RECHECK = "on";
    expect(await isFeatureEnabled("batch_recheck")).toBe(true);
    process.env.FEATURE_FLAG_FREEZE_WINDOW = "on";
    expect(await isFeatureEnabled("freeze_window")).toBe(true);
  });
});

describe("getAllFeatureFlags", () => {
  it("reports every known flag with its source", async () => {
    process.env.FEATURE_FLAG_OTEL_TRACES = "1";
    const all = await getAllFeatureFlags();
    const keys = all.map((f) => f.key).sort();
    expect(keys).toEqual(
      [
        "batch_recheck",
        "dlq_retry",
        "freeze_window",
        "invite_generation",
        "maintenance_mode",
        "otel_traces",
      ].sort(),
    );
    expect(all.find((f) => f.key === "otel_traces")?.source).toBe("env");
    expect(all.find((f) => f.key === "batch_recheck")?.source).toBe("default");
    expect(all.find((f) => f.key === "freeze_window")?.source).toBe("default");
  });
});

describe("setFeatureFlag", () => {
  it("throws when the DB source is disabled", async () => {
    await expect(setFeatureFlag("otel_traces", true)).rejects.toThrow(
      /FEATURE_FLAGS_DB_ENABLED/,
    );
    expect(upsert).not.toHaveBeenCalled();
  });

  it("upserts and clears the cache when the DB source is enabled", async () => {
    process.env.FEATURE_FLAGS_DB_ENABLED = "1";
    upsert.mockResolvedValue({} as never);
    await setFeatureFlag("otel_traces", true, "user-1");
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: "otel_traces" } }),
    );
  });
});
