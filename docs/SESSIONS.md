# Sessions: idle vs absolute timeouts, org switching, and API keys

This document explains how browser sessions issued by NextAuth interact with
idle and absolute timeouts, what happens when a maintainer switches orgs, and
how API keys differ from browser sessions. It is the operator-facing companion
to `src/lib/auth.ts` and `src/app/api/auth/`.

## Two clocks, one cookie

A browser session is a signed JWT cookie managed by NextAuth. Two independent
clocks govern its lifetime:

| Clock | Enforced by | Value | Effect |
| --- | --- | --- | --- |
| **Absolute timeout** | NextAuth (`session.maxAge`) | `SESSION_MAX_AGE_SECONDS` (see `src/lib/session-info.ts`) | Hard ceiling. Once the JWT's `exp` passes, the cookie is rejected and the user must sign in again, regardless of activity. |
| **Idle timeout** | NextAuth JWT refresh | Same `maxAge` window, refreshed on each authenticated request | The cookie's `exp` slides forward while the user is active. If the user is idle past the window, the cookie expires and the next request is unauthenticated. |

Because both are derived from `SESSION_MAX_AGE_SECONDS`, the effective behavior
is:

- **Active user:** the session keeps sliding forward, but never past the
  absolute ceiling enforced by the JWT `exp` set at sign-in.
- **Idle user:** after `SESSION_MAX_AGE_SECONDS` of inactivity the cookie is
  rejected and the user is redirected to sign in.

The account panel reports `SESSION_MAX_AGE_SECONDS` back to the user; a test
asserts that `src/lib/session-info.ts` and `authOptions.session.maxAge` stay in
step. Do not change one without the other.

### What is *not* enforced here

- There is no separate, shorter idle timeout distinct from `maxAge`. If you
  need one, add it explicitly in `authOptions.callbacks.jwt` and document it
  here — do not invent a parallel session subsystem.
- Session revocation is not instantaneous: a signed JWT remains valid until
  `exp`. To force immediate sign-out, rotate `NEXTAUTH_SECRET` (invalidates all
  sessions) or remove the user's org membership so the next role check fails.

## Org switching

Org scope lives in the JWT (`availableOrgs`, `role`, `isMaintainer`), resolved
at sign-in from `ALLOWED_MAINTAINER_ORGS` and the GitHub team env vars.

When a maintainer switches orgs in the UI:

1. **Preserved:** the session cookie, `sub` (user id), `githubUsername`, and
   the encrypted GitHub access token stored on the `User` row. No re-auth is
   required to switch between orgs the user already belongs to.
2. **Re-validated:** every API route that touches org-scoped data calls
   `verifyTenantAccess(targetOrgId, currentOrgId)` (see `src/lib/auth.ts`).
   A mismatch fails closed with a tenant error — the switch does not widen
   access.
3. **Re-auth expectations:** if the user's GitHub org membership changed since
   sign-in, the JWT's `availableOrgs`/`role` are stale until the next sign-in.
   Operators should sign out and back in after membership changes; the next
   `jwt` callback re-runs `resolveAvailableOrgs` and `resolveRole`.

CSRF tokens are issued per session (`src/lib/csrf.ts`) and are unaffected by
org switching; they are re-issued on sign-in.

## API keys vs browser sessions

API keys are **not** browser sessions and do not share the timeout model:

| Property | Browser session | API key |
| --- | --- | --- |
| Transport | Signed JWT cookie | `Authorization: Bearer <key>` header |
| Idle timeout | Yes (`maxAge` slide) | **No** — keys do not expire on idle |
| Absolute timeout | Yes (`maxAge` ceiling) | **No** — keys remain valid until revoked |
| Org scope | JWT `availableOrgs` + `verifyTenantAccess` | Bound to the issuing org; checked per request |
| Revocation | Rotate `NEXTAUTH_SECRET` or remove membership | Explicit revoke; effective immediately on next request |
| CSRF | Required for state-changing requests | Not applicable (no cookie) |

See `docs/API_KEYS.md` for key issuance, scopes, and revocation semantics.

## Operator checklist

- Shared consoles: sign out when leaving a machine. The idle window is the
  only automatic protection; there is no shorter idle timeout today.
- After changing `ALLOWED_MAINTAINER_ORGS` or team env vars, have maintainers
  sign out and back in so the JWT picks up the new scope.
- To invalidate every browser session immediately, rotate `NEXTAUTH_SECRET`.
- To invalidate a single integration, revoke its API key — do not rely on
  session timeouts for machine credentials.
