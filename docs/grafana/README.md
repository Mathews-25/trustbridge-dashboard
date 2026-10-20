# TrustBridge Grafana Dashboards & Metrics Specification

Operational dashboards, frozen metric naming standards, import guides, and Prometheus scrape configurations for TrustBridge on-call maintainers.

← Back to [Deployment Guide](../DEPLOYMENT.md) · See also [Environment variables](../ENVIRONMENT.md) · [Readiness Model](../READINESS_MODEL.md)

---

## Overview

During payout Waves, on-call maintainers need immediate real-time visibility into:
1. **Contributor Readiness**: Total registered contributors, payout-ready count, and readiness percentage.
2. **System Health & Probes**: Database latency, CSV data staleness before disbursements, and service health status.
3. **Audit Operations**: Volume and breakdown of maintainer actions (re-checks, exports, contract syncs).
4. **Circuit Breakers & Limits**: Live operational thresholds and RPC recovery settings.

Two production-ready Grafana dashboard definitions are provided:

| Dashboard File | Datasource | Description |
|----------------|------------|-------------|
| [`trustbridge-overview.json`](./trustbridge-overview.json) | **Prometheus** (Standard) | Production dashboard using standardized Prometheus metric names (`trustbridge_*`). |
| [`trustbridge-json-api.json`](./trustbridge-json-api.json) | **Infinity / JSON API** | Direct HTTP dashboard polling `/api/metrics` and `/api/health` without a Prometheus scraper. |

---

