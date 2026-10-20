import { describe, it, expect } from "vitest";

/**
 * Pure unit tests for the profile privacy coercion rules:
 * - showStellarAddress must be false when profilePublic is false
 * - showStellarAddress can be true only when profilePublic is true
 */
function coercePrivacy(profilePublic: boolean, showStellarAddress: boolean) {
  return {
    profilePublic,
    showStellarAddress: profilePublic ? showStellarAddress : false,
  };
}

describe("profile privacy coercion", () => {
  it("allows public profile with hidden address", () => {
    expect(coercePrivacy(true, false)).toEqual({
      profilePublic: true,
      showStellarAddress: false,
    });
  });

  it("allows public profile with visible address", () => {
    expect(coercePrivacy(true, true)).toEqual({
      profilePublic: true,
      showStellarAddress: true,
    });
  });

  it("forces showStellarAddress=false when profilePublic=false", () => {
    expect(coercePrivacy(false, true)).toEqual({
      profilePublic: false,
      showStellarAddress: false,
    });
  });

  it("private profile with hidden address is a no-op", () => {
    expect(coercePrivacy(false, false)).toEqual({
      profilePublic: false,
      showStellarAddress: false,
    });
  });
});
