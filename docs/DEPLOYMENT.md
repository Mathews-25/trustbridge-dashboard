# Deployment (Vercel)

Deploy TrustBridge Dashboard to Vercel with PostgreSQL.

← Back to [README](../README.md) · See also [Environment variables](./ENVIRONMENT.md)

---

## Overview

| Component | Recommended hosting |
|-----------|---------------------|
| Next.js web app | Vercel project (auto-build) or Node server |
| Durable Queue Worker | Separate persistent process (Railway, Fly.io, Render, VM/Docker, systemd) |
| PostgreSQL | Vercel Postgres, Neon, Supabase, or self-hosted |
| Auth | GitHub OAuth (external) |
| Stellar data | Horizon API (external) |

---

## Pre-deployment checklist

- [ ] GitHub repo pushed to GitHub
- [ ] Production PostgreSQL provisioned
- [ ] GitHub OAuth App created for production domain
- [ ] All env vars documented in [ENVIRONMENT.md](./ENVIRONMENT.md)
- [ ] Durable worker process host/supervisor provisioned (PM2, systemd, Docker, or PaaS worker)

---

## Step 1: Import to Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import `trustbridge-dashboard` repository
3. Framework preset: **Next.js** (auto-detected)
4. Build command: `npm run build` (default)
5. Output: default

---

## Step 2: Environment variables

Add in Vercel → Settings → Environment Variables:

```
GITHUB_CLIENT_ID
GITHUB_CLIENT_SECRET
NEXTAUTH_URL=https://your-project.vercel.app
NEXTAUTH_SECRET
GITHUB_MAINTAINER_ORG
DATABASE_URL
NEXT_PUBLIC_HORIZON_URL=https://horizon.stellar.org
NEXT_PUBLIC_DEFAULT_ASSET_CODE=USDC
NEXT_PUBLIC_DEFAULT_ASSET_ISSUER=GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN
NEXT_PUBLIC_MIN_XLM_BALANCE=1
```

Deploy once, then update `NEXTAUTH_URL` if using a custom domain.

---

## Step 3: Database migration

From your local machine with production `DATABASE_URL`:

```bash
DATABASE_URL="postgresql://..." npm run db:push
```

Or use Prisma Migrate for versioned migrations:

```bash
DATABASE_URL="postgresql://..." npx prisma migrate deploy
```

---

## Step 4: GitHub OAuth production app

Update or create OAuth App:

| Field | Value |
|-------|-------|
| Homepage URL | `https://your-domain.vercel.app` |
| Callback URL | `https://your-domain.vercel.app/api/auth/callback/github` |

---

## Step 5: Verify production

