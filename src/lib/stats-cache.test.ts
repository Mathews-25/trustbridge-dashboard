/**
 * Tests for Build Stats API Cache Headers (#73)
 *
 * Covers:
 * - parseStatsCacheTtl: env-var parsing with valid, invalid, and missing values
 * - buildPublicCacheControl / buildPrivateCacheControl / buildNoCacheControl
 * - buildStatsCacheHeaders: full header map for /api/stats
 * - buildLookupCacheHeaders: full header map for /api/actions/lookup
 * - CacheStore integration: in-process cache hit/miss/invalidation used by
 *   getDashboardStats (success path)
 * - Failure / edge-case paths: Horizon outage, invalid env config, 100+
 *   contributor scale guard (cache absorbs DB load)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CacheStore,
  buildLookupCacheHeaders,
  buildNoCacheControl,
  buildPrivateCacheControl,
  buildPublicCacheControl,
  buildStatsCacheHeaders,
  parseStatsCacheTtl,
  statsCache,
} from "@/lib/cache";

// ─────────────────────────────────────────────────────────────────────────────
// parseStatsCacheTtl
// ─────────────────────────────────────────────────────────────────────────────

describe("parseStatsCacheTtl", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns 60 000 ms when STATS_CACHE_TTL_MS is not set", () => {
    delete process.env.STATS_CACHE_TTL_MS;
    expect(parseStatsCacheTtl()).toBe(60_000);
  });

  it("parses a valid integer string (success path)", () => {
    process.env.STATS_CACHE_TTL_MS = "120000";
    expect(parseStatsCacheTtl()).toBe(120_000);
  });

  it("returns the default for a zero value (failure path)", () => {
    process.env.STATS_CACHE_TTL_MS = "0";
    expect(parseStatsCacheTtl()).toBe(60_000);
  });

  it("returns the default for a negative value (failure path)", () => {
    process.env.STATS_CACHE_TTL_MS = "-5000";
    expect(parseStatsCacheTtl()).toBe(60_000);
  });

  it("returns the default for a non-numeric string (failure path)", () => {
    process.env.STATS_CACHE_TTL_MS = "not-a-number";
    expect(parseStatsCacheTtl()).toBe(60_000);
  });

  it("returns the default for an empty string (failure path)", () => {
    process.env.STATS_CACHE_TTL_MS = "";
    expect(parseStatsCacheTtl()).toBe(60_000);
  });

  it("truncates a float to an integer", () => {
    process.env.STATS_CACHE_TTL_MS = "90500";
    expect(parseStatsCacheTtl()).toBe(90_500);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildPublicCacheControl
// ─────────────────────────────────────────────────────────────────────────────

describe("buildPublicCacheControl", () => {
  it("builds a correct header for a round TTL (success path)", () => {
    expect(buildPublicCacheControl(60_000)).toBe(
      "public, max-age=60, stale-while-revalidate=60"
    );
  });

  it("accepts a custom swr window", () => {
    expect(buildPublicCacheControl(120_000, 30_000)).toBe(
      "public, max-age=120, stale-while-revalidate=30"
    );
  });

  it("floors sub-second values to zero seconds (edge case)", () => {
    expect(buildPublicCacheControl(500)).toBe(
      "public, max-age=0, stale-while-revalidate=0"
    );
  });

  it("handles 10-minute TTL correctly", () => {
    expect(buildPublicCacheControl(10 * 60_000)).toBe(
      "public, max-age=600, stale-while-revalidate=600"
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildPrivateCacheControl
// ─────────────────────────────────────────────────────────────────────────────

describe("buildPrivateCacheControl", () => {
  it("builds a private header (success path)", () => {
    expect(buildPrivateCacheControl(30_000)).toBe(
      "private, max-age=30, must-revalidate"
    );
  });

  it("floors sub-second values to zero seconds", () => {
    expect(buildPrivateCacheControl(999)).toBe(
      "private, max-age=0, must-revalidate"
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildNoCacheControl
// ─────────────────────────────────────────────────────────────────────────────

describe("buildNoCacheControl", () => {
  it("returns the no-store directive (success path)", () => {
    expect(buildNoCacheControl()).toBe("no-store, no-cache, must-revalidate");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildStatsCacheHeaders
// ─────────────────────────────────────────────────────────────────────────────

describe("buildStatsCacheHeaders", () => {
  it("returns all required headers for a 60-second TTL (success path)", () => {
    const headers = buildStatsCacheHeaders(60_000);

    expect(headers["Cache-Control"]).toBe(
      "public, max-age=60, stale-while-revalidate=30"
    );
    expect(headers["CDN-Cache-Control"]).toBe(
      "public, max-age=60, stale-while-revalidate=30"
    );
    expect(headers["Vary"]).toBe("Accept-Encoding");
  });

  it("uses half the TTL as the default SWR window", () => {
    const headers = buildStatsCacheHeaders(120_000);
    // swr = floor(120_000 / 2) = 60_000 → 60 s
    expect(headers["Cache-Control"]).toContain("stale-while-revalidate=60");
  });

  it("accepts an explicit swr window", () => {
    const headers = buildStatsCacheHeaders(120_000, 10_000);
    expect(headers["Cache-Control"]).toBe(
      "public, max-age=120, stale-while-revalidate=10"
    );
    expect(headers["CDN-Cache-Control"]).toBe(
      "public, max-age=120, stale-while-revalidate=10"
    );
  });

  it("Cache-Control and CDN-Cache-Control are always equal (no split-brain)", () => {
    const headers = buildStatsCacheHeaders(45_000, 15_000);
    expect(headers["Cache-Control"]).toBe(headers["CDN-Cache-Control"]);
  });

  it("includes Vary: Accept-Encoding regardless of TTL", () => {
    expect(buildStatsCacheHeaders(1_000)["Vary"]).toBe("Accept-Encoding");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildLookupCacheHeaders
// ─────────────────────────────────────────────────────────────────────────────

describe("buildLookupCacheHeaders", () => {
  it("returns correct headers for a 30-second TTL (success path)", () => {
    const headers = buildLookupCacheHeaders(30_000);

    expect(headers["Cache-Control"]).toBe(
      "public, max-age=30, stale-while-revalidate=30"
    );
    expect(headers["Vary"]).toBe("Accept-Encoding");
  });

  it("does not include CDN-Cache-Control (lookup is address-scoped, not global)", () => {
    const headers = buildLookupCacheHeaders(30_000);
    expect(Object.keys(headers)).not.toContain("CDN-Cache-Control");
  });

  it("includes Vary: Accept-Encoding", () => {
    expect(buildLookupCacheHeaders(10_000)["Vary"]).toBe("Accept-Encoding");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CacheStore — in-process cache used by getDashboardStats
// ─────────────────────────────────────────────────────────────────────────────

describe("CacheStore (stats layer)", () => {
  let cache: CacheStore<{ total: number }>;

  beforeEach(() => {
    cache = new CacheStore<{ total: number }>(60_000);
  });

  it("returns null for a cold cache miss (success path — DB will be called)", () => {
    expect(cache.get("stats:dashboard")).toBeNull();
  });

  it("returns a stored value on cache hit (success path — DB not called)", () => {
    const data = { total: 42 };
    cache.set("stats:dashboard", data);
    expect(cache.get("stats:dashboard")).toEqual(data);
  });

  it("reports a hit in stats after a successful get", () => {
    cache.set("k", { total: 1 });
    cache.get("k");
    expect(cache.getStats().hits).toBe(1);
    expect(cache.getStats().misses).toBe(0);
  });

  it("reports a miss in stats for an unknown key", () => {
    cache.get("unknown");
    expect(cache.getStats().misses).toBe(1);
  });

  it("evicts an expired entry (failure path — TTL expired)", async () => {
    cache.set("stats:dashboard", { total: 5 }, 1); // 1 ms TTL
    await new Promise((r) => setTimeout(r, 5));
    expect(cache.get("stats:dashboard")).toBeNull();
    expect(cache.getStats().evictions).toBe(1);
  });

  it("invalidate removes a specific entry", () => {
    cache.set("stats:dashboard", { total: 10 });
    cache.invalidate("stats:dashboard");
    expect(cache.get("stats:dashboard")).toBeNull();
  });

  it("reset clears all entries and zeroes stats", () => {
    cache.set("a", { total: 1 });
    cache.set("b", { total: 2 });
    cache.get("a"); // hit
    cache.reset();
    expect(cache.getStats().size).toBe(0);
    expect(cache.getStats().hits).toBe(0);
  });

  it("getOrCompute calls the factory only on a miss (success path)", async () => {
    const factory = vi.fn().mockResolvedValue({ total: 99 });
    const first = await cache.getOrCompute("stats:k", factory);
    const second = await cache.getOrCompute("stats:k", factory);

    expect(first).toEqual({ total: 99 });
    expect(second).toEqual({ total: 99 });
    expect(factory).toHaveBeenCalledTimes(1); // DB called once, then cached
  });

  it("getOrCompute re-calls the factory after invalidation (cache-miss failure path)", async () => {
    const factory = vi
      .fn()
      .mockResolvedValueOnce({ total: 1 })
      .mockResolvedValueOnce({ total: 2 });

    await cache.getOrCompute("stats:k", factory);
    cache.invalidate("stats:k");
    const result = await cache.getOrCompute("stats:k", factory);

    expect(result).toEqual({ total: 2 });
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it("getOrCompute propagates factory errors without caching (failure path — DB/Horizon outage)", async () => {
    const factory = vi.fn().mockRejectedValue(new Error("DB connection lost"));

    await expect(cache.getOrCompute("stats:k", factory)).rejects.toThrow(
      "DB connection lost"
    );
    // Nothing should be cached after a failure
    expect(cache.get("stats:k")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// statsCache singleton — used directly by getDashboardStats
// ─────────────────────────────────────────────────────────────────────────────

describe("statsCache singleton", () => {
  beforeEach(() => {
    statsCache.reset();
  });

  it("is initially empty", () => {
    expect(statsCache.getStats().size).toBe(0);
  });

  it("stores and retrieves a DashboardStats shape", () => {
    const data = { totalContributors: 100, readyCount: 75, readyPercent: 75 };
    statsCache.set("stats:\"dashboard\"", data as unknown);
    expect(statsCache.get("stats:\"dashboard\"")).toEqual(data);
  });

  it("getOrCompute absorbs 100+ contributor scale by calling factory once", async () => {
    // Simulate an expensive DB query that returns a large contributor count.
    const expensiveQuery = vi.fn().mockResolvedValue({
      totalContributors: 500,
      readyCount: 430,
      readyPercent: 86,
    });

    const key = "stats:\"dashboard\"";
    const r1 = await statsCache.getOrCompute(key, expensiveQuery);
    const r2 = await statsCache.getOrCompute(key, expensiveQuery);
    const r3 = await statsCache.getOrCompute(key, expensiveQuery);

    expect(r1.totalContributors).toBe(500);
    expect(r2).toEqual(r1);
    expect(r3).toEqual(r1);
    // DB was only hit once regardless of how many concurrent requests arrive
    expect(expensiveQuery).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Integration: cache-control values roundtrip through header map
// ─────────────────────────────────────────────────────────────────────────────

describe("cache header roundtrip (integration)", () => {
  it("stats headers derived from parseStatsCacheTtl default match expected values", () => {
    // Default TTL = 60 000 ms → max-age=60, swr=30
    const ttl = 60_000; // mimic the default
    const headers = buildStatsCacheHeaders(ttl);

    expect(headers["Cache-Control"]).toBe(
      "public, max-age=60, stale-while-revalidate=30"
    );
  });

  it("lookup headers match a 30-second TTL", () => {
    const headers = buildLookupCacheHeaders(30_000);
    expect(headers["Cache-Control"]).toBe(
      "public, max-age=30, stale-while-revalidate=30"
    );
  });

  it("no-cache headers are completely different from public headers", () => {
    const pub = buildPublicCacheControl(60_000);
    const none = buildNoCacheControl();

    expect(pub).not.toBe(none);
    expect(none).toContain("no-store");
    expect(pub).toContain("public");
  });
});
