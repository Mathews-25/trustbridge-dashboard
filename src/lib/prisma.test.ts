import { describe, expect, it, vi } from "vitest";
import { redactParams, logSlowQuery } from "./prisma";

describe("Prisma Slow Query Middleware & Parameter Redaction (#205)", () => {
  it("redacts sensitive G-addresses, tokens, and code hashes", () => {
    const raw = JSON.stringify({
      stellarAddress: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFXYTBW2XM322VQGY5WSC",
      accessToken: "secret-github-token",
      token: "secret-session-token",
      codeHash: "hash-12345",
    });

    const redacted = redactParams(raw);

    expect(redacted).not.toContain("GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFXYTBW2XM322VQGY5WSC");
    expect(redacted).not.toContain("secret-github-token");
    expect(redacted).not.toContain("secret-session-token");
    expect(redacted).not.toContain("hash-12345");
    expect(redacted).toContain('"accessToken":"[REDACTED]"');
  });

  it("logs slow queries exceeding threshold and ignores fast queries", () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const loggedFast = logSlowQuery("User", "findUnique", 50, '{"id":"1"}', 200);
    expect(loggedFast).toBe(false);
    expect(consoleSpy).not.toHaveBeenCalled();

    const loggedSlow = logSlowQuery("Registration", "findMany", 350, '{"accessToken":"secret"}', 200);
    expect(loggedSlow).toBe(true);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[SLOW_QUERY] Prisma query Registration.findMany took 350ms")
    );

    consoleSpy.mockRestore();
  });
});
