import { describe, expect, it } from "vitest";

import { isValidGAddress, normalizeGAddress } from "@/lib/stellar-address";

describe("stellar-address", () => {
  // Checksum-valid Ed25519 G-address (StrKey.isValidEd25519PublicKey)
  const VALID =
    "GDXNXL25GDM3N5LAR5FALA3VSGHFET3EOKLXRP3ITPPMR3PISTQSKSFS";

  it("accepts a checksum-valid G-address", () => {
    expect(isValidGAddress(VALID)).toBe(true);
    expect(isValidGAddress(`  ${VALID}  `)).toBe(true);
  });

  it("rejects empty, short, or checksum-invalid addresses", () => {
    expect(isValidGAddress("")).toBe(false);
    expect(isValidGAddress("GABC")).toBe(false);
    // Same length/charset but wrong checksum — must not QR this.
    expect(
      isValidGAddress("GDXNXL25GDM3N5LAR5FALA3VSGHFET3EOKLXRP3ITPPMR3PISTQSKSFA")
    ).toBe(false);
    expect(isValidGAddress("S" + VALID.slice(1))).toBe(false);
  });

  it("normalizes whitespace", () => {
    expect(normalizeGAddress(`  ${VALID}\n`)).toBe(VALID);
  });
});
