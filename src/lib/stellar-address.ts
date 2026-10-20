import { StrKey } from "stellar-sdk";

/**
 * Client-safe Stellar G-address check (StrKey checksum).
 * Prefer this over format-only regex so we never QR or copy-confirm garbage.
 */
export function isValidGAddress(address: string): boolean {
  const trimmed = address.trim();
  if (!trimmed) return false;
  try {
    return StrKey.isValidEd25519PublicKey(trimmed);
  } catch {
    return false;
  }
}

export function normalizeGAddress(address: string): string {
  return address.trim();
}
