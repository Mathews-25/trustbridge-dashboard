# Docker Compose Development Stack

This guide explains how to set up and use the Docker Compose development environment for TrustBridge Dashboard.

## Overview

The `docker-compose.yml` file defines a containerized development stack with:

- **PostgreSQL 16** — Database server for TrustBridge registrations
- **Adminer** — Web UI for database management and inspection

Compose initializes the `trustbridge_app` runtime role from
`docker/postgres/init-roles.sql`. The `trustbridge` role remains the local
admin/migration role and bypasses RLS; do not use it in the application.

## Prerequisites

- [Docker](https://www.docker.com/products/docker-desktop) (20.10+)
- [Docker Compose](https://docs.docker.com/compose/install/) (2.0+)
- Node.js 18+ (for the Next.js application)

## Quick Start

### 1. Start the containers

```bash
docker-compose up -d
```

This starts PostgreSQL and Adminer in the background. Use `docker-compose up` (without `-d`) to see logs.

### 2. Verify the services

PostgreSQL should be running on `localhost:5432`:

```bash
docker-compose ps
```

Expected output:

```
NAME                   COMMAND                  SERVICE      STATUS
trustbridge-postgres   "docker-entrypoint.s…"   postgres     Up (healthy)
trustbridge-adminer    "entrypoint.sh …"        postgres-admin  Up
```

### 3. Configure your application

Set the `DATABASE_URL` in `.env.local`:

```bash
DATABASE_URL="postgresql://trustbridge:trustbridge-dev-password@localhost:5432/trustbridge_dashboard?schema=public"
```

For the application, use the restricted role and set the tenant session value:

```bash
DATABASE_URL="postgresql://trustbridge_app:trustbridge-app-dev-password@localhost:5432/trustbridge_dashboard?schema=public&options=-c%20app.maintainer_org_id%3Ddefault"
```

### 4. Initialize the database

From the project root, run:

```bash
npm run db:push
```

This creates all tables defined in `prisma/schema.prisma`.

### 5. Start the Next.js application

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Database Management

### Using Adminer

Adminer is available at [http://localhost:8080](http://localhost:8080).

**Login details:**
- System: PostgreSQL
- Server: postgres
- Username: `trustbridge`
- Password: `trustbridge-dev-password`
- Database: `trustbridge_dashboard`

Use the admin/migration login above for Adminer. The runtime login is
`trustbridge_app` with password `trustbridge-app-dev-password`.

### Using psql

Connect to PostgreSQL directly:

```bash
docker-compose exec postgres psql -U trustbridge -d trustbridge_dashboard
```

### Viewing logs

```bash
docker-compose logs -f postgres
docker-compose logs -f postgres-admin
```

## Backup and restore drill

> Never commit database dumps to git. PostgreSQL contains user identity data, GitHub usernames, and wallet addresses; treat dumps as sensitive PII.

### Create a dump from the local Postgres container

```bash
docker-compose exec postgres pg_dump -U trustbridge -d trustbridge_dashboard --format=custom --file=/tmp/trustbridge_dashboard.pg_dump
```

To copy the dump off the container for safekeeping:

```bash
docker cp trustbridge-postgres:/tmp/trustbridge_dashboard.pg_dump ./artifacts/trustbridge_dashboard.pg_dump
```

### Restore a dump into a fresh local database

```bash
rm -rf ./artifacts && mkdir -p ./artifacts
docker cp ./artifacts/trustbridge_dashboard.pg_dump trustbridge-postgres:/tmp/trustbridge_dashboard.pg_dump
docker-compose exec postgres pg_restore --clean --if-exists -U trustbridge -d trustbridge_dashboard /tmp/trustbridge_dashboard.pg_dump
```

### Restore after a full stack reset

```bash
docker-compose down -v
# Recreate the database from the dump
# Note: use a fresh volume or existing data as appropriate
```

For a clean restore path, prefer a dedicated backup job or a scheduled `pg_dump` to an encrypted object store. Local development may use `pg_dump` directly; production MUST not keep plaintext dumps in the repo or on a shared workstation.

## Stopping and Cleanup

### Stop containers (preserve data)

```bash
docker-compose stop
```

### Stop and remove containers (preserve data)

```bash
docker-compose down
```

### Remove containers and volumes (delete all data)

```bash
docker-compose down -v
```

## Troubleshooting

### "Connection refused" error

Ensure the containers are running:

```bash
docker-compose ps
```

If not running, start them:

```bash
docker-compose up -d
```

### PostgreSQL won't start

Check logs:

```bash
docker-compose logs postgres
```

Common issues:
- Port 5432 already in use — stop the conflicting service or change the port in `docker-compose.yml`
- Volume permission issues — run `docker-compose down -v` and restart

### Database is empty after starting

Run the migration:

```bash
npm run db:push
```

## Environment Variables

All configuration is in `docker-compose.yml`. For development, the defaults are:

| Variable | Value |
|----------|-------|
| `POSTGRES_USER` | `trustbridge` |
| `POSTGRES_PASSWORD` | `trustbridge-dev-password` |
| `POSTGRES_DB` | `trustbridge_dashboard` |
| Database host | `postgres` (within containers) or `localhost` (from host) |
| Database port | `5432` |

## Production Deployment

**Do not use these credentials in production.** For production deployments, use managed database services (AWS RDS, Google Cloud SQL, Neon, Vercel Postgres, etc.) and follow your provider's security guidelines.

See [DEPLOYMENT.md](./DEPLOYMENT.md) for production setup.

## Connection Pooling & PgBouncer Notes

The local Docker Compose environment runs standard PostgreSQL 16 on port 5432. PgBouncer is not required for local development.

- Default connection string includes `connection_limit=5`.
- For production setups using external PgBouncer (e.g. Supabase pooler on port 6543, Neon, or AWS RDS Proxy), refer to [docs/PRISMA_POOL_TUNING.md](./PRISMA_POOL_TUNING.md).
