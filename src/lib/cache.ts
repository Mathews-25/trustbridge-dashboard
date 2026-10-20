/**
 * Caching layer for TrustBridge Dashboard.
 * Reduces database queries and Horizon API calls with intelligent TTL management.
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
  hits: number;
}

/**
 * Generic in-memory cache with TTL and statistics.
 */
export class CacheStore<T> {
  private store = new Map<string, CacheEntry<T>>();
  private readonly defaultTtlMs: number;
  private stats = { hits: 0, misses: 0, evictions: 0 };

  constructor(defaultTtlMs: number = 60_000) {
    this.defaultTtlMs = defaultTtlMs;
  }

  /**
   * Get a value from cache if valid.
   */
  get(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this.stats.evictions++;
      this.stats.misses++;
      return null;
    }

    entry.hits++;
    this.stats.hits++;
    return entry.data;
  }

  /**
   * Set a value in cache.
   */
  set(key: string, data: T, ttlMs?: number): void {
    this.store.set(key, {
      data,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs),
      hits: 0,
    });
  }

  /**
   * Get or compute a value with fallback.
   */
  async getOrCompute(
    key: string,
    fn: () => Promise<T>,
    ttlMs?: number,
  ): Promise<T> {
    const cached = this.get(key);
    if (cached !== null) {
      return cached;
    }

    const data = await fn();
    this.set(key, data, ttlMs);
    return data;
  }

  /**
   * Invalidate a specific cache entry.
   */
  invalidate(key: string): void {
    this.store.delete(key);
  }

  /**
   * Invalidate all entries matching a pattern.
   */
  invalidatePattern(pattern: RegExp): number {
    let count = 0;
    const keys = Array.from(this.store.keys());
    for (const key of keys) {
      if (pattern.test(key)) {
        this.store.delete(key);
        count++;
      }
    }
    return count;
  }

  /**
   * Clear all cache entries.
   */
  clear(): void {
    this.store.clear();
    this.stats = { hits: 0, misses: 0, evictions: 0 };
  }

  /**
   * Reset the cache — clears all entries and zeroes all stats.
   * Alias for `clear()` with a more test-friendly name, matching the
   * `resetRateLimit()` / `resetCircuitBreaker()` convention used elsewhere.
   */
  reset(): void {
    this.clear();
  }

  /**
   * Get cache statistics.
   */
  getStats(): {
    size: number;
    hits: number;
    misses: number;
    evictions: number;
    hitRate: number;
    keys: string[];
  } {
    const total = this.stats.hits + this.stats.misses;
    return {
      size: this.store.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      evictions: this.stats.evictions,
      hitRate: total > 0 ? Math.round((this.stats.hits / total) * 100) : 0,
      keys: Array.from(this.store.keys()),
    };
  }
}

/**
 * Specific cache for contributor data.
 */
export const contributorCache = new CacheStore<unknown>(5 * 60_000); // 5 minutes

/**
 * Specific cache for verification status.
 */
export const verificationCache = new CacheStore<unknown>(2 * 60_000); // 2 minutes

/**
 * Specific cache for statistics.
 */
export const statsCache = new CacheStore<unknown>(10 * 60_000); // 10 minutes

/**
 * Parse the CHECK_CACHE_TTL_MS environment variable.
 * Falls back to 2 minutes when unset or invalid.
 * Exposed so tests can verify the default without importing process.env directly.
 */
export function parseCheckCacheTtl(): number {
  const raw = process.env.CHECK_CACHE_TTL_MS;
  if (!raw) return 2 * 60_000;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 2 * 60_000;
}

/**
 * Parse the STATS_CACHE_TTL_MS environment variable.
 *
 * Controls how long the in-process `statsCache` retains a
 * `getDashboardStats()` result AND the `max-age` value emitted in the
 * `Cache-Control` header on `GET /api/stats` responses.
 *
 * Falls back to 60 seconds when unset or invalid.  60 s is deliberately
 * conservative — long enough to absorb repeated page loads and public CDN
 * requests, short enough that a new registration appears on the landing page
 * within a minute.
 *
 * Exposed so tests can verify the default without importing process.env directly.
 */
