/**
 * Issue #148 — GET /api/auth/session-info.
 */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth/jwt", () => ({ getToken: vi.fn() }));

import { getToken } from "next-auth/jwt";

import { GET } from "@/app/api/auth/session-info/route";

function request() {
  return new NextRequest("http://localhost:3000/api/auth/session-info");
}

const NOW_SECONDS = Math.floor(Date.now() / 1000);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/auth/session-info", () => {
  it("refuses an unauthenticated caller", async () => {
    vi.mocked(getToken).mockResolvedValue(null as never);

    const res = await GET(request());

    expect(res.status).toBe(401);
  });

  it("returns issued-at, expiry and remaining time for the caller", async () => {
    vi.mocked(getToken).mockResolvedValue({
      sub: "user-1",
      iat: NOW_SECONDS - 60,
      exp: NOW_SECONDS + 3_600,
    } as never);

    const res = await GET(request());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.session.issuedAt).toBeTruthy();
    expect(body.session.expiresAt).toBeTruthy();
    expect(body.session.expiresInSeconds).toBeGreaterThan(0);
  });

  it("is honest that other sessions cannot be listed or ended", async () => {
    vi.mocked(getToken).mockResolvedValue({
      sub: "user-1",
      iat: NOW_SECONDS,
    } as never);

    const body = await (await GET(request())).json();

    expect(body.session.strategy).toBe("jwt");
    expect(body.session.canListOtherSessions).toBe(false);
    expect(body.session.signOutEndsAllSessions).toBe(false);
  });

  it("never returns a token, even though the JWT carries one", async () => {
    vi.mocked(getToken).mockResolvedValue({
      sub: "user-1",
      githubUsername: "contributor",
      accessToken: "gho_supersecret",
      iat: NOW_SECONDS,
      exp: NOW_SECONDS + 3_600,
    } as never);

    const raw = JSON.stringify(await (await GET(request())).json());

    expect(raw).not.toContain("gho_supersecret");
    expect(raw).not.toMatch(/accessToken/i);
  });

  it("returns no identity fields beyond timing", async () => {
    vi.mocked(getToken).mockResolvedValue({
      sub: "user-1",
      githubUsername: "contributor",
      email: "someone@example.com",
      iat: NOW_SECONDS,
    } as never);

    const raw = JSON.stringify(await (await GET(request())).json());

    // The constraint on the issue: don't store or expose extra PII.
    expect(raw).not.toContain("someone@example.com");
    expect(raw).not.toContain("contributor");
  });

  it("is never cached", async () => {
    vi.mocked(getToken).mockResolvedValue({
      sub: "user-1",
      iat: NOW_SECONDS,
    } as never);

    const res = await GET(request());

    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("takes no user parameter, so it cannot be asked about someone else", async () => {
    vi.mocked(getToken).mockResolvedValue({
      sub: "user-1",
      iat: NOW_SECONDS,
    } as never);

    // Even with a userId in the query string, the answer comes from the token.
    const res = await GET(
      new NextRequest(
        "http://localhost:3000/api/auth/session-info?userId=someone-else"
      )
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(JSON.stringify(body)).not.toContain("someone-else");
  });
});
