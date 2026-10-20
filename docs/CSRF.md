# CSRF Protection

TrustBridge Dashboard uses **origin validation** (`assertSameOrigin`) for mutating API routes and **double-submit CSRF tokens** (`validateCsrfToken`) for sensitive read endpoints. This page documents the complete inventory of routes, methods, CSRF enforcement, and header names for client wiring.

← Back to [README](../README.md)

---

## Threat model

Without CSRF protection, a malicious page could trick an authenticated user into performing unwanted actions:

- An attacker submits a hidden `<form>` to `POST /api/register`, overwriting the contributor's payout address to an attacker-controlled G-address
- An attacker triggers `POST /api/contributors` (batch re-check), exhausting Horizon API quota at 100+ contributor scale
- An attacker triggers `POST /api/treasury/export`, exfiltrating contributor payout data
- An attacker triggers `POST /api/register/delete`, wiping a user's registration
- An attacker triggers `POST /api/contract-sync`, forcing a re-sync of Horizon data into Postgres

Because the application uses **cookie-based session authentication** (NextAuth JWT cookie), these requests would otherwise inherit the victim's session automatically.

---

## Mutating routes (CSRF same-origin-validated)

Every mutating route handler under `src/app/api/` calls `assertSameOrigin` from `src/lib/csrf.ts` before any downstream logic. The table below lists all mutating (non-safe) API routes, their CSRF enforcement, and the header each client must wire.

| Route | Method | CSRF Protected | Header | Auth Level | Notes |
|-------|--------|----------------|--------|------------|-------|
| `/api/check` | POST, OPTIONS | Yes (`assertSameOrigin`) | — (Origin/Referer only) | Public | Non-browser clients skip Origin/Referer check |
| `/api/register` | POST, GET | POST only (`assertSameOrigin`) | — (Origin/Referer only) | Authenticated | GET is read-only |
| `/api/address-history` | GET | Yes (`validateCsrfToken`) | `x-csrf-token` | Authenticated | Double-submit token required for GET |
| `/api/contributors` | GET, POST | POST only | — (Origin/Referer only) | Maintainer | GET read-only |
| `/api/contributors/paginated` | GET | No (read-only) | — | Maintainer | — |
| `/api/contributors/[id]` | POST | Yes (`assertSameOrigin`) | — (Origin/Referer only) | Maintainer | — |
| `/api/contributors/[id]/notes` | PATCH | Yes (`assertSameOrigin`) | — (Origin/Referer only) | Maintainer | — |
| `/api/contributors/queue/status` | GET | No (read-only) | — | Maintainer | — |
| `/api/contributors/queue/jobs/[jobId]` | GET | No (read-only) | — | Maintainer | — |
| `/api/contributors/queue/progress` | GET | No (Server-Sent Events) | — | Maintainer | — |
| `/api/audit` | GET | No (read-only) | — | Maintainer | — |
| `/api/stats` | GET | No (read-only) | — | Publicly cached | — |
| `/api/contract-sync` | GET, POST | POST only (`assertSameOrigin`) | — (Origin/Referer only) | Maintainer or scheduler | GET read-only |
| `/api/cron/export` | GET, POST | POST only (`assertSameOrigin`) | — (Origin/Referer only) | Maintainer or scheduler | GET read-only |
| `/api/disputes` | GET, POST, PATCH | POST/PATCH only (`assertSameOrigin`) | — (Origin/Referer only) | Authenticated + Maintainer | GET read-only |
| `/api/soroban/events` | GET | No (read-only) | — | Maintainer | — |
| `/api/settings/network` | GET | No (read-only) | — | Maintainer | — |
| `/api/settings/feature-flags` | GET | No (read-only) | — | Maintainer | — |
| `/api/settings/api-keys` | GET, POST | POST only (`assertSameOrigin`) | — (Origin/Referer only) | Operator | GET read-only |
| `/api/settings/api-keys/[id]` | DELETE | DELETE only (`assertSameOrigin`) | — (Origin/Referer only) | Operator | — |
| `/api/notifications/email-nudge` | GET, POST | GET and POST only (`assertSameOrigin`) | — (Origin/Referer only) | Maintainer | GET read-only |
| `/api/treasury/export` | GET, POST | POST only (`assertSameOrigin`) | — (Origin/Referer only) | Maintainer | GET optional read; POST requires same-origin |
| `/api/graphql` | POST | Yes (`assertSameOrigin`) | — (Origin/Referer only) | Maintainer | — |
| `/api/metrics` | GET | No (read-only) | — | Operator | — |
| `/api/metrics/prometheus` | GET | No (read-only) | — | Maintainer or allowlisted | — |
| `/api/maintainer/ban` | POST | Yes (`assertSameOrigin`) | — (Origin/Referer only) | Maintainer | — |
| `/api/maintainer/conflicts` | GET | No (read-only) | — | Maintainer | — |
| `/api/register/checklist` | PATCH | Yes (`assertSameOrigin`) | — (Origin/Referer only) | Authenticated | Self-service checklist updates |
| `/api/register/export` | GET | No (read-only) | — | Authenticated | Self-service data export |
| `/api/register/recheck` | POST | Yes (`assertSameOrigin`) | — (Origin/Referer only) | Authenticated | Self-service recheck |
| `/api/register/delete` | POST | Yes (`assertSameOrigin`) | — (Origin/Referer only) | Authenticated | Self-service deletion |
| `/api/invites/generate` | POST | Yes (`assertSameOrigin`) | — (Origin/Referer only) | (implementation-dependent) | — |
| `/api/registrations/[id]` | DELETE | Yes (`assertSameOrigin`) | — (Origin/Referer only) | Maintainer | Soft-delete registration |
| `/api/registrations/[id]/restore` | POST | Yes (`assertSameOrigin`) | — (Origin/Referer only) | Maintainer | Restore soft-deleted registration |
| `/api/registrations/deleted` | GET | No (read-only) | — | Maintainer | — |
| `/api/auth/session-info` | GET | No (read-only) | — | Authenticated | Session JWT facts |

