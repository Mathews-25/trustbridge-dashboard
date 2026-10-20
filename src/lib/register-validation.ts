import "server-only";

import { isValidStellarAddress } from "@/lib/stellar";

export interface RegistrationValidationError {
  field: string;
  message: string;
}

export interface RegistrationInput {
  stellarAddress?: unknown;
}

/**
 * Validates registration form input.
 * Returns an array of validation errors, empty if input is valid.
 */
export function validateRegistrationInput(
  input: RegistrationInput
): RegistrationValidationError[] {
  const errors: RegistrationValidationError[] = [];

  // Validate stellar address is provided
  if (
    typeof input.stellarAddress !== "string" ||
    !input.stellarAddress.trim()
  ) {
    errors.push({
      field: "stellarAddress",
      message: "Stellar address is required",
    });
    return errors; // Early exit since other validations depend on address existing
  }

  const address = input.stellarAddress.trim();

  // Validate address format
  if (!isValidStellarAddress(address)) {
    errors.push({
      field: "stellarAddress",
      message: "Invalid Stellar G-address format",
    });
  }

  // Validate address length (Stellar public keys are 56 characters)
  if (address.length !== 56) {
    errors.push({
      field: "stellarAddress",
      message: "Stellar address must be exactly 56 characters",
    });
  }

  // Validate address starts with G (Stellar public key prefix)
  if (!address.startsWith("G")) {
    errors.push({
      field: "stellarAddress",
      message: "Stellar address must start with 'G'",
    });
  }

  return errors;
}
