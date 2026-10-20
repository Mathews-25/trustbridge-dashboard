import { afterEach, describe, expect, it } from "vitest";

import { getRegistryMode } from "@/lib/registry-mode";

describe("getRegistryMode", () => {
  afterEach(() => {
    delete process.env.REGISTRY_MODE;
  });

  it("defaults to 'live' when unset", () => {
    expect(getRegistryMode()).toBe("live");
  });

  it("returns 'synced' when explicitly configured", () => {
    process.env.REGISTRY_MODE = "synced";
    expect(getRegistryMode()).toBe("synced");
  });

  it("is case-insensitive and trims whitespace", () => {
    process.env.REGISTRY_MODE = "  SYNCED  ";
    expect(getRegistryMode()).toBe("synced");
  });

  it("falls back to 'live' for an unrecognized value instead of failing", () => {
    process.env.REGISTRY_MODE = "bogus";
    expect(getRegistryMode()).toBe("live");
  });
});
