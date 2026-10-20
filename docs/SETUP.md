# Setup Guide

Step-by-step instructions to run TrustBridge Dashboard locally.

← Back to [README](../README.md) · See also [Environment variables](./ENVIRONMENT.md)

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | 18.17+ | LTS recommended |
| npm | 9+ | Comes with Node |
| PostgreSQL | 14+ | Local Docker, Neon, or Supabase |
| Git | any | For cloning |

---

## 1. Clone the repository

```bash
git clone https://github.com/your-org/trustbridge-dashboard.git
cd trustbridge-dashboard
npm install
```

---

## 2. Create a GitHub OAuth App

1. Go to [GitHub Developer Settings → OAuth Apps](https://github.com/settings/developers)
2. **New OAuth App**
3. Fill in:
   - **Application name:** TrustBridge Dashboard (Local)
   - **Homepage URL:** `http://localhost:3000`
   - **Authorization callback URL:** `http://localhost:3000/api/auth/callback/github`
4. Copy **Client ID** and generate **Client Secret**

---

## 3. Set up PostgreSQL

### Option A: Docker

```bash
docker run --name trustbridge-pg \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=trustbridge \
  -p 5432:5432 \
  -d postgres:16
```

`DATABASE_URL=postgresql://postgres:postgres@localhost:5432/trustbridge`

### Option B: Neon / Supabase

Create a project and copy the connection string from the dashboard.

---

## 4. Configure environment

```bash
cp .env.example .env.local
```

Edit `.env.local` — minimum required:

```bash
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=   # run: openssl rand -base64 32
TOKEN_ENCRYPTION_KEY=   # run: openssl rand -base64 32
GITHUB_MAINTAINER_ORG=your-github-org-slug
DATABASE_URL=postgresql://...
```

Full reference: [ENVIRONMENT.md](./ENVIRONMENT.md)

---

## 5. Initialize database schema

```bash
npm run db:push
```

For production-like migrations:

```bash
npm run db:migrate
```

Optional — open Prisma Studio:

```bash
npm run db:studio
```

---

## 6. Start development server

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000).

---

## 7. Verify the setup

| Step | Action | Expected |
|------|--------|----------|
| 1 | Open `/` | Landing page loads, stats show 0 contributors |
| 2 | Click "Register your Stellar address" | GitHub OAuth flow |
| 3 | After sign-in, go to `/register` | Registration form visible |
| 4 | Enter a valid Stellar G-address | Live Horizon validation appears |
| 5 | Sign in as org member, visit `/dashboard` | Maintainer table (if `GITHUB_MAINTAINER_ORG` matches) |

---

## Troubleshooting

### `Environment variable not found: DATABASE_URL`

Ensure `.env.local` exists and `DATABASE_URL` is set. Restart `npm run dev`.

### GitHub OAuth redirect mismatch

Callback URL in GitHub App must exactly match `{NEXTAUTH_URL}/api/auth/callback/github`.

### Dashboard access denied

Your GitHub account must be a **public member** of the org set in `GITHUB_MAINTAINER_ORG`. Private membership may require a GitHub App with org read scope instead.

### Horizon validation errors

- Check `NEXT_PUBLIC_HORIZON_URL` (mainnet vs testnet)
- Ensure the G-address exists on the same network as Horizon

### Build fails on Prisma

Run `npx prisma generate` then `npm run build`.

---

## Next steps

- [Deploy to Vercel](./DEPLOYMENT.md)
- [Understand the architecture](./ARCHITECTURE.md)
- [Contribute](./CONTRIBUTING.md)
