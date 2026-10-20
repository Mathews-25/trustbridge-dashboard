# Maintainer Workflow

This flow keeps payout preparation predictable.

1. Ask contributors to register their GitHub username and Stellar address.
2. Review newly registered addresses in the dashboard.
3. Re-check readiness before exporting payment data.
4. Filter out accounts marked not ready.
5. Keep the exported CSV with the payout batch record.

For urgent payouts, contact contributors with the remediation text shown by the dashboard before changing thresholds.

---

## Background queue health

The re-check flow uses an in-process `BackgroundQueue` to run Horizon checks without blocking HTTP responses. Maintainers can inspect the current queue state at any time:

```
GET /api/contributors/queue/health
```

Response fields:

| Field | Description |
|-------|-------------|
| `pendingCount` | Jobs waiting to be processed |
| `processingCount` | Jobs currently running |
| `completedCount` | Jobs that finished successfully |
| `dlqCount` | Jobs that exhausted retries and landed in the dead-letter queue |
| `totalEnqueued` | Total jobs enqueued since process start |
| `lastProcessedAt` | ISO-8601 timestamp of the most recently completed job |
| `workerStartedAt` | ISO-8601 timestamp of when the first job was ever enqueued |

A non-zero `dlqCount` indicates stuck recheck jobs. These are safe to ignore (Postgres stays the source of truth), but are a signal that Horizon may be intermittently unavailable. The queue resets on process restart.