### Sensitive read routes (double-submit CSRF token required)

These GET endpoints expose personally-identifiable payout timeline data and require a valid CSRF token in addition to session authentication.

| Route | Method | CSRF Protected | Header / Param | Auth Level |
|-------|--------|----------------|----------------|------------|
| `/api/address-history` | GET | Yes (`validateCsrfToken`) | `x-csrf-token` header or `csrfToken` query param | Authenticated |

**Why this route needs a CSRF token:** `GET /api/address-history` reveals a contributor's payout address history. Although GET is a "safe" method by HTTP semantics, the response contains PII that should not be disclosed to cross-site requests. The double-submit token pattern (Header `x-csrf-token` + Cookie `csrf_token`) enforces this. The cookie is set via NextAuth's session mechanism (or a dedicated CSRF middleware), and the client must read the cookie and echo it back as a header on every request.

---

## Webhook routes (signature-based, not CSRF)

Webhook endpoints are public (no session) but use **HMAC signature verification** instead of the browser-origin CSRF mechanism. They do not require `x-csrf-token` because there is no session cookie to steal.

| Route | Method | Signature | Header |
|-------|--------|-----------|--------|
| `/api/webhooks/github-org-membership` | POST | HMAC-SHA256 | `X-Hub-Signature-256` |
| `/api/webhooks/trustbridge-action` | POST | HMAC-SHA256 | `X-TrustBridge-Signature` |

Replay endpoints (admin-only):

| Route | Method | Signature | Header |
|-------|--------|-----------|--------|
| `/api/webhooks/github-org-membership/replay` | POST | HMAC-SHA256 | `X-Hub-Signature-256` (admin-only; skipped if `GITHUB_WEBHOOK_SECRET` unset) |

---

## API key bearer routes (CSRF-exempt)

Routes protected by **API key bearer tokens** (e.g., `Authorization: Bearer <key>` for cron/scrapers) are CSRF-exempt. There is no browser session cookie to steal, so same-origin CSRF protection is not applicable. However, they still require the API key credentials to be present and valid.

| Route | Method | Auth | Notes |
|-------|--------|------|-------|
| `/api/settings/api-keys` | GET, POST | API key (`requireOperator`) | No CSRF (no session) |
| `/api/settings/api-keys/[id]` | DELETE | API key (`requireOperator`) | No CSRF (no session) |
| `/api/metrics/prometheus` | GET | Api key or allowlisted | Protected by bearer token |

---

## Mechanism

`src/lib/csrf.ts` enforces two layers:

### Layer 1: `assertSameOrigin` (mutating routes only)

- Safe methods (`GET`, `HEAD`, `OPTIONS`) bypass entirely
- If `Origin` header is present → must match an allowed host (from `x-forwarded-host`, `host`, request URL host, or `NEXTAUTH_URL`)
- If `Origin` absent → check `Referer` the same way
- If both absent → allow (non-browser client; no session cookie to steal)

### Layer 2: `assertCsrf` / `validateCsrfToken` (sensitive GET routes)

