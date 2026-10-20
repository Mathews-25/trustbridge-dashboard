/**
 * Issue #146 — error mapping for optimistic register saves.
 */

import { describe, expect, it } from "vitest";

import { mapRegisterError } from "@/lib/register-error";

describe("mapRegisterError", () => {
  describe("409 — address already taken", () => {
    it("maps the ADDRESS_TAKEN code", () => {
      const failure = mapRegisterError(409, {
        error: "This Stellar address is already registered to another user",
        code: "ADDRESS_TAKEN",
      });

      expect(failure.kind).toBe("address_taken");
      expect(failure.requiresSignIn).toBe(false);
    });

    it("maps a bare 409 with no code (older server)", () => {
      expect(mapRegisterError(409).kind).toBe("address_taken");
    });

    it("prefers the server's wording when present", () => {
      const failure = mapRegisterError(409, {
        error: "This Stellar address is already registered to another user",
        code: "ADDRESS_TAKEN",
      });

      expect(failure.message).toBe(
        "This Stellar address is already registered to another user"
      );
    });

    it("falls back to actionable copy when the server sends none", () => {
      const failure = mapRegisterError(409, { code: "ADDRESS_TAKEN" });

      expect(failure.message).toMatch(/different wallet address/i);
      expect(failure.message).not.toMatch(/409|conflict|constraint/i);
    });

    it("clears the address so the contributor tries a different wallet", () => {
      // Keeping a known-taken address in the form invites the same failure.
      expect(mapRegisterError(409).keepAddress).toBe(false);
    });
  });

  describe("401 — expired session", () => {
    it("is never confused with a 409", () => {
      // The two failures are the same shape from the form's point of view and
      // completely different from the contributor's.
      const unauthorized = mapRegisterError(401, { code: "UNAUTHORIZED" });
      const conflict = mapRegisterError(409, { code: "ADDRESS_TAKEN" });

      expect(unauthorized.kind).toBe("unauthorized");
      expect(conflict.kind).toBe("address_taken");
      expect(unauthorized.requiresSignIn).toBe(true);
      expect(conflict.requiresSignIn).toBe(false);
    });

    it("keeps the typed address — it was the session that failed", () => {
      expect(mapRegisterError(401, { code: "UNAUTHORIZED" }).keepAddress).toBe(
        true
      );
    });

    it("tells the contributor nothing was saved", () => {
      expect(mapRegisterError(401).message).toMatch(/not saved/i);
    });
  });

  describe("403 — blocked origin", () => {
    it("maps to a reload instruction", () => {
      const failure = mapRegisterError(403, { code: "FORBIDDEN_ORIGIN" });

      expect(failure.kind).toBe("forbidden");
      expect(failure.message).toMatch(/reload/i);
      expect(failure.requiresSignIn).toBe(false);
    });
  });

  describe("400 — validation", () => {
    it("surfaces the field-level message from the server", () => {
      const failure = mapRegisterError(400, {
        error: "Invalid Stellar G-address format",
        code: "VALIDATION_FAILED",
        validationErrors: [
          { field: "stellarAddress", message: "Invalid Stellar G-address format" },
        ],
      });

      expect(failure.kind).toBe("validation");
      expect(failure.message).toBe("Invalid Stellar G-address format");
      expect(failure.keepAddress).toBe(true);
    });
  });

  describe("network and server failures", () => {
    it("treats status 0 as a network failure", () => {
      const failure = mapRegisterError(0);

      expect(failure.kind).toBe("network");
      expect(failure.message).toMatch(/nothing was saved/i);
    });

    it("maps 500 to a retryable server failure", () => {
      const failure = mapRegisterError(500, {
        error: "Failed to save registration",
        code: "SERVER_ERROR",
      });

      expect(failure.kind).toBe("server");
      expect(failure.keepAddress).toBe(true);
    });

    it("maps an unknown status without throwing", () => {
      expect(mapRegisterError(418).kind).toBe("server");
    });
  });

  describe("code wins over status", () => {
    it("trusts ADDRESS_TAKEN even behind a proxy that rewrote the status", () => {
      expect(mapRegisterError(500, { code: "ADDRESS_TAKEN" }).kind).toBe(
        "address_taken"
      );
    });
  });

  describe("message hygiene", () => {
    it.each([0, 400, 401, 403, 409, 500])(
      "status %s produces a non-empty message",
      (status) => {
        const failure = mapRegisterError(status);
        expect(failure.message.trim().length).toBeGreaterThan(0);
      }
    );

    it("ignores a blank server message", () => {
      const failure = mapRegisterError(500, { error: "   " });
      expect(failure.message.trim().length).toBeGreaterThan(0);
    });
  });
});