| Test | URL |
|------|-----|
| Landing | `/` |
| OAuth sign-in | CTA → GitHub → `/register` |
| Registration | Enter G-address, save |
| Dashboard | `/dashboard` (maintainer org member) |
| API health | `GET /api/health` (see [Health probes](#health-probes-kubernetes--load-balancers)) |
| API check | `POST /api/check` with `{ "address": "G..." }` |

---

## Health probes (Kubernetes / load balancers)

`GET /api/health` is the single readiness/liveness surface. It is safe to
expose to load balancers and k8s probes: it never returns connection strings,
hosts, credentials, or tokens — only booleans, stable status/reason codes, and
latency in milliseconds.

### Response shape

```json
{
  "status": "ok",
  "checks": {
    "db":    { "ok": true,  "status": "ok",       "latencyMs": 3 },
    "queue": { "ok": true,  "status": "ok",       "latencyMs": 1 },
    "rpc":   { "ok": true,  "status": "ok",       "latencyMs": 42 }
  }
}
```

Each dependency (`db`, `queue`, `rpc`) reports:

| Field | Meaning |
|-------|---------|
| `ok` | Boolean — probe succeeded |
| `status` | `ok` \| `degraded` \| `unhealthy` |
| `reason` | Stable reason code on failure (e.g. `db_unreachable`, `queue_unreachable`, `rpc_timeout`) — never a raw error message |
| `latencyMs` | Probe duration in milliseconds |

### Overall status → HTTP code

| Overall `status` | HTTP | When |
|---|---|---|
| `ok` | `200` | All dependencies healthy |
| `degraded` | `200` | At least one dependency degraded but none unhealthy |
| `unhealthy` | `503` | Any dependency unhealthy |

### Kubernetes probe example

```yaml
livenessProbe:
  httpGet:
    path: /api/health
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 30
readinessProbe:
  httpGet:
    path: /api/health
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 10
  failureThreshold: 3
```

> `GET /api/health` stays `200` while `MAINTENANCE` is on (see
> [Maintenance mode](#maintenance-mode)) so probes and uptime checks are
> unaffected by deploys.

---

## Custom domain

1. Vercel → Domains → add domain
2. Update `NEXTAUTH_URL` to custom domain
3. Update GitHub OAuth callback URL
4. Redeploy

---

## Backup and restore drill (Docker Compose)

Use the same Postgres container defined in [DOCKER_COMPOSE.md](./DOCKER_COMPOSE.md) for a local recovery drill. This is a write-up, not a production substitute for automated backups.

### 1) Create a dump

```bash
docker-compose exec postgres pg_dump -U trustbridge -d trustbridge_dashboard --format=custom --file=/tmp/trustbridge_dashboard.pg_dump
```

### 2) Copy the dump off the container

```bash
docker cp trustbridge-postgres:/tmp/trustbridge_dashboard.pg_dump ./artifacts/trustbridge_dashboard.pg_dump
```

### 3) Restore into a fresh database

```bash
docker-compose exec postgres createdb -U trustbridge trustbridge_dashboard

docker cp ./artifacts/trustbridge_dashboard.pg_dump trustbridge-postgres:/tmp/trustbridge_dashboard.pg_dump
docker-compose exec postgres pg_restore --clean --if-exists -U trustbridge -d trustbridge_dashboard /tmp/trustbridge_dashboard.pg_dump
```

### 4) Re-run migrations after restore

```bash
DATABASE_URL="postgresql://trustbridge:trustbridge-dev-password@localhost:5432/trustbridge_dashboard?schema=public" npm run db:deploy
```

> Never commit dump files or leave them in a shared working tree. These dumps may contain GitHub usernames, wallet addresses, registration history, and other personal data. Use encrypted storage or a managed backup service for production.

## Monitoring & limits

- **Grafana Dashboards & Metrics** — import ready-made dashboards in [docs/grafana/](./grafana/README.md) ([Overview JSON](./grafana/trustbridge-overview.json) / [JSON API JSON](./grafana/trustbridge-json-api.json)) for live payout readiness and health monitoring.
- **Horizon rate limits** — batch re-check queries one account per registration; large Waves may need throttling (future enhancement)
- **Vercel serverless timeout** — default 10s on Hobby; batch re-check may need pagination for 100+ contributors
- **Database connections** — use connection pooling (Neon pooler, Supabase pooler, or Prisma Accelerate)

---

## Maintenance mode

Use maintenance mode when deploying during a Wave, running a migration, or
otherwise doing work that must not race with maintainer writes.

### Turning it on / off

Set the **`MAINTENANCE`** environment variable to a truthy value (`1`, `true`,
`on`, `yes`, `enabled`) and redeploy (or, on Vercel, edit the env var and
redeploy). Unset it (or set it to `0`) to turn maintenance mode off.

`MAINTENANCE` is intentionally **env-only**. It is the one switch that must keep
working when the database is down, so it is never gated behind a DB flag — a
maintainer can always disable it from the platform's env settings. Operators
running with `FEATURE_FLAGS_DB_ENABLED` additionally have the `maintenance_mode`
feature flag (`FeatureFlag` row or `FEATURE_FLAG_MAINTENANCE_MODE` env), which
composes with `MAINTENANCE` (either one being on turns it on).

Optional: **`MAINTENANCE_MESSAGE`** overrides the banner / 503 body text.

### What it does

| Surface | Behaviour while `MAINTENANCE` is on |
|---|---|
| Every page | Amber banner at the top (`src/components/MaintenanceBanner.tsx`) |
| `GET` / `HEAD` on any route | Unchanged — **reads stay up** |
| `POST` / `PUT` / `PATCH` / `DELETE` under `/api/*` | `503` `{ "error": "maintenance_mode" }` with `Retry-After: 120`, from `src/middleware.ts` |
| `GET /api/health` | Still `200` — probes and uptime checks are unaffected |
| `/api/auth/*` | Exempt — sign-in keeps working |
| `/api/check` | Exempt — a pure Horizon read (POST only to keep the address out of logs); the registration page keeps validating addresses |
| `/api/webhooks/*` | Exempt — GitHub / trustbridge-action deliveries are **not** dropped; they land and are processed normally |

### Caveats to handle separately

- **Scheduled jobs (cron).** Cron requests are not routed through the Next.js
  middleware, so `/api/contract-sync`, email nudges, etc. **continue to run**
  during maintenance. If a deploy needs them paused, disable the cron trigger
  at the platform (Vercel Cron / GitHub Actions schedule) or set `CRON_SECRET`
  to a value the scheduler doesn't have for the duration.
- **Webhook side effects.** Because webhooks are exempt, a delivery received
  mid-deploy will still write to the database. That is deliberate (retries are
  finite and data would be lost otherwise) — factor it into migration ordering.
- **In-flight background queue jobs** already `processing` when the deploy
  starts are not interrupted; only the *enqueue* endpoints are blocked.

### Validate

```bash
npm test -- middleware
```

covers `src/lib/maintenance.ts` and the middleware gate
(`tests/unit/middleware-maintenance.test.ts`).

---

## CI recommendation

Add GitHub Actions workflow:

```yaml
# .github/workflows/ci.yml (suggested)
name: CI
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run lint
      - run: npm run build
        env:
          DATABASE_URL: postgresql://placeholder:placeholder@localhost:5432/placeholder
          NEXTAUTH_SECRET: ci-build-secret
          GITHUB_CLIENT_ID: placeholder
          GITHUB_CLIENT_SECRET: placeholder
```

---

## Related docs

- [Grafana dashboards & metrics](./grafana/README.md)
- [Setup guide](./SETUP.md)
- [Architecture](./ARCHITECTURE.md)
- [Docker Compose](./DOCKER_COMPOSE.md)
