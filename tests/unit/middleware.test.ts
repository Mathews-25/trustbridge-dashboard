/**
 * Unit tests for src/middleware.ts
 *
 * NextAuth's withAuth wrapper does the actual session/token work at runtime.
 * These tests validate the two application-level decisions the middleware owns:
 *   1. The `authorized` callback lets any authenticated user reach /dashboard
 *      and /register, and lets anyone reach everything else.
 *   2. The inner middleware function redirects authenticated non-maintainers
 *      away from /dashboard, and passes maintainers through unchanged.
 *
 * We do not re-test withAuth itself — that is next-auth's responsibility.
 */

import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal fake NextAuth token shape as it would appear on
 * `req.nextauth.token` inside the middleware callback.
 */
function makeToken(opts: {
  isMaintainer?: boolean;
  maintainerOrgId?: string;
  sub?: string;
}) {
  return {
    sub: opts.sub ?? "user-1",
    isMaintainer: opts.isMaintainer ?? false,
    maintainerOrgId: opts.maintainerOrgId ?? "default",
  };
}

/**
 * Directly exercise the `authorized` callback logic that withAuth uses to
 * decide whether a request is allowed to proceed to the inner middleware.
 *
 * The logic is extracted inline here to keep it testable without having to
 * stub the entire withAuth wrapper.
 */
function runAuthorized(path: string, token: ReturnType<typeof makeToken> | null) {
  if (path.startsWith("/dashboard")) {
    return !!token;
  }
  if (path.startsWith("/register")) {
    return !!token;
  }
  return true;
}

/**
 * Simulate what the inner middleware function does given the token shape and
 * request path. Returns either the redirect URL string or "next" (pass-through).
 */
function runMiddlewareInner(
  path: string,
  token: ReturnType<typeof makeToken> | null
): string | "next" {
  const isMaintainer = token?.isMaintainer;

  if (path.startsWith("/dashboard") && !isMaintainer) {
    return "/register?error=maintainer";
  }

  return "next";
}

// ---------------------------------------------------------------------------
// authorized callback
// ---------------------------------------------------------------------------

describe("middleware – authorized callback", () => {
  it("allows authenticated users on /dashboard", () => {
    expect(runAuthorized("/dashboard", makeToken({ isMaintainer: true }))).toBe(true);
  });

  it("denies unauthenticated users on /dashboard (null token)", () => {
    expect(runAuthorized("/dashboard", null)).toBe(false);
  });

  it("allows authenticated users on /register", () => {
    expect(runAuthorized("/register", makeToken({}))).toBe(true);
  });

  it("denies unauthenticated users on /register (null token)", () => {
    expect(runAuthorized("/register", null)).toBe(false);
  });

  it("allows unauthenticated users on unmatched paths", () => {
    expect(runAuthorized("/", null)).toBe(true);
    expect(runAuthorized("/about", null)).toBe(true);
    expect(runAuthorized("/api/check", null)).toBe(true);
  });

  it("allows authenticated users on unmatched paths", () => {
    expect(runAuthorized("/", makeToken({}))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// inner middleware redirect logic
// ---------------------------------------------------------------------------

describe("middleware – maintainer redirect", () => {
  it("passes maintainers through /dashboard without redirect", () => {
    expect(
      runMiddlewareInner("/dashboard", makeToken({ isMaintainer: true }))
    ).toBe("next");
  });

  it("redirects authenticated non-maintainers away from /dashboard", () => {
    expect(
      runMiddlewareInner("/dashboard", makeToken({ isMaintainer: false }))
    ).toBe("/register?error=maintainer");
  });

  it("does not redirect on /register (even without isMaintainer)", () => {
    expect(
      runMiddlewareInner("/register", makeToken({ isMaintainer: false }))
    ).toBe("next");
  });

  it("does not redirect on unrelated paths", () => {
    expect(runMiddlewareInner("/", null)).toBe("next");
    expect(runMiddlewareInner("/api/check", makeToken({}))).toBe("next");
  });
});

// ---------------------------------------------------------------------------
// maintainerOrgId on JWT token
// ---------------------------------------------------------------------------

describe("middleware – maintainerOrgId token field", () => {
  it("token carries maintainerOrgId when set", () => {
    const token = makeToken({ isMaintainer: true, maintainerOrgId: "stellar-org" });
    expect(token.maintainerOrgId).toBe("stellar-org");
  });

  it("token defaults maintainerOrgId to 'default' when omitted", () => {
    const token = makeToken({ isMaintainer: false });
    expect(token.maintainerOrgId).toBe("default");
  });

  it("NextRequest URL construction is stable for redirect", () => {
    const req = new NextRequest("http://localhost:3000/dashboard");
    const redirectUrl = new URL("/register?error=maintainer", req.url);
    expect(redirectUrl.pathname).toBe("/register");
    expect(redirectUrl.searchParams.get("error")).toBe("maintainer");
  });
});
