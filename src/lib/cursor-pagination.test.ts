import { describe, expect, it } from "vitest";

import {
  encodeCursor,
  decodeCursor,
  validatePaginationOptions,
  buildCursorResult,
} from "@/lib/cursor-pagination";

describe("Cursor Pagination", () => {
  describe("encodeCursor and decodeCursor", () => {
    it("encodes and decodes cursor values correctly", () => {
      const original = "reg-123";
      const encoded = encodeCursor(original);

      expect(encoded).not.toBe(original);
      expect(encoded).toMatch(/^[A-Za-z0-9+/=]+$/); // base64 pattern

      const decoded = decodeCursor(encoded);
      expect(decoded).toBe(original);
    });

    it("handles special characters in cursors", () => {
      const original = "user-abc_123-xyz";
      const encoded = encodeCursor(original);
      const decoded = decodeCursor(encoded);

      expect(decoded).toBe(original);
    });

    it("returns null for invalid base64 cursor", () => {
      const invalidCursor = "!!!invalid!!!";
      const decoded = decodeCursor(invalidCursor);

      expect(decoded).toBeNull();
    });
  });

  describe("validatePaginationOptions", () => {
    it("uses default limit of 50 when not provided", () => {
      const result = validatePaginationOptions({});

      expect(result.limit).toBe(50);
      expect(result.decodedCursor).toBeNull();
    });

    it("uses provided limit within bounds", () => {
      const result = validatePaginationOptions({ limit: 25 });

      expect(result.limit).toBe(25);
    });

    it("enforces maximum limit of 100", () => {
      const result = validatePaginationOptions({ limit: 500 });

      expect(result.limit).toBe(100);
    });

    it("enforces minimum limit of 1", () => {
      const result = validatePaginationOptions({ limit: 0 });

      expect(result.limit).toBe(1);
    });

    it("decodes provided cursor", () => {
      const original = "reg-123";
      const encoded = encodeCursor(original);
      const result = validatePaginationOptions({ cursor: encoded });

      expect(result.decodedCursor).toBe(original);
    });

    it("returns null for invalid cursor during validation", () => {
      const result = validatePaginationOptions({ cursor: "!!!invalid!!!" });

      expect(result.decodedCursor).toBeNull();
    });
  });

  describe("buildCursorResult", () => {
    it("returns data with nextCursor when more records exist", () => {
      const data = [
        { id: "1", name: "Alice" },
        { id: "2", name: "Bob" },
        { id: "3", name: "Charlie" },
      ];

      const result = buildCursorResult(data, (item) => item.id, 2);

      expect(result.data).toHaveLength(2);
      expect(result.data[0].id).toBe("1");
      expect(result.data[1].id).toBe("2");
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).not.toBeNull();
      expect(decodeCursor(result.nextCursor!)).toBe("2");
    });

    it("returns data without nextCursor when no more records", () => {
      const data = [
        { id: "1", name: "Alice" },
        { id: "2", name: "Bob" },
      ];

      const result = buildCursorResult(data, (item) => item.id, 2);

      expect(result.data).toHaveLength(2);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });

    it("handles single record correctly", () => {
      const data = [{ id: "1", name: "Alice" }];

      const result = buildCursorResult(data, (item) => item.id, 10);

      expect(result.data).toHaveLength(1);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });

    it("respects requested limit when building result", () => {
      const data = Array.from({ length: 20 }, (_, i) => ({
        id: `${i + 1}`,
        name: `User ${i + 1}`,
      }));

      const result = buildCursorResult(data, (item) => item.id, 10);

      expect(result.data).toHaveLength(10);
      expect(result.hasMore).toBe(true);
      expect(result.data[result.data.length - 1].id).toBe("10");
    });
  });
});
