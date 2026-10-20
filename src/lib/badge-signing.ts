import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Resolves secret key for HMAC badge signing.
 * Prefers BADGE_SIGNING_KEY, falls back to NEXTAUTH_SECRET, TOKEN_ENCRYPTION_KEY,
 * or a development fallback key.
 */
export function getBadgeSigningKey(): string {
  const key =
    process.env.BADGE_SIGNING_KEY?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    process.env.TOKEN_ENCRYPTION_KEY?.trim();

  if (key) return key;

  if (process.env.NODE_ENV === "production") {
    throw new Error("BADGE_SIGNING_KEY or NEXTAUTH_SECRET must be configured in production");
  }

  return "trustbridge-badge-secret-dev";
}

/**
 * Computes an HMAC-SHA256 signature for a badge request.
 *
 * @param username - GitHub username (case-sensitive as stored)
 * @param expiresAt - Optional UNIX timestamp in seconds when signature expires
 * @returns 64-character hex HMAC string
 */
export function signBadge(username: string, expiresAt?: number): string {
  const secret = getBadgeSigningKey();
  const payload = `${username}:${expiresAt ?? 0}`;
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Verifies an HMAC-SHA256 signature for a badge request in constant time.
 *
 * @param username - GitHub username
 * @param sig - 64-character hex signature from query string
 * @param expiresAt - Optional UNIX timestamp in seconds when signature expires
 * @returns true if signature is valid and timestamp has not expired; false otherwise.
 */
export function verifyBadgeSignature(
  username: string,
  sig: string | null | undefined,
  expiresAt?: number
): boolean {
  if (!sig || typeof sig !== "string" || sig.length !== 64) {
    return false;
  }

  // Check expiration if provided
  if (expiresAt !== undefined && !Number.isNaN(expiresAt) && expiresAt > 0) {
    const nowInSeconds = Math.floor(Date.now() / 1000);
    if (nowInSeconds > expiresAt) {
      return false;
    }
  }

  const expectedSig = signBadge(username, expiresAt);

  try {
    const bufSig = Buffer.from(sig, "hex");
    const bufExpected = Buffer.from(expectedSig, "hex");

    if (bufSig.length !== bufExpected.length) {
      return false;
    }

    return timingSafeEqual(bufSig, bufExpected);
  } catch {
    return false;
  }
}

export interface GenerateBadgeUrlOptions {
  baseUrl?: string;
  expiresInSeconds?: number;
}

/**
 * Helper to construct a signed badge URL for a contributor.
 *
 * @param username - GitHub username
 * @param options - Base URL and optional duration in seconds before signature expires
 * @returns Full or relative signed badge URL
 */
export function generateBadgeUrl(
  username: string,
  options: GenerateBadgeUrlOptions = {}
): string {
  const { baseUrl = "", expiresInSeconds } = options;

  let expiresAt: number | undefined;
  if (expiresInSeconds && expiresInSeconds > 0) {
    expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;
  }

  const sig = signBadge(username, expiresAt);
  const searchParams = new URLSearchParams({ sig });

  if (expiresAt !== undefined) {
    searchParams.set("exp", expiresAt.toString());
  }

  const path = `/api/badge/${encodeURIComponent(username)}?${searchParams.toString()}`;
  return baseUrl ? `${baseUrl.replace(/\/$/, "")}${path}` : path;
}