- Calls `assertSameOrigin` first (Layer 1)
- Then requires matching tokens: header `x-csrf-token` must equal cookie `csrf_token`
- Cookie is issued via `generateCsrfToken` / `issueCsrfToken` bound to `userId`
- Token is signed with HMAC-SHA256 using `NEXTAUTH_SECRET` or `CSRF_SECRET`, valid for 24 hours

---

## Error shape

When a request is rejected:

```json
{
  "error": "Invalid request origin"
}
```

HTTP status: `403 Forbidden`

This error is **distinct** from authentication and authorization errors:

| Layer | Status | Body |
|-------|--------|------|
| CSRF (origin mismatch) | 403 | `{ error: "Invalid request origin" }` |
| CSRF (invalid token) | 403 | `{ error: "Invalid CSRF token" }` |
| Not authenticated | 401 | `{ error: "Unauthorized" }` |
| Not a maintainer | 403 | `{ error: "Forbidden" }` |
| Not an operator | 403 | `{ error: "Forbidden" }` |

---

## Example: fetch from a browser dashboard client

This example shows how dashboard clients (such as the maintainer dashboard) wire CSRF protection:

```js
// 1. Read the CSRF token from the session cookie
//    The app sets `csrf_token` via NextAuth session or a dedicated middleware.
const csrfToken = document.cookie
  .split("; ")
  .find((row) => row.startsWith("csrf_token="))
  ?.split("=")[1];

if (!csrfToken) {
  throw new Error("CSRF token not found in cookies");
}

// 2. Call the sensitive GET route (requires double-submit token)
const response = await fetch("https://your-app.com/api/address-history", {
  method: "GET",
  headers: {
    "Content-Type": "application/json",
    "x-csrf-token": csrfToken, // Double-submit: echoed cookie value
  },
});

if (!response.ok) {
  const body = await response.json();
  throw new Error(`GET /api/address-history failed: ${body.error}`);
}

const { history } = await response.json();
```

### POST example (same-origin Origin/Referer, no CSRF token required)

```js
const formData = new FormData();
formData.append("address", "GABC123...");

const response = await fetch("https://your-app.com/api/register", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    // Origin is derived automatically by the browser from the request
  },
  body: JSON.stringify({ stellarAddress: "GABC123..." }),
});

const result = await response.json();
```

### API key bearer example (CSRF-exempt, credential-based)

```js
const response = await fetch("https://your-app.com/api/treasury/export", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`, // No CSRF token needed
  },
  body: JSON.stringify({
    format: "csv",
    snapshotAt: new Date().toISOString(),
    blockWhenStale: true,
  }),
});

const csv = await response.text();
```

---

## Environment & configuration

No new environment variables are required for CSRF protection. The existing configuration is:

| Variable | Role |
|----------|------|
| `NEXTAUTH_SECRET` | Signs CSRF tokens and validates session; also used as fallback for `CSRF_SECRET` |
| `CSRF_SECRET` | Optional alternative signing key for CSRF tokens (defaults to `NEXTAUTH_SECRET`) |
| `GITHUB_WEBHOOK_SECRET` | Signs webhook `X-Hub-Signature-256` headers; if unset, replay endpoints skip signature verification |

---

## Testing

All CSRF behavior is covered by automated tests.

### Unit (`tests/unit/csrf.test.ts`)
- `assertSameOrigin` pass/fail cases: safe methods, cross-origin 403, `x-forwarded-host`, `NEXTAUTH_URL`, Referer fallback, non-browser allowance, port mismatch, malformed Origin

### API (`tests/api/*.test.ts`)
- Each mutating route asserts that a foreign `Origin` returns 403 before any downstream logic (Horizon/Prisma/session) is touched
- `tests/api/check.test.ts`: cross-origin rejection, same-origin pass
- `tests/api/treasury/export/route.test.ts`: same-origin and cross-origin checks for treasury export
- `tests/api/api-keys.test.ts`: API key route CSRF behavior

### Run tests

```bash
npm run test        # all unit + API tests
npm run test:unit   # unit tests only
npm run test:api    # API route handler tests only
```

---

## Known limitations & future hardening

| Hardening | Status | Notes |
|-----------|--------|-------|
| Strict mode (deny missing Origin) | Future | Could add `CSRF_STRICT=true` env toggle |
| Custom header defense (`X-Requested-With`) | Future | Lightweight but requires client-side header injection |
| Rate-limiting `/api/check` | Future | Public POST endpoint; CSRF reduces abuse surface but does not replace rate limits |
| Playwright end-to-end tests | Future | E2E hermetic tests were descoped from Wave #19 |

---

## Related docs

- [Architecture overview](./ARCHITECTURE.md)
- [Environment variables](./ENVIRONMENT.md)
- [Contributing guide](./CONTRIBUTING.md)
