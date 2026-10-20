import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateStellarAddress } from "@/lib/registration-action";
import { checkStellarAddress } from "@/lib/horizon";

vi.mock("@/lib/auth");
vi.mock("@/lib/prisma");
vi.mock("@/lib/horizon");

describe("validateStellarAddress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkStellarAddress).mockResolvedValue({
      funded: true,
      trustline: true,
      trustline_authorized: true,
      xlm_balance: "5",
      spendable_xlm_balance: "4",
      errors: [],
      readiness: "ready",
      verified: true,
    } as never);
  });

  it("returns error for empty address", async () => {
    const result = await validateStellarAddress("");
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Address is required");
  });

  it("returns error for invalid Stellar address", async () => {
    const result = await validateStellarAddress("invalid-address");
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "Invalid Stellar public key (must be a valid G-address)"
    );
  });

  it("handles whitespace in address", async () => {
    const result = await validateStellarAddress(
      "  GDXNXL25GDM3N5LAR5FALA3VSGHFET3EOKLXRP3ITPPMR3PISTQSKSFS  "
    );
    // The validation should normalize the whitespace
    expect(result).toBeDefined();
    expect(result.valid).toBe(true);
  });

  it("returns null readiness for invalid addresses", async () => {
    const result = await validateStellarAddress("bad-address");
    expect(result.readiness).toBeNull();
    expect(result.valid).toBe(false);
  });
});
