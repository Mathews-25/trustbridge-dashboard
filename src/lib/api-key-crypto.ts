import "server-only";

import { createHash, randomBytes } from "node:crypto";

/** Prefix makes keys easy to identify in logs / secret scanners. */
const KEY_PREFIX = "tb_";

/**
 * Generate a cryptographically random API key.
 *
 * The raw value is returned ONCE to the caller and must NEVER be stored.
 * Only the SHA-256 hex digest (`hashApiKey(raw)`) is persisted.
 *
 * Format: `tb_<43 url-safe base64 chars>` (~258 bits of entropy).
 */
export function generateApiKey(): string {
  return KEY_PREFIX + randomBytes(32).toString("base64url");
}

/**
 * SHA-256 hex digest of a raw API key. Use this for DB storage and lookup.
 * Constant-time comparison is handled by the DB unique lookup, so a plain
 * digest is sufficient here (unlike password hashing, keys are long enough
 * that pre-image resistance is the only requirement).
 */
export function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

/**
 * Return true when the candidate string has the expected prefix and minimum
 * length. Rejects obviously malformed values before the DB round-trip.
 */
export function isValidApiKeyFormat(candidate: string): boolean {
  return (
    typeof candidate === "string" &&
    candidate.startsWith(KEY_PREFIX) &&
    candidate.length >= 10
  );
}
