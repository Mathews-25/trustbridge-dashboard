# Digest Emails

← Back to [README](../README.md) · See also [Environment variables](./ENVIRONMENT.md) · [Architecture](./ARCHITECTURE.md)

---

## What it does

`POST /api/cron/digest` emails the configured maintainer address a readiness
summary of all contributors — how many are ready for payout, how many have a
low XLM reserve, and how many are fully blocked — plus a direct link to the
dashboard.

**Privacy default:** the email contains only aggregate counts and a dashboard
link. No contributor usernames, Stellar addresses, or emails appear unless
`DIGEST_INCLUDE_FULL_LIST=true` is explicitly set.

---

## Quick setup

1. Set `DIGEST_EMAIL` (or reuse `TREASURY_EXPORT_EMAIL`).
2. Set `CRON_SECRET` if you haven't already (shared with `/api/cron/export`).
3. Add a Vercel Cron entry (see below).
4. Deploy.

That's it. The digest runs on schedule, sends counts + link, and writes an
audit log entry every time.

---

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DIGEST_EMAIL` | No | Falls back to `TREASURY_EXPORT_EMAIL` | Destination address for digest emails |
| `DIGEST_CADENCE` | No | `daily` | Subject line label: `daily` or `weekly` |
| `DIGEST_INCLUDE_FULL_LIST` | No | unset (off) | Set `true` to include per-contributor names + reasons |
| `DIGEST_CRON_MIN_INTERVAL_MS` | No | `3600000` (1 hr) | Minimum ms between runs; prevents spam on misconfigured schedules |
| `CRON_SECRET` | Recommended | — | Shared bearer token for all `/api/cron/*` routes |

See [ENVIRONMENT.md — Digest emails](./ENVIRONMENT.md#digest-emails-dailyweekly-not-ready-contributor-digest) for full details.

---

## Vercel Cron setup

Add to `vercel.json` in the project root:

### Daily digest (08:00 UTC)

```json
{
  "crons": [
    {
      "path": "/api/cron/digest",
      "schedule": "0 8 * * *"
    }
  ]
}
```

### Weekly digest (Monday 08:00 UTC)

```json
{
  "crons": [
    {
      "path": "/api/cron/digest",
      "schedule": "0 8 * * 1"
    }
  ]
}
```

Set `DIGEST_CADENCE=weekly` to match the subject line label.

Vercel automatically sends `Authorization: Bearer $CRON_SECRET` when
`CRON_SECRET` is configured in project environment variables.

---

## Triggering manually

```bash
# Trigger via curl (useful for testing before the first scheduled run)
curl -X POST https://your-deployment.vercel.app/api/cron/digest \
  -H "Authorization: Bearer $CRON_SECRET"
```

Or from the maintainer dashboard: navigate to `/dashboard/settings`, open
your browser DevTools console, and run:

```js
await fetch('/api/cron/digest', { method: 'POST' })
  .then(r => r.json());
```

(Requires an active operator+ browser session.)

---

## Email format

### Default (privacy mode)

```
[TrustBridge] Daily Not-Ready Contributor Digest

⚠️ Action required: 3 contributors cannot receive a Wave payout yet.
   Visit the maintainer dashboard to review and resolve.

┌──────────────────────────┬───────┐
│ Status                   │ Count │
├──────────────────────────┼───────┤
│ Total contributors       │    10 │
│ ✅ Ready for payout      │  7 (70%) │
│ ⚠️ Low reserve           │     1 │
│ ❌ Not ready             │     2 │
└──────────────────────────┴───────┘

[Open maintainer dashboard →]

──────────────────────────────────────────
You are receiving this digest because your address is configured as
DIGEST_EMAIL (or TREASURY_EXPORT_EMAIL) for this TrustBridge deployment.
To stop receiving these emails, remove your address from the environment variable.
```

### With full list (`DIGEST_INCLUDE_FULL_LIST=true`)

The same summary table is included, followed by:

```
Not-ready contributors (3)
┌──────────────┬──────────────────────────────────────────┐
│ Contributor  │ Reason                                   │
├──────────────┼──────────────────────────────────────────┤
│ @bob         │ USDC trustline not established           │
│ @carol       │ Insufficient spendable XLM balance       │
│ @dave        │ Account not funded with XLM              │
└──────────────┴──────────────────────────────────────────┘

This list is included because DIGEST_INCLUDE_FULL_LIST=true is set.
Remove that setting to send counts-only digests.
```

> GitHub usernames only — no Stellar addresses or emails in the digest body.

---

## Privacy and data handling

| Default behaviour | With `DIGEST_INCLUDE_FULL_LIST=true` |
|---|---|
| Aggregate counts only | GitHub usernames + block reasons |
| No PII in email body | Usernames are PII in some jurisdictions |
| Dashboard link for details | Table rendered inline in email |

**Recommendation:** keep `DIGEST_INCLUDE_FULL_LIST` unset for most deployments.
Use it only when the digest destination mailbox is a controlled, access-restricted
inbox and your data handling policy permits it. The dashboard provides the same
information on demand with proper access control.

The digest never includes Stellar addresses, email addresses, or any financial
data. Contributor usernames in the full list are the same handles that appear
in GitHub org membership — treat them accordingly.

---

## Audit log

Every run writes to `AuditLog` (visible in `/dashboard/settings → Recent activity`):

| `action` | `metadata` fields | When |
|---|---|---|
| `digest.cron` | `cadence`, `totalContributors`, `readyCount`, `lowReserveCount`, `notReadyCount`, `includeFullList`, `destination`, `emailSent`, `durationMs` | Run completed (email sent or not) |
| `digest.cron.failed` | `error`, `durationMs` | DB error or unexpected failure |

Runs with no destination configured are still audited with `destination: "none"` and `emailSent: false`.

---

## Health endpoint

```bash
GET /api/cron/digest
```

Returns the result of the most recent run. Unauthenticated — contains only
aggregate counts, no contributor PII.

```json
{
  "lastRun": {
    "status": "ok",
    "startedAt": "2026-09-25T08:00:01.234Z",
    "durationMs": 312,
    "cadence": "daily",
    "totalContributors": 10,
    "readyCount": 7,
    "lowReserveCount": 1,
    "notReadyCount": 2,
    "destination": "ops@yourorg.com",
    "emailSent": true
  }
}
```

Returns `{ "lastRun": null }` if no digest has run since the last deployment.

---

## Rate limiting

The route applies an in-process min-interval gate (default 1 hour via
`DIGEST_CRON_MIN_INTERVAL_MS`). A second trigger within the window returns:

```json
{ "status": "skipped", "error": "Rate limited: minimum interval between digests is 3600000ms" }
```

with HTTP 200 (not 429) so the scheduler does not retry.

---

## Relationship to other email features

| Feature | Route | Trigger | Recipient | Content |
|---|---|---|---|---|
| **Digest** | `POST /api/cron/digest` | Scheduler / manual | Maintainer ops email | Aggregate counts, opt-in list |
| Treasury export | `POST /api/cron/export` | Scheduler / manual | `TREASURY_EXPORT_EMAIL` | Full CSV attachment |
| Email nudge | `POST /api/notifications/email-nudge` | Manual (session) | Maintainer's own email | Per-contributor nudge emails |

The digest and the treasury export share the `CRON_SECRET` bearer token and
the `TREASURY_EXPORT_EMAIL` fallback, but run independently and produce
different email bodies.

---

## Implementation files

| File | Purpose |
|---|---|
| `src/lib/cron-digest.ts` | Core logic: rate gate, DB query, readiness tally, email dispatch, audit |
| `src/app/api/cron/digest/route.ts` | HTTP handler: dual-auth, CSRF, POST/GET |
| `src/lib/email.ts` | `buildDigestEmailBody()` template |
| `src/lib/cron-digest.test.ts` | Unit tests for digest logic and config helpers |
| `tests/api/cron-digest.test.ts` | API handler tests |
| `tests/unit/digest-email.test.ts` | Template unit tests (XSS, privacy, cadence) |
