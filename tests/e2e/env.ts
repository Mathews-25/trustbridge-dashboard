/**
 * Shared E2E environment values.
 *
 * The register journey has to get past `withAuth` in `src/middleware.ts`, which
 * decodes a real NextAuth JWT cookie — intercepting `/api/auth/session` only
 * fools the client. So the tests mint a genuine session token, and both the
 * Playwright web server and the helper that signs it have to agree on the
 * secret. CI already exports `NEXTAUTH_SECRET`; locally we fall back to this
 * fixed value and pass it to `next dev` from `playwright.config.ts`.
 */
export const E2E_NEXTAUTH_SECRET =
  process.env.NEXTAUTH_SECRET ?? "trustbridge-e2e-secret";

/** Prisma refuses to construct a client without a URL; no test ever hits it. */
export const E2E_DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://e2e:e2e@127.0.0.1:5432/e2e";
