/**
 * Authenticated maintenance mode (issue #202).
 *
 * When maintenance mode is on:
 *   - a banner is shown on every page (see src/components/MaintenanceBanner.tsx)
 *   - mutating API requests (POST/PUT/PATCH/DELETE) get a 503 from the
 *     middleware, except for the bypass prefixes below
 *   - reads (GET/HEAD) keep working
 *   - GET /api/health keeps returning 200 (see docs/DEPLOYMENT.md)
 *
 * The kill switch is the `MAINTENANCE` env var. It is intentionally env-only so
 * a broken database can never lock maintainers out of turning it back off. The
 * `maintenance_mode` feature flag is an additional, DB-backed toggle for
 * operators who have the DB flag source enabled.
 *
 * This module has NO `server-only` import and NO Prisma import at the top level
 * so the synchronous helpers can run inside the Edge middleware runtime.
 */

const TRUTHY = new Set(["1", "true", "on", "yes", "enabled"]);

/** Edge-safe: env var only, no database. Used by the middleware. */
export function isMaintenanceModeFromEnv(): boolean {
  const raw = process.env.MAINTENANCE?.trim().toLowerCase();
  return raw ? TRUTHY.has(raw) : false;
}

export function getMaintenanceMessage(): string {
  return (
    process.env.MAINTENANCE_MESSAGE?.trim() ||
    "TrustBridge is in maintenance mode. Reads are available; changes are temporarily disabled."
  );
}

/**
 * Path prefixes that keep accepting requests during maintenance even when the
 * method is mutating:
 *   - `/api/auth`     — NextAuth callbacks must keep working
 *   - `/api/webhooks` — GitHub / trustbridge-action deliveries are retried a
 *                       limited number of times; dropping them loses data
 *   - `/api/health`   — probes
 *   - `/api/check`    — a pure Horizon read that uses POST only to keep the
 *                       G-address out of the URL / logs; it is on the critical
 *                       registration path, so treat it as a read
 *
 * Scheduled jobs (cron) are not routed through the middleware and continue to
 * run; document any that must be paused separately. See docs/DEPLOYMENT.md.
 */
export const MAINTENANCE_BYPASS_PREFIXES = [
  "/api/auth",
  "/api/webhooks",
  "/api/health",
  "/api/check",
] as const;

export function isMaintenanceBypassPath(pathname: string): boolean {
  return MAINTENANCE_BYPASS_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function isMutatingMethod(method: string | undefined): boolean {
  return method ? MUTATING_METHODS.has(method.toUpperCase()) : false;
}

/**
 * Whether the middleware should reject this request with a 503.
 * True only for mutating API requests that are not on a bypass prefix.
 */
export function shouldBlockForMaintenance(
  method: string | undefined,
  pathname: string,
): boolean {
  if (!isMaintenanceModeFromEnv()) return false;
  if (!pathname.startsWith("/api")) return false;
  if (!isMutatingMethod(method)) return false;
  if (isMaintenanceBypassPath(pathname)) return false;
  return true;
}

/**
 * Node-runtime check that also consults the `maintenance_mode` feature flag.
 * Used by the banner / server components. The dynamic import keeps the
 * `server-only` feature-flags module (and Prisma) out of the Edge bundle.
 */
export async function isMaintenanceMode(): Promise<boolean> {
  if (isMaintenanceModeFromEnv()) return true;
  try {
    const { isFeatureEnabled } = await import("@/lib/feature-flags");
    return await isFeatureEnabled("maintenance_mode");
  } catch {
    return false;
  }
}