## Dashboard Layout

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                WAVE CONTRIBUTOR READINESS                              │
├────────────────────┬────────────────────┬────────────────────┬─────────────────────────┤
│ TOTAL CONTRIBUTORS │  READY FOR PAYOUT  │   READINESS RATE   │   READINESS BREAKDOWN   │
│       [ 142 ]      │      [ 128 ]       │     [ 90.1% ]      │ Ready: 128 | Low: 10    │
│    (Blue Stat)     │    (Green Stat)    │   (Radial Gauge)   │ Not Ready: 4 (Bargauge) │
├────────────────────┴────────────────────┴────────────────────┴─────────────────────────┤
│                               CONTRIBUTOR STATUS TIMELINE                              │
│              [ Time Series: ready (green), low_reserve (yellow), not_ready (red) ]      │
├────────────────────────────────────────────────────────────────────────────────────────┤
│                                  SYSTEM HEALTH & PROBES                                │
├────────────────────────┬────────────────────────────────┬───────────────┬──────────────┤
│  SERVICE HEALTH STATUS │      POSTGRESQL LATENCY        │   STALE CSV   │ STALENESS %  │
│      [ HEALTHY ]       │     [ Time Series: 18 ms ]     │     [ 0 ]     │   [ 0.0% ]   │
│     (Green Badge)      │     (Threshold: 100ms/300ms)   │ (Yellow > 0)  │  (Red > 20%) │
├────────────────────────┴────────────────────────────────┴───────────────┴──────────────┤
│                                AUDIT ACTIVITY & OPERATIONS                             │
├────────────────────────┬───────────────────────────────────────────────────────────────┤
│   RECENT AUDIT BUFFER  │                   AUDIT ACTIVITY BY ACTION                    │
│         [ 50 ]         │     [ Stacked Bars: recheck.single, recheck.batch,            │
│      (Stat Panel)      │       export.csv, contract.sync, etc. ]                       │
├────────────────────────┴───────────────────────────────────────────────────────────────┤
│                        OPERATIONAL CONFIGURATION & CIRCUIT BREAKERS                    │
├───────────────┬───────────────┬───────────────┬───────────────┬───────────────┬────────┤
│ RATE LIMIT MAX│ RATE LIMIT WIN│ CB THRESHOLD  │  CB RECOVERY  │ STALE CSV MAX │SOROBAN │
│    10 req     │    60,000 ms  │  5 failures   │   30,000 ms   │ 86,400,000 ms │ CONFIGURED
└───────────────┴───────────────┴───────────────┴───────────────┴───────────────┴────────┘
```

---

## Metric Names Freeze Specification

The following metric names are frozen against the codebase (`src/app/api/metrics/route.ts` and `src/app/api/health/route.ts`). Any modifications to metric keys in code must maintain backward compatibility with these names.

### 1. Contributor Readiness Metrics (`src/app/api/metrics/route.ts`)

| Prometheus Metric Name | Type | Labels / Dimensions | Source Code Property | Unit / Format | Description |
|------------------------|------|---------------------|----------------------|---------------|-------------|
| `trustbridge_contributors_total` | `gauge` | — | `contributors.total` | integer | Total registered contributors in the system. |
| `trustbridge_contributors_ready` | `gauge` | — | `contributors.ready` | integer | Number of contributors meeting all payout criteria. |
| `trustbridge_contributors_ready_percent` | `gauge` | — | `contributors.readyPercent` | percent (`0-100`) | Percentage of total contributors ready for payout. |
| `trustbridge_contributors_by_status` | `gauge` | `status="ready"`<br/>`status="low_reserve"`<br/>`status="not_ready"` | `contributors.byStatus[status]` | integer | Contributor count partitioned by readiness status. |

### 2. Audit Activity Metrics (`src/app/api/metrics/route.ts`)

| Prometheus Metric Name | Type | Labels / Dimensions | Source Code Property | Unit / Format | Description |
|------------------------|------|---------------------|----------------------|---------------|-------------|
| `trustbridge_audit_entries_recent_total` | `gauge` | — | `audit.recentEntries` | integer | Number of recent audit log entries in buffer (up to 50). |
| `trustbridge_audit_events_total` | `counter` / `gauge` | `action="recheck.single"`<br/>`action="recheck.batch"`<br/>`action="recheck.self_service"`<br/>`action="registration.create"`<br/>`action="registration.update"`<br/>`action="contract.sync"`<br/>`action="export.csv"`<br/>`action="export.csv.failed"`<br/>`action="export.cron"`<br/>`action="export.cron.failed"`<br/>`action="network_config_mismatch_detected"` | `audit.byAction[action]` | integer count | Count of audit events grouped by action type. |

### 3. Operational Limits & Configuration (`src/app/api/metrics/route.ts`)

| Prometheus Metric Name | Type | Labels / Dimensions | Source Code Property | Unit / Format | Description |
|------------------------|------|---------------------|----------------------|---------------|-------------|
| `trustbridge_config_rate_limit_max_requests` | `gauge` | — | `config.rateLimitMaxRequests` | count | Max allowed requests per rate limit window (`RATE_LIMIT_MAX_REQUESTS`). |
| `trustbridge_config_rate_limit_window_ms` | `gauge` | — | `config.rateLimitWindowMs` | milliseconds | Duration of rate limiting window (`RATE_LIMIT_WINDOW_MS`). |
| `trustbridge_config_circuit_breaker_failure_threshold` | `gauge` | — | `config.circuitBreakerFailureThreshold` | count | Consecutive failures before Horizon circuit breaker trips (`HORIZON_CB_FAILURE_THRESHOLD`). |
| `trustbridge_config_circuit_breaker_recovery_ms` | `gauge` | — | `config.circuitBreakerRecoveryMs` | milliseconds | Horizon circuit breaker cooldown timeout (`HORIZON_CB_RECOVERY_MS`). |
| `trustbridge_config_stale_csv_max_age_ms` | `gauge` | — | `config.staleCsvMaxAgeMs` | milliseconds | Max age before contributor data is flagged stale (`STALE_CSV_MAX_AGE_MS`). |
| `trustbridge_config_soroban_contract_configured` | `gauge` | — | `config.sorobanContractConfigured` | binary (`1` or `0`) | 1 if `SOROBAN_CONTRACT_ID` is set, 0 otherwise. |

### 4. Health & Liveness Probes (`src/app/api/health/route.ts`)

| Prometheus Metric Name | Type | Labels / Dimensions | Source Code Property | Unit / Format | Description |
|------------------------|------|---------------------|----------------------|---------------|-------------|
| `trustbridge_health_status` | `gauge` | — | `status` | integer (`2`=ok, `1`=degraded, `0`=error) | Overall service health probe status. |
| `trustbridge_health_db_status` | `gauge` | — | `checks.database.status` | integer (`2`=ok, `0`=error) | PostgreSQL database ping check status. |
| `trustbridge_health_db_latency_ms` | `gauge` | — | `checks.database.latencyMs` | milliseconds | Latency of database ping query (`SELECT 1`). |
| `trustbridge_health_csv_staleness_status` | `gauge` | — | `checks.csvStaleness.status` | integer (`2`=ok, `1`=degraded) | Staleness evaluation check status. |
| `trustbridge_health_csv_stale_count` | `gauge` | — | `checks.csvStaleness.staleCount` | integer | Number of contributor records exceeding staleness max age. |
| `trustbridge_health_csv_total_count` | `gauge` | — | `checks.csvStaleness.totalCount` | integer | Total contributor records evaluated for staleness. |
| `trustbridge_health_csv_stale_percent` | `gauge` | — | `checks.csvStaleness.stalePercent` | percent (`0-100`) | Percentage of stale contributor registrations. |
| `trustbridge_health_contract_sync_status` | `gauge` | — | `checks.contractSync.status` | integer (`2`=ok, `1`=degraded) | Contract-to-Postgres sync job status. |

---

## Import Instructions

### Option 1: Import via Grafana Web UI

1. Open your Grafana instance (e.g. `https://grafana.yourdomain.org`).
2. Navigate to **Dashboards** → **New** → **Import**.
3. Either:
   - Click **Upload JSON file** and select `docs/grafana/trustbridge-overview.json`.
   - Or paste the contents of `trustbridge-overview.json` into the text box.