export function parseStatsCacheTtl(): number {
  const raw = process.env.STATS_CACHE_TTL_MS;
  if (!raw) return 60_000; // 60 seconds
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 60_000;
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP Cache-Control header builders
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a `Cache-Control` header value for public, read-only API responses
 * whose data is safe to cache by CDNs and browsers.
 *
 * - `public` — intermediary caches (CDNs, proxies) may store the response.
 * - `max-age` — freshness lifetime in **seconds** (converted from ttlMs).
 * - `stale-while-revalidate` — CDN/browser may serve a stale copy for an
 *   extra `swrSeconds` while it fetches a fresh one in the background.
 *   Defaults to the same duration as `max-age`, doubling the effective
 *   coverage before a hard miss is needed.
 *
 * Usage:
 * ```ts
 * headers: { "Cache-Control": buildPublicCacheControl(60_000) }
 * // → "public, max-age=60, stale-while-revalidate=60"
 * ```
 */
export function buildPublicCacheControl(
  ttlMs: number,
  swrMs: number = ttlMs,
): string {
  const maxAge = Math.floor(ttlMs / 1000);
  const swr = Math.floor(swrMs / 1000);
  return `public, max-age=${maxAge}, stale-while-revalidate=${swr}`;
}

/**
 * Build a `Cache-Control` header value for private, authenticated API
 * responses.  These must not be stored by shared caches (CDNs / proxies) but
 * may be reused by the requesting client within the freshness window.
 *
 * - `private` — only the end-user's browser/client may cache the response.
 * - `max-age` — freshness lifetime in **seconds** (converted from ttlMs).
 * - `must-revalidate` — expired entries must not be served stale; the client
 *   must re-validate with the server.
 *
 * Usage:
 * ```ts
 * headers: { "Cache-Control": buildPrivateCacheControl(30_000) }
 * // → "private, max-age=30, must-revalidate"
 * ```
 */
export function buildPrivateCacheControl(ttlMs: number): string {
  const maxAge = Math.floor(ttlMs / 1000);
  return `private, max-age=${maxAge}, must-revalidate`;
}

/**
 * Build a `Cache-Control` header that prevents all caching.
 * Used for mutating endpoints and responses that must always be fresh
 * (e.g. POST /api/register, GET /api/register for the current user's own data).
 */
export function buildNoCacheControl(): string {
  return "no-store, no-cache, must-revalidate";
}

/**
 * Build the full set of HTTP cache-related headers for stats API responses.
 *
 * Combines:
 * - `Cache-Control` — public caching directive with stale-while-revalidate.
 * - `CDN-Cache-Control` — Vercel/Cloudflare-specific override so the CDN edge
 *   can apply a different (shorter) TTL than the browser.
 * - `Vary: Accept-Encoding` — ensures compressed and uncompressed responses
 *   are stored separately.
 *
 * @param ttlMs   In-process cache TTL in milliseconds (also used as max-age).
 * @param swrMs   Stale-while-revalidate window in milliseconds. Defaults to
 *                half the TTL so CDNs aggressively revalidate.
 */
export function buildStatsCacheHeaders(
  ttlMs: number,
  swrMs: number = Math.floor(ttlMs / 2),
): Record<string, string> {
  return {
    "Cache-Control": buildPublicCacheControl(ttlMs, swrMs),
    "CDN-Cache-Control": buildPublicCacheControl(ttlMs, swrMs),
    "Vary": "Accept-Encoding",
  };
}

/**
 * Build HTTP cache headers for the wizard / action-lookup endpoint.
 *
 * The lookup result is address-specific but not user-specific, so it can be
 * publicly cached. A short TTL keeps validation fresh during the registration
 * wizard flow.
 *
 * @param ttlMs   Cache lifetime in milliseconds.
 */
export function buildLookupCacheHeaders(ttlMs: number): Record<string, string> {
  return {
    "Cache-Control": buildPublicCacheControl(ttlMs, ttlMs),
    "Vary": "Accept-Encoding",
  };
}

/**
 * Dedicated KV cache for /api/check responses.
 *
 * Keyed by `check:<address>:<assetCode>:<assetIssuer>` so the same address
 * checked against different assets never collides.  TTL is controlled by the
 * CHECK_CACHE_TTL_MS environment variable (default 2 minutes).
 *
 * Kept separate from verificationCache (used internally by horizon.ts) so the
 * two layers can have independent TTLs and can be invalidated independently in
 * tests and production flows.
 */
export const checkCache = new CacheStore<unknown>(parseCheckCacheTtl());

/**
 * Build cache key from function arguments.
 */
export function buildCacheKey(prefix: string, ...args: unknown[]): string {
  return `${prefix}:${args.map((a) => JSON.stringify(a)).join(':')}`;
}

/**
 * Invalidate contributor-related caches.
 */
export function invalidateContributorCaches(): void {
  contributorCache.invalidatePattern(/^contributor:/);
  verificationCache.invalidatePattern(/^verification:/);
  statsCache.invalidatePattern(/^stats:/);
}

/**
 * Parse the RECHECK_IDEMPOTENCY_TTL_MS environment variable.
 * Controls the idempotency window for batch and contributor rechecks (default 15 seconds).
 */
export function parseRecheckIdempotencyTtl(): number {
  const raw = process.env.RECHECK_IDEMPOTENCY_TTL_MS;
  if (!raw) return 15_000; // 15 seconds
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 15_000;
}

export interface RecheckLockEntry {
  jobId: string;
  createdAt: number;
}

/**
 * Dedicated cache for recheck idempotency locks to prevent double-click Horizon stampedes.
 */
export const recheckLockCache = new CacheStore<RecheckLockEntry>(parseRecheckIdempotencyTtl());

export function buildRecheckLockKey(scope: "batch" | "single", id: string = "all"): string {
  return `recheck:lock:${scope}:${id}`;
}
