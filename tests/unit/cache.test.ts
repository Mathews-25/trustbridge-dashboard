import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  CacheStore,
  buildPublicCacheControl,
  buildPrivateCacheControl,
  buildNoCacheControl,
  buildStatsCacheHeaders,
  buildLookupCacheHeaders,
  buildCacheKey,
  invalidateContributorCaches,
} from "@/lib/cache";

describe("CacheStore", () => {
  let cache: CacheStore<string>;

  beforeEach(() => {
    cache = new CacheStore<string>(100); // 100ms TTL
  });

  describe("get and set", () => {
    it("stores and retrieves values", () => {
      cache.set("key1", "value1");
      expect(cache.get("key1")).toBe("value1");
    });

    it("returns null for missing keys", () => {
      expect(cache.get("nonexistent")).toBeNull();
    });

    it("returns null for expired entries", async () => {
      cache.set("key1", "value1", 50); // 50ms TTL
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(cache.get("key1")).toBeNull();
    });

    it("respects custom TTL", async () => {
      cache.set("key1", "value1", 50);
      await new Promise((resolve) => setTimeout(resolve, 75));
      expect(cache.get("key1")).toBeNull();
    });

    it("uses default TTL when none provided", async () => {
      cache.set("key1", "value1"); // Uses 100ms default
      expect(cache.get("key1")).toBe("value1");
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(cache.get("key1")).toBeNull();
    });
  });

  describe("getOrCompute", () => {
    it("returns cached value if available", async () => {
      const fn = vi.fn().mockResolvedValue("computed");
      cache.set("key1", "cached");

      const result = await cache.getOrCompute("key1", fn);

      expect(result).toBe("cached");
      expect(fn).not.toHaveBeenCalled();
    });

    it("computes and caches if not available", async () => {
      const fn = vi.fn().mockResolvedValue("computed");

      const result = await cache.getOrCompute("key1", fn);

      expect(result).toBe("computed");
      expect(fn).toHaveBeenCalled();
      expect(cache.get("key1")).toBe("computed");
    });

    it("respects custom TTL in getOrCompute", async () => {
      const fn = vi.fn().mockResolvedValue("computed");

      await cache.getOrCompute("key1", fn, 50);
      expect(cache.get("key1")).toBe("computed");

      await new Promise((resolve) => setTimeout(resolve, 75));
      expect(cache.get("key1")).toBeNull();
    });
  });

  describe("invalidate", () => {
    it("removes a specific key", () => {
      cache.set("key1", "value1");
      cache.set("key2", "value2");

      cache.invalidate("key1");

      expect(cache.get("key1")).toBeNull();
      expect(cache.get("key2")).toBe("value2");
    });

    it("handles invalidating nonexistent keys", () => {
      expect(() => cache.invalidate("nonexistent")).not.toThrow();
    });
  });

  describe("invalidatePattern", () => {
    it("removes keys matching pattern", () => {
      cache.set("user:1", "data1");
      cache.set("user:2", "data2");
      cache.set("post:1", "postdata");

      const removed = cache.invalidatePattern(/^user:/);

      expect(removed).toBe(2);
      expect(cache.get("user:1")).toBeNull();
      expect(cache.get("user:2")).toBeNull();
      expect(cache.get("post:1")).toBe("postdata");
    });

    it("returns count of invalidated entries", () => {
      cache.set("a:1", "x");
      cache.set("a:2", "y");
      cache.set("b:1", "z");

      const count = cache.invalidatePattern(/^a:/);

      expect(count).toBe(2);
    });
  });

  describe("reset and clear", () => {
    it("clears all entries", () => {
      cache.set("key1", "value1");
      cache.set("key2", "value2");

      cache.clear();

      expect(cache.get("key1")).toBeNull();
      expect(cache.get("key2")).toBeNull();
    });

    it("resets stats on clear", () => {
      cache.set("key1", "value1");
      cache.get("key1");
      cache.get("nonexistent");

      cache.clear();
      const stats = cache.getStats();

      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.size).toBe(0);
    });

    it("reset() is an alias for clear()", () => {
      cache.set("key1", "value1");
      cache.reset();
      expect(cache.get("key1")).toBeNull();
    });
  });

  describe("statistics", () => {
    it("tracks hits and misses", () => {
      cache.set("key1", "value1");
      cache.get("key1"); // hit
      cache.get("key1"); // hit
      cache.get("nonexistent"); // miss

      const stats = cache.getStats();

      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBe(67); // 2 hits out of 3 requests
    });

    it("tracks evictions on expiry", async () => {
      cache.set("key1", "value1", 50);
      cache.get("key1"); // hit before expiry
      await new Promise((resolve) => setTimeout(resolve, 75));
      cache.get("key1"); // triggers eviction

      const stats = cache.getStats();

      expect(stats.evictions).toBe(1);
      expect(stats.misses).toBe(1);
    });

    it("calculates hit rate correctly", () => {
      cache.set("key1", "value1");
      cache.set("key2", "value2");
      cache.get("key1"); // hit
      cache.get("key2"); // hit
      cache.get("key3"); // miss
      cache.get("key3"); // miss

      const stats = cache.getStats();

      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(2);
      expect(stats.hitRate).toBe(50);
    });

    it("returns list of keys", () => {
      cache.set("key1", "value1");
      cache.set("key2", "value2");

      const stats = cache.getStats();

      expect(stats.keys).toContain("key1");
      expect(stats.keys).toContain("key2");
      expect(stats.keys.length).toBe(2);
    });
  });
});