4. Select your **Prometheus** datasource from the dropdown.
5. Click **Import**.

### Option 2: Automated File Provisioning (Docker / Kubernetes)

Add the dashboard file to your Grafana provisioning directory:

```yaml
# /etc/grafana/provisioning/dashboards/trustbridge.yaml
apiVersion: 1

providers:
  - name: 'TrustBridge'
    orgId: 1
    folder: 'Operations'
    type: file
    disableDeletion: false
    updateIntervalSeconds: 30
    allowUiUpdates: true
    options:
      path: /etc/grafana/dashboards
```

Mount `docs/grafana/trustbridge-overview.json` into `/etc/grafana/dashboards/`.

### Option 3: Grafana HTTP API

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <GRAFANA_API_KEY>" \
  -d '{"dashboard": '"$(cat docs/grafana/trustbridge-overview.json)"', "overwrite": true}' \
  https://grafana.yourdomain.org/api/dashboards/db
```

---

## Prometheus Scrape Configuration

If using Prometheus to scrape TrustBridge metrics via an exporter or sidecar bridge:

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'trustbridge-dashboard'
    scrape_interval: 30s
    scrape_timeout: 10s
    metrics_path: '/api/metrics'
    scheme: 'https'
    static_configs:
      - targets: ['trustbridge.yourdomain.org']
```

For direct probe monitoring of `/api/health`:

```yaml
  - job_name: 'trustbridge-health'
    scrape_interval: 15s
    metrics_path: '/api/health'
    scheme: 'https'
    static_configs:
      - targets: ['trustbridge.yourdomain.org']
```

---

## Recommended Prometheus Alert Rules

Use these alert rules in your Prometheus alertmanager setup to notify on-call engineers of critical Wave conditions:

```yaml
# trustbridge-alerts.yml
groups:
  - name: trustbridge_wave_alerts
    rules:
      - alert: TrustBridgeWaveReadinessLow
        expr: trustbridge_contributors_ready_percent < 70
        for: 15m
        labels:
          severity: warning
        annotations:
          summary: "TrustBridge Wave readiness below 70%"
          description: "Only {{ $value }}% of contributors are ready for payout. Check low-reserve and unverified accounts in maintainer dashboard."

      - alert: TrustBridgeCsvStalenessElevated
        expr: trustbridge_health_csv_stale_percent > 20
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Stale contributor registrations detected before export"
          description: "{{ $value }}% of contributor registrations are stale. Trigger a batch re-check before exporting Wave CSV."

      - alert: TrustBridgeDatabaseLatencyHigh
        expr: trustbridge_health_db_latency_ms > 300
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "PostgreSQL latency elevated (>300ms)"
          description: "Database ping query latency is {{ $value }}ms. Check PostgreSQL connection pool and query load."

      - alert: TrustBridgeServiceDegraded
        expr: trustbridge_health_status < 2
        for: 3m
        labels:
          severity: critical
        annotations:
          summary: "TrustBridge service health degraded or failing"
          description: "Service health probe returned status code {{ $value }}."
```

---

## Security & Secrets Policy

- **Zero Secrets**: All Grafana dashboard JSON files in `docs/grafana/` contain **zero secrets, API keys, passwords, or personal contributor data**.
- **Aggregate Metrics**: All metrics endpoints (`/api/metrics`, `/api/health`, `/api/stats`) return aggregated operational telemetry only.
- Validated continuously in CI via `tests/unit/grafana-dashboards.test.ts`.
