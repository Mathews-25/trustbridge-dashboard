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
| API health | `POST /api/check` with `{ "address": "G..." }` |

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
- [Contributing](./CONTRIBUTING.md)

---

## Background Worker Process

For durable background processing (such as batch rechecks across all contributors,
single-contributor rechecks, and asynchronous notifications), TrustBridge uses a
**database-backed queue** (`QueueJob` table in PostgreSQL) so jobs survive
application restarts and serverless cold-starts.

> [!WARNING]
> **A separate worker process is mandatory.** Web applications running on serverless
> platforms like Vercel or Netlify are ephemeral and terminate once an HTTP request
> ends. If you only deploy the web application without a running worker process,
> enqueued jobs (e.g., contributor re-checks) will remain in `pending` state and
> **silently stall**.

### Entrypoint and npm script

- **NPM script:** `npm run worker`
- **Entrypoint script:** [`scripts/worker.mjs`](../scripts/worker.mjs)
- **Implementation file:** [`src/lib/queue-worker.ts`](../src/lib/queue-worker.ts)

Under the hood, `scripts/worker.mjs` uses `jiti` to dynamically load `src/lib/queue-worker.ts`,
registers handlers for `recheck.batch` and `recheck.single`, and calls `runWorker()`.
The worker runs a continuous poll loop claiming pending jobs from PostgreSQL until
terminated.

You can also invoke it directly via Node or tsx:

```bash
node scripts/worker.mjs
# or
npx tsx scripts/worker.mjs
```

---

### Environment variables (shared with web process)

The worker process executes the same backend registration and Horizon verification logic
as the Next.js server actions and API routes. It must have access to the same environment
variables as the web process:

| Environment variable | Required / Optional | Purpose in Worker |
|----------------------|---------------------|-------------------|
| `DATABASE_URL` | **Required** | PostgreSQL connection string used to poll, claim, and update `QueueJob` rows and update contributor records. |
| `TOKEN_ENCRYPTION_KEY` | **Required** | 32-byte base64 AES-256 key to decrypt maintainer GitHub access tokens stored in `User.accessToken` for org membership queries. |
| `GITHUB_MAINTAINER_ORG` | **Required** | Organization slug used to verify maintainer permissions during recheck tasks. |
| `NEXT_PUBLIC_HORIZON_URL` | **Required** | Stellar Horizon endpoint (e.g. `https://horizon.stellar.org` or `https://horizon-testnet.stellar.org`) to query balances and trustlines. |
| `NEXT_PUBLIC_DEFAULT_ASSET_CODE` | Optional (default `USDC`) | Asset code to verify contributor trustlines against. |
| `NEXT_PUBLIC_DEFAULT_ASSET_ISSUER` | Optional | Asset issuer public key for the custom asset trustline check. |
| `NEXT_PUBLIC_MIN_XLM_BALANCE` | Optional (default `1`) | Minimum required spendable XLM balance for readiness status. |
| `SOROBAN_RPC_URL` | Optional | RPC URL if Soroban smart contract verification is enabled. |
| `SOROBAN_CONTRACT_ID` | Optional | Contract address for Soroban integration. |
| `SENTRY_DSN` | Optional | Error reporting and sanitized stack traces if Sentry is enabled. |

#### Supplying environment variables

- **Local / VM with dotenv:**
  ```bash
  npx dotenv-cli -e .env.production -- npm run worker
  ```
- **Shell export:**
  ```bash
  export DATABASE_URL="postgresql://..."
  export TOKEN_ENCRYPTION_KEY="..."
  export GITHUB_MAINTAINER_ORG="stellar"
  export NEXT_PUBLIC_HORIZON_URL="https://horizon.stellar.org"
  npm run worker
  ```

---

### Starting and supervising the worker

Because the worker must stay alive 24/7, run it under a process manager or container orchestrator with an automatic restart policy.

#### Option A: PM2 (Node Process Manager)

```bash
# Install PM2 globally
npm install -g pm2

# Start worker with auto-restart on crash
pm2 start npm --name "trustbridge-worker" -- run worker

# Configure PM2 to start on system boot
pm2 startup
pm2 save
```

