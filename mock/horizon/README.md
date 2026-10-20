# Mock Horizon Server

This directory contains deterministic mock Horizon API stub mappings and Docker Compose configuration for TrustBridge.

## Mapping Source

These mappings are synchronized from `trustbridge-action` (`mock/horizon/mappings`) to guarantee schema parity between the GitHub Action runner and the TrustBridge Dashboard.

### Available Test Accounts

| Account Address | Status | XLM Balance | USDC Balance | Trustline |
|-----------------|--------|-------------|--------------|-----------|
| `GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF` | Funded | 10.0 | 50.0 | Ready (USDC) |
| `GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB` | Unfunded (404) | 0.0 | 0.0 | None |
| `GCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC` | Low Balance | 0.5 | 10.0 | Ready (USDC) |
| `GDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD` | No Trustline | 10.0 | 0.0 | None |
| `GEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE` | Rate Limited (429) | — | — | — |

## Running Locally

To spin up the WireMock instance on port `8089`:

```bash
docker compose -f mock/horizon/docker-compose.yml up -d
```

Run integration tests against the mock:

```bash
NEXT_PUBLIC_HORIZON_URL=http://localhost:8089 npm run test:mock
```

To stop:

```bash
docker compose -f mock/horizon/docker-compose.yml down
```
