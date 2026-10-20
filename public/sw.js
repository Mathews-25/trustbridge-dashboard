/**
 * TrustBridge Dashboard — Minimal Shell Service Worker
 *
 * Strategy: cache-first for static shell assets only.
 *
 * SECURITY INVARIANTS (do not relax without a security review):
 *   1. /api/*            — NEVER cached. Always network-only.
 *                          Caching API responses would serve stale contributor
 *                          PII (Stellar addresses, readiness status) to users
 *                          after data changes and across session boundaries.
 *   2. /api/auth/*       — NEVER cached. Session cookies must always hit the
 *                          origin so NextAuth can validate them.
 *   3. POST/PUT/DELETE   — NEVER cached. Mutating requests always go to network.
 *   4. Opaque responses  — NEVER cached. Cross-origin responses that cannot be
 *                          inspected could silently cache error pages or partial
 *                          data. We only cache same-origin, status-200 responses.
 *
 * What IS cached (shell only):
 *   - Next.js static chunks under /_next/static/
 *   - The root document / (for add-to-homescreen offline splash)
 *   - /manifest.json
 *   - /favicon.ico
 *
 * Cache invalidation: a new CACHE_NAME version string causes install to populate
 * a fresh cache; activate deletes all old caches. Old caches never serve stale
 * shell assets after a deploy.
 */

const CACHE_NAME = "trustbridge-shell-v1";

/**
 * Assets pre-cached on install. These are the minimum set needed to display
 * the app shell offline. Do NOT add any /api/* paths here.
 */
const SHELL_ASSETS = ["/", "/manifest.json", "/favicon.ico"];

/**
 * Returns true for any request that must always go to the network.
 * This is the security boundary — widen it, never narrow it.
 */
function isNetworkOnly(request) {
  const url = new URL(request.url);

  // Only intercept same-origin requests
  if (url.origin !== self.location.origin) {
    return true; // let the browser handle cross-origin (no caching)
  }

  // API routes — NEVER cache (PII, auth, live Horizon data)
  if (url.pathname.startsWith("/api/")) {
    return true;
  }

  // Only cache GET/HEAD — never mutating methods
  if (request.method !== "GET" && request.method !== "HEAD") {
    return true;
  }

  return false;
}

/**
 * Returns true for paths that belong to the shell and are safe to cache.
 */
function isShellAsset(url) {
  return (
    url.pathname === "/" ||
    url.pathname === "/manifest.json" ||
    url.pathname === "/favicon.ico" ||
    url.pathname.startsWith("/_next/static/")
  );
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ─── Fetch strategy ───────────────────────────────────────────────────────────

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Security: never intercept network-only requests
  if (isNetworkOnly(request)) {
    return; // fall through to browser default (always network)
  }

  const url = new URL(request.url);

  if (isShellAsset(url)) {
    // Cache-first for shell assets: fast load, falls back to network on miss
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          return cached;
        }
        return fetch(request).then((response) => {
          // Only cache valid same-origin, non-opaque responses
          if (
            response &&
            response.status === 200 &&
            response.type === "basic"
          ) {
            const toCache = response.clone();
            caches
              .open(CACHE_NAME)
              .then((cache) => cache.put(request, toCache));
          }
          return response;
        });
      })
    );
    return;
  }

  // All other same-origin requests (page routes, fonts, etc.): network-first
  // so live content is always preferred, but cached shell can serve as fallback.
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});
