/**
 * Playwright E2E helpers shared across maintainer specs.
 *
 * These utilities mock NextAuth session cookies so tests can simulate
 * authenticated maintainer sessions without a real GitHub OAuth flow.
 */

import { type Page, type BrowserContext } from "@playwright/test";
import { encode } from "next-auth/jwt";

import { E2E_NEXTAUTH_SECRET } from "./env";

export interface FakeSession {
  id?: string;
  githubUsername?: string;
  name?: string;
  image?: string | null;
  isMaintainer?: boolean;
}

/**
 * Injects a mocked NextAuth session into the browser context.
 *
 * This sets `next-auth.session-token` as a plaintext cookie. In tests the
 * Next.js server should be running in an environment where
 * `NEXTAUTH_SECRET` resolves the JWT — for pure UI-layer tests we instead
 * intercept the `/api/auth/session` endpoint via route interception so no
 * real JWT is required.
 */
export async function mockSession(
  page: Page,
  session: FakeSession
): Promise<void> {
  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: {
          id: session.id ?? "test-user-1",
          name: session.name ?? "Test User",
          image: session.image ?? null,
          githubUsername: session.githubUsername ?? "testuser",
          isMaintainer: session.isMaintainer ?? false,
        },
        expires: new Date(Date.now() + 86_400_000).toISOString(),
      }),
    });
  });
}

/** Mock session as an authenticated maintainer. */
export async function mockMaintainerSession(
  page: Page,
  overrides: Partial<FakeSession> = {}
): Promise<void> {
  await mockSession(page, {
    id: "maintainer-1",
    githubUsername: "octocat",
    name: "Octo Cat",
    isMaintainer: true,
    ...overrides,
  });
}

/** Mock session as a regular (non-maintainer) contributor. */
export async function mockContributorSession(
  page: Page,
  overrides: Partial<FakeSession> = {}
): Promise<void> {
  await mockSession(page, {
    id: "contributor-1",
    githubUsername: "contributor",
    name: "Contributor",
    isMaintainer: false,
    ...overrides,
  });
}

/**
 * Sign a real NextAuth session cookie into the browser context.
 *
 * `mockSession()` only convinces the client — `withAuth` in
 * `src/middleware.ts` decodes the JWT cookie on the server, so any route it
 * guards (`/register`, `/dashboard`) bounces to the sign-in page without one.
 * This mints a genuine token with the same secret the dev server runs under
 * (see `tests/e2e/env.ts`); no GitHub round trip is involved.
 */
export async function signInWithSessionCookie(
  context: BrowserContext,
  session: FakeSession = {}
): Promise<void> {
  const token = await encode({
    token: {
      sub: session.id ?? "test-user-1",
      name: session.name ?? "Test User",
      picture: session.image ?? null,
      githubUsername: session.githubUsername ?? "testuser",
      isMaintainer: session.isMaintainer ?? false,
    },
    secret: E2E_NEXTAUTH_SECRET,
    maxAge: 24 * 60 * 60,
  });

  await context.addCookies([
    {
      name: "next-auth.session-token",
      value: token,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      expires: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
    },
  ]);
}

/**
 * Full contributor sign-in: the server-side cookie the middleware checks plus
 * the client-side `/api/auth/session` payload React reads. Both are needed —
 * either one alone leaves the page half-authenticated.
 */
export async function signInAsContributor(
  context: BrowserContext,
  page: Page,
  overrides: Partial<FakeSession> = {}
): Promise<void> {
  const session: FakeSession = {
    id: "contributor-1",
    githubUsername: "contributor",
    name: "Contributor",
    isMaintainer: false,
    ...overrides,
  };

  await signInWithSessionCookie(context, session);
  await mockSession(page, session);
}

/** Intercept a GET/POST API endpoint and return a canned response. */
export async function interceptApi(
  page: Page,
  urlPattern: string,
  body: unknown,
  status = 200
): Promise<void> {
  await page.route(urlPattern, async (route) => {
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
}
