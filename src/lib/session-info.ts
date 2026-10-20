/**
 * Session visibility for the signed-in user (issue #148).
 *
 * TrustBridge runs NextAuth with `strategy: "jwt"`. That choice has a
 * consequence worth naming plainly rather than papering over: **there is no
 * server-side list of sessions.** A signed-in browser holds a self-contained,
 * signed token; the server verifies the signature on each request and keeps no
 * record that the token exists. Nothing can enumerate a user's other devices,
 * and nothing can remotely end a session on one, because there is no row to
 * delete.
 *
 * Prisma has `Account` and `Session` models (they ship with the NextAuth
 * adapter), but with a JWT strategy the adapter never writes session rows, so
 * reading them would produce an authoritative-looking empty list — worse than
 * showing nothing.
 *
 * What can be told truthfully is what this module computes: when the current
 * token was issued, when it expires, and how much of its life is left. See
 * `docs/SESSIONS.md` for the limits and what it would take to lift them.
 */

/** Seconds a session token stays valid. NextAuth's default is 30 days. */
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export type SessionStrategy = "jwt" | "database";

export interface SessionInfo {
  /** Always "jwt" for this deployment. Surfaced so the UI can be honest. */
  strategy: SessionStrategy;
  /** ISO 8601 instant the token was issued, or null if the claim is absent. */
  issuedAt: string | null;
  /** ISO 8601 instant the token stops being accepted. */
  expiresAt: string | null;
  /** Whole seconds until expiry; 0 once expired. */
  expiresInSeconds: number | null;
  /** Configured token lifetime, so the UI can state it without guessing. */
  maxAgeSeconds: number;
  /**
   * Whether other sessions can be listed. Always false under JWT — the UI
   * reads this rather than hardcoding an assumption that would silently go
   * stale if the strategy ever changed.
   */
  canListOtherSessions: boolean;
  /**
   * Whether signing out here ends sessions on other devices. Always false
   * under JWT: `signOut()` clears this browser's cookie and nothing else.
   */
  signOutEndsAllSessions: boolean;
}

/** Numeric JWT claims, in seconds since the epoch. */
export interface SessionTokenClaims {
  iat?: unknown;
  exp?: unknown;
}

function toSeconds(claim: unknown): number | null {
  return typeof claim === "number" && Number.isFinite(claim) ? claim : null;
}

function toIso(seconds: number | null): string | null {
  return seconds === null ? null : new Date(seconds * 1000).toISOString();
}

/**
 * Describe the current session from its JWT claims.
 *
 * Deliberately takes only `iat` and `exp`. The token also carries the user id,
 * GitHub handle, maintainer flag and role — none of which this endpoint needs,
 * and all of which the client already has from the session. No access token is
 * read, and no IP address, user agent or location is recorded: a "device list"
 * built from those would be new PII collected to power a feature that cannot
 * work here anyway.
 */
export function buildSessionInfo(
  claims: SessionTokenClaims | null,
  now: Date = new Date(),
  maxAgeSeconds: number = SESSION_MAX_AGE_SECONDS
): SessionInfo {
  const iat = toSeconds(claims?.iat);
  const explicitExp = toSeconds(claims?.exp);

  // Fall back to issued-at plus the configured lifetime when `exp` is absent.
  const exp = explicitExp ?? (iat === null ? null : iat + maxAgeSeconds);

  const expiresInSeconds =
    exp === null ? null : Math.max(0, Math.floor(exp - now.getTime() / 1000));

  return {
    strategy: "jwt",
    issuedAt: toIso(iat),
    expiresAt: toIso(exp),
    expiresInSeconds,
    maxAgeSeconds,
    canListOtherSessions: false,
    signOutEndsAllSessions: false,
  };
}

/** Whole days, hours and minutes left — for "Expires in 29 days, 4 hours". */
export function describeRemaining(seconds: number | null): string {
  if (seconds === null) return "Unknown";
  if (seconds <= 0) return "Expired";

  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);

  if (days > 0) {
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  }
  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  return `${Math.max(1, minutes)}m`;
}