Or using an `ecosystem.config.cjs` file:

```javascript
module.exports = {
  apps: [
    {
      name: "trustbridge-worker",
      script: "scripts/worker.mjs",
      interpreter: "node",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      env_file: ".env.production",
    },
  ],
};
```

#### Option B: Systemd Service (Linux VM / EC2)

Create `/etc/systemd/system/trustbridge-worker.service`:

```ini
[Unit]
Description=TrustBridge Queue Worker
After=network.target postgresql.service

[Service]
Type=simple
User=trustbridge
WorkingDirectory=/var/www/trustbridge-dashboard
EnvironmentFile=/var/www/trustbridge-dashboard/.env.production
ExecStart=/usr/bin/npm run worker
Restart=always
RestartSec=5s
StandardOutput=journal
StandardError=journal
SyslogIdentifier=trustbridge-worker

[Install]
WantedBy=multi-user.target
```

Enable and start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now trustbridge-worker
sudo systemctl status trustbridge-worker
```

#### Option C: Docker & Docker Compose

In a multi-service Docker deployment, add a `worker` service alongside `web` and `postgres`:

```yaml
services:
  worker:
    build:
      context: .
      dockerfile: Dockerfile
    command: ["npm", "run", "worker"]
    restart: unless-stopped
    env_file:
      - .env.production
    depends_on:
      postgres:
        condition: service_healthy
```

#### Option D: PaaS (Railway, Fly.io, Render, Heroku)

On PaaS providers, declare a persistent background worker process:

- **Railway / Render:** Create a "Background Worker" service pointing to your repository, set the build command to `npm ci && npm run prisma:generate`, and start command to `npm run worker`.
- **Fly.io / Procfile:**
  ```
  web: npm start
  worker: npm run worker
  ```

---

### Restarting the worker

When deploying code changes or updating environment variables:

- **PM2:**
  ```bash
  pm2 restart trustbridge-worker
  ```
- **Systemd:**
  ```bash
  sudo systemctl restart trustbridge-worker
  ```
- **Docker Compose:**
  ```bash
  docker compose restart worker
  ```

The worker traps `SIGINT` and `SIGTERM` signals and initiates a graceful shutdown: any in-flight job finishes before the process exits.

---

### Monitoring & health expectations

#### 1. Startup & operational log messages

A healthy worker produces standard log output indicating the poll loop is running:

```
Starting TrustBridge durable background worker...
[QueueWorker] Background worker loop started.
```

When jobs are claimed and processed:
- Completed jobs: Result details and duration are logged and stored in `QueueJob.result`.
- Graceful shutdown: `Received SIGTERM. Shutting down worker gracefully...` followed by `[QueueWorker] Background worker loop stopped.`

#### 2. Queue health and backlog inspection

Monitor the PostgreSQL `QueueJob` table directly or through the admin metrics API (`GET /api/metrics`):

| Metric / Indicator | Expected Healthy State | Troubleshooting / Action |
|--------------------|------------------------|--------------------------|
| `pendingCount` | `0` (or briefly spikes during batch checks, draining within seconds to minutes) | If `pendingCount` grows continuously or jobs stay `pending` > 1 min, the worker process is down or disconnected. |
| `processingCount` | `0` when idle, `1`–`2` during active batches | If a job stays `processing` indefinitely after a worker hard-crash, it may require manual reset or cleanup. |
| `failedCount` | Low or `0` | Inspect `QueueJob.error` column for sanitized error messages (Horizon rate limits, network timeouts, invalid contributor address). |
| Process restart count | Constant (0 unexpected restarts) | High restart count indicates memory leaks, unhandled fatal exceptions, or bad environment variable configuration. |

#### 3. Database query for quick triage

Run against your production database to check queue status:

```sql
SELECT status, COUNT(*)
FROM "QueueJob"
GROUP BY status;
```

To inspect recently failed jobs:

```sql
SELECT id, type, error, "createdAt", "completedAt"
FROM "QueueJob"
WHERE status = 'failed'
ORDER BY "completedAt" DESC
LIMIT 10;
```
