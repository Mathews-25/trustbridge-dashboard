# Sessions

This document describes how Trustbridge issues, stores, and validates user
sessions. It is the reference for the session-related surfaces referenced from
the project README.

## Overview

Sessions are used to keep a user authenticated across requests. A session is
created on successful sign-in, persisted server-side, and referenced from the
client via an HTTP-only cookie. Session state is never trusted from the client
beyond the opaque session identifier.

## Lifecycle

1. **Creation** — On successful authentication a new session record is created
   with a random, high-entropy identifier. The identifier is set as an
   HTTP-only, `SameSite=Lax`, `Secure` (in production) cookie.
2. **Validation** — Each authenticated request resolves the cookie to a stored
   session, checks expiry, and attaches the associated user to the request
   context.
3. **Refresh** — Active sessions are extended on use up to a configured maximum
   lifetime. Idle sessions expire after the configured idle timeout.
4. **Revocation** — Sign-out, password changes, and explicit revocation delete
   the server-side session record so the cookie can no longer be resolved.

## Storage

- Session records are stored server-side; the client only ever holds the opaque
  identifier.
- Records include the owning user, creation time, last-seen time, and expiry.
- Expired records are pruned so they cannot be replayed.

## Security properties

- **HTTP-only cookies** prevent JavaScript access to the session identifier.
- **`Secure` cookies** in production prevent transmission over plaintext.
- **`SameSite`** mitigates cross-site request forgery; see `docs/CSRF.md` for
  the CSRF strategy used alongside sessions.
- **Rotation** on privilege change (e.g. sign-in, password change) prevents
  session fixation.
- **Server-side revocation** ensures sign-out is effective immediately.

## Configuration

Session behavior is controlled by environment configuration (idle timeout,
absolute lifetime, cookie flags). Feature-gated behavior is documented in
`docs/FEATURE_FLAGS.md`.

## Testing

Session flows are exercised by the end-to-end suite. See `docs/E2E_TESTING.md`
for how to run the E2E tests that cover sign-in, session persistence, and
sign-out.

## Related documentation

- [`docs/FEATURE_FLAGS.md`](./FEATURE_FLAGS.md) — feature flag configuration.
- [`docs/CSRF.md`](./CSRF.md) — CSRF protection used with sessions.
- [`docs/E2E_TESTING.md`](./E2E_TESTING.md) — end-to-end test guide.
