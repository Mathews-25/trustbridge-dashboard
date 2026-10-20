import "server-only";

/**
 * Cursor-based pagination configuration
 */
export interface CursorPaginationOptions {
  /**
   * Base64-encoded cursor pointing to a record.
   * Typically the ID of the last record from the previous page.
   */
  cursor?: string;

  /**
   * Maximum number of records to return (default 50, max 100)
   */
  limit?: number;
}

/**
 * Response from a cursor-paginated query
 */
export interface CursorPaginationResult<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * Encodes a cursor value (typically an ID or timestamp) into base64
 */
export function encodeCursor(value: string): string {
  return Buffer.from(value, "utf-8").toString("base64");
}

/**
 * Decodes a base64 cursor back to its original value.
 * Returns null for empty input or strings that are not valid base64
 * (Buffer.from does not throw on invalid base64 — it silently produces garbage).
 */
export function decodeCursor(cursor: string): string | null {
  if (!cursor) return null;

  // Strict base64 alphabet check (standard encoding with optional padding).
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(cursor) || cursor.length % 4 !== 0) {
    return null;
  }

  try {
    const decoded = Buffer.from(cursor, "base64").toString("utf-8");
    // Round-trip via the same encoder we use for cursors — Node's Buffer
    // tolerates some malformed input and would otherwise return garbage.
    if (encodeCursor(decoded) !== cursor) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Validates and normalizes pagination options
 * @returns Validated options with cursor (if valid) and normalized limit
 */
export function validatePaginationOptions(
  options: CursorPaginationOptions
): { decodedCursor: string | null; limit: number } {
  const decodedCursor = options.cursor ? decodeCursor(options.cursor) : null;
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);

  return { decodedCursor, limit };
}

/**
 * Helper to build cursor pagination results
 * @param data Array of records from the current page
 * @param idAccessor Function to extract ID from each record
 * @param requestedLimit The requested page size
 * @returns Pagination result with nextCursor and hasMore flag
 */
export function buildCursorResult<T>(
  data: T[],
  idAccessor: (item: T) => string,
  requestedLimit: number
): CursorPaginationResult<T> {
  // Check if there are more records by fetching requestedLimit + 1
  const hasMore = data.length > requestedLimit;
  const pageData = data.slice(0, requestedLimit);
  const nextCursor = hasMore ? encodeCursor(idAccessor(pageData[pageData.length - 1])) : null;

  return {
    data: pageData,
    nextCursor,
    hasMore,
  };
}
