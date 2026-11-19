import "server-only";

import { StructuredLogger } from "@/lib/logger";
import type { CronExportResult } from "@/lib/cron-export";

const logger = new StructuredLogger("cron-export-alert");

const ALERT_TIMEOUT_MS = 5_000;

export interface CronExportAlertPayload {
  source: "trustbridge-cron-export";
  status: "error";
  error: string;
  startedAt: string;
  durationMs: number;
  /** NODE_ENV value at dispatch time — helps triage staging vs production alerts. */
  environment: string;
  /** Optional: PagerDuty routing key from CRON_EXPORT_ALERT_PAGERDUTY_KEY. */
  routing_key?: string;
  /** Formatted text for Slack-style webhooks. */
  text?: string;
  /** PagerDuty event action (always "trigger" for failures). */
  event_action?: "trigger";
}

/**
 * Redact PII and secrets from alert text before it leaves the process.
 *
 * Masks:
 *   - Stellar G-addresses (`G` + 55 base32 chars) → `G...<last4>`
 *   - API-key-style secrets (`tb_…`, `sk-…`/`sk_…`, Slack `xox…` tokens)
 *     → `[redacted-secret]`
 *   - `Bearer <token>` credential values → `Bearer [redacted]`
 *
 * Pure function — safe to unit test and reuse in other alert paths.
 */
export function redactAlertText(value: string): string {
  return value
    .replace(/\bG[A-Z2-7]{55}\b/g, (address) => `${address.slice(0, 5)}...${address.slice(-4)}`)
    .replace(
      /\b(tb_[A-Za-z0-9_-]{8,}|sk[-_][A-Za-z0-9_-]{8,}|xox[bap]-[A-Za-z0-9-]+)\b/g,
      "[redacted-secret]"
    )
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*\b/g, "Bearer [redacted]");
}

/**
 * Recursively redact every string value in an alert payload so that raw
 * G-addresses and API keys never leave the process — regardless of which
 * field (error, text, routing_key, nested metadata) they appear in.
 *
 * Reuses {@link redactAlertText} so there is a single redaction policy.
 * Non-string primitives are returned unchanged; arrays and plain objects are
 * walked. Pure function — safe to unit test.
 */
export function redactAlertPayload<T>(payload: T): T {
  if (typeof payload === "string") {
    return redactAlertText(payload) as unknown as T;
  }
  if (Array.isArray(payload)) {
    return payload.map((item) => redactAlertPayload(item)) as unknown as T;
  }
  if (payload !== null && typeof payload === "object") {
    const redacted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
      redacted[key] = redactAlertPayload(value);
    }
    return redacted as T;
  }
  return payload;
}

/**
 * Fire an outbound failure-alert webhook when the cron export fails.
 *
 * Destination: `CRON_EXPORT_ALERT_WEBHOOK_URL` env var.
 * If the var is not set the function is a no-op.
 *
 * The POST is fire-and-forget with a 5-second abort timeout.
 * A delivery failure is logged but never re-throws — the alert mechanism must
 * not interfere with the export result or the caller's error handling.
 *
 * The entire payload is passed through {@link redactAlertPayload} before it is
 * serialized, so raw G-addresses and API keys never appear in Slack/email
 * alert bodies.
 *
 * @param result  The failed CronExportResult from runCronExport().
 */
export async function sendCronExportAlert(
  result: CronExportResult
): Promise<void> {
  const webhookUrl = process.env.CRON_EXPORT_ALERT_WEBHOOK_URL?.trim();
  if (!webhookUrl) return;

  const error = redactAlertText(result.error ?? "Unknown export failure");
  const environment = process.env.NODE_ENV ?? "unknown";

  const payload: CronExportAlertPayload = {
    source: "trustbridge-cron-export",
    status: "error",
    error,
    startedAt: result.startedAt,
    durationMs: result.durationMs,
    environment,
    // Slack incoming webhooks use the `text` field for the message body.
    text: `🚨 TrustBridge cron export failed (${environment})\nError: ${error}\nStarted: ${result.startedAt} — took ${result.durationMs}ms`,
  };

  // PagerDuty Events API v2 requires a routing_key and event_action.
  const pdKey = process.env.CRON_EXPORT_ALERT_PAGERDUTY_KEY?.trim();
  if (pdKey) {
    payload.routing_key = pdKey;
    payload.event_action = "trigger";
  }

  // Defense in depth: redact every string field (error, text, routing_key, …)
  // so no raw address or API key can leak through any channel.
  const safePayload = redactAlertPayload(payload);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ALERT_TIMEOUT_MS);

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(safePayload),
      signal: controller.signal,
    });

    if (!response.ok) {
      logger.warn("cron_export_alert_non_ok", {
        webhookUrl,
        status: response.status,
      });
    } else {
      logger.info("cron_export_alert_sent", { webhookUrl, status: response.status });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // AbortError = timeout; log as warn, not error — the alert delivery
    // failure is secondary to the original export failure.
    logger.warn("cron_export_alert_failed", { webhookUrl, error: message });
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Ping a dead-man's-switch / healthcheck URL after a successful export run.
 *
 * Destination: `CRON_EXPORT_PING_URL` env var (e.g. healthchecks.io check-in URL).
 * A missed ping on the external service triggers an alert there.
 * No-op when the var is not set.
 */
export async function pingCronExportSuccess(): Promise<void> {
  const pingUrl = process.env.CRON_EXPORT_PING_URL?.trim();
  if (!pingUrl) return;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ALERT_TIMEOUT_MS);

  try {
    const response = await fetch(pingUrl, {
      method: "GET",
      signal: controller.signal,
    });

    if (!response.ok) {
      logger.warn("cron_export_ping_non_ok", { pingUrl, status: response.status });
    } else {
      logger.info("cron_export_ping_sent", { pingUrl });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn("cron_export_ping_failed", { pingUrl, error: message });
  } finally {
    clearTimeout(timeoutId);
  }
}