describe("Cache control headers", () => {
  it("buildPublicCacheControl formats correctly", () => {
    const header = buildPublicCacheControl(60_000);
    expect(header).toBe("public, max-age=60, stale-while-revalidate=60");
  });

  it("buildPublicCacheControl with custom SWR", () => {
    const header = buildPublicCacheControl(60_000, 120_000);
    expect(header).toBe("public, max-age=60, stale-while-revalidate=120");
  });

  it("buildPrivateCacheControl formats correctly", () => {
    const header = buildPrivateCacheControl(30_000);
    expect(header).toBe("private, max-age=30, must-revalidate");
  });

  it("buildNoCacheControl prevents all caching", () => {
    const header = buildNoCacheControl();
    expect(header).toBe("no-store, no-cache, must-revalidate");
  });

  it("buildStatsCacheHeaders includes all required fields", () => {
    const headers = buildStatsCacheHeaders(60_000);

    expect(headers["Cache-Control"]).toBeDefined();
    expect(headers["CDN-Cache-Control"]).toBeDefined();
    expect(headers["Vary"]).toBe("Accept-Encoding");
  });

  it("buildLookupCacheHeaders includes Vary header", () => {
    const headers = buildLookupCacheHeaders(60_000);

    expect(headers["Cache-Control"]).toBeDefined();
    expect(headers["Vary"]).toBe("Accept-Encoding");
  });
});

describe("buildCacheKey", () => {
  it("builds keys from prefix and args", () => {
    const key = buildCacheKey("contributor", "user-123");
    expect(key).toBe('contributor:"user-123"');
  });

  it("handles multiple args", () => {
    const key = buildCacheKey("check", "address", "USDC", "issuer");
    expect(key).toContain("check:");
    expect(key).toContain("address");
  });

  it("JSON-encodes complex objects", () => {
    const key = buildCacheKey("data", { id: 1, name: "test" });
    expect(key).toContain('{"id":1,"name":"test"}');
  });
});

describe("invalidateContributorCaches", () => {
  it("invalidates contributor-related caches", () => {
    // This function invalidates multiple named caches
    // Just verify it doesn't throw
    expect(() => invalidateContributorCaches()).not.toThrow();
  });
});
