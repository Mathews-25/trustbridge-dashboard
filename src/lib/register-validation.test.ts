import { describe, it, expect } from "vitest";
import { validateRegistrationInput } from "@/lib/register-validation";

describe("validateRegistrationInput", () => {
  // Checksum-valid Ed25519 G-address (StrKey.isValidEd25519PublicKey)
  const VALID_G_ADDRESS =
    "GDXNXL25GDM3N5LAR5FALA3VSGHFET3EOKLXRP3ITPPMR3PISTQSKSFS";

  it("accepts valid Stellar G-address", () => {
    const errors = validateRegistrationInput({
      stellarAddress: VALID_G_ADDRESS,
    });
    expect(errors).toHaveLength(0);
  });

  it("rejects missing address", () => {
    const errors = validateRegistrationInput({ stellarAddress: "" });
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe("stellarAddress");
    expect(errors[0].message).toContain("required");
  });

  it("rejects undefined address", () => {
    const errors = validateRegistrationInput({ stellarAddress: undefined });
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("required");
  });

  it("rejects whitespace-only address", () => {
    const errors = validateRegistrationInput({ stellarAddress: "   " });
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("required");
  });

  it("rejects non-string address", () => {
    const errors = validateRegistrationInput({
      stellarAddress: 12345 as unknown as string,
    });
    expect(errors).toHaveLength(1);
  });

  it("rejects address not starting with G", () => {
    const errors = validateRegistrationInput({
      stellarAddress: "SBSX7U7ARH74ENSCCX7FYTA5FS2YQXZHY737IBSZEOF72ULMITMZNKQ",
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.message.includes("start with"))).toBe(true);
  });

  it("rejects address with incorrect length", () => {
    const errors = validateRegistrationInput({
      stellarAddress: "GBSX7U7ARH74ENSCCX7FYTA5FS2YQXZHY737IBSZEOF72ULMI",
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.message.includes("56 characters"))).toBe(true);
  });

  it("trims whitespace before validation", () => {
    const errors = validateRegistrationInput({
      stellarAddress: `  ${VALID_G_ADDRESS}  `,
    });
    expect(errors).toHaveLength(0);
  });
});
