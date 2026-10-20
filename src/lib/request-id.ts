/**
 * Request ID utilities.
 *
 * Generates and parses opaque, non-sequential request identifiers that can
 * safely appear in UI error messages and structured logs without leaking any
 * session or authentication state.
 *
 * Format: standard UUID v4 (RFC 4122) via the Web Crypto `randomUUID()` API,
 * which is available in Node 19+, Edge Runtime, and all modern browsers.
 * Falls back to a manual crypto.getRandomValues() construction for older
 * Node versions (18.x) where `randomUUID` may not be present on the global
 * `crypto` object in some environments.
 */

/**
 * Generate a new request ID.
 * Safe to call in both Node.js API routes and Edge middleware.
 */
export function generateRequestId(): string {
  // crypto.randomUUID is available in Node 14.17+ via `require('crypto')`
  // and in Node 19+ on the global `crypto`. Next.js middleware runs in the
  // Edge Runtime where `crypto.randomUUID` is always available globally.
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  // Fallback: build a v4 UUID manually using getRandomValues.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  // Set version bits (4) and variant bits (RFC 4122)
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Validate that a string looks like a well-formed UUID v4.
 * Used to sanity-check values read from headers before including them in logs.
 */
export function isValidRequestId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

/**
 * Extract the request ID from a Headers object (or Map-like header store).
 * Returns null if the header is absent or malformed.
 */
export function extractRequestId(
  headers: { get(name: string): string | null }
): string | null {
  const value = headers.get("x-request-id");
  if (!value) return null;
  return isValidRequestId(value) ? value : null;
}
