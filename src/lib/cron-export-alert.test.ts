/**
 * Tests for cron-export-alert.ts
 *
 * Covers:
 * - No-op when CRON_EXPORT_ALERT_WEBHOOK_URL is not set
 * - Happy path: POST is sent with correct payload to the webhook URL
 * - PagerDuty: routing_key + event_action are added when the key env var is set
 * - Slack: text field is set
 * - Non-2xx response is warned but does not throw
 * - Network error / timeout does not throw
 * - pingCronExportSuccess: no-op when CRON_EXPORT_PING_URL not set
 * - pingCronExportSuccess: GET is fired when URL is configured
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import {
  pingCronExportSuccess,
  sendCronExportAlert,
} from "@/lib/cron-export-alert";
import type { CronExportResult } from "@/lib/cron-export";

const FAILED_RESULT: CronExportResult = {
  status: "error",
  startedAt: "2026-10-17T02:00:01.000Z",
  durationMs: 1234,
  error: "Database connection timeout",
};

function okResponse() {
  return Promise.resolve(new Response(null, { status: 200 }));
}

function failResponse(status = 500) {
  return Promise.resolve(new Response(null, { status }));
}

describe("sendCronExportAlert", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    delete process.env.CRON_EXPORT_ALERT_WEBHOOK_URL;
    delete process.env.CRON_EXPORT_ALERT_PAGERDUTY_KEY;
  });

  it("is a no-op when CRON_EXPORT_ALERT_WEBHOOK_URL is not configured", async () => {
    await sendCronExportAlert(FAILED_RESULT);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("is a no-op when CRON_EXPORT_ALERT_WEBHOOK_URL is whitespace only", async () => {
    process.env.CRON_EXPORT_ALERT_WEBHOOK_URL = "   ";
    await sendCronExportAlert(FAILED_RESULT);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("sends a POST to the configured webhook URL", async () => {
    process.env.CRON_EXPORT_ALERT_WEBHOOK_URL = "https://hooks.slack.com/test";
    mockFetch.mockReturnValueOnce(okResponse());

    await sendCronExportAlert(FAILED_RESULT);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://hooks.slack.com/test");
    expect(options.method).toBe("POST");
    expect(options.headers).toMatchObject({
      "Content-Type": "application/json",
    });
  });

  it("includes all required fields in the alert payload", async () => {
    process.env.CRON_EXPORT_ALERT_WEBHOOK_URL = "https://hooks.example.com/alert";
    mockFetch.mockReturnValueOnce(okResponse());

    await sendCronExportAlert(FAILED_RESULT);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.source).toBe("trustbridge-cron-export");
    expect(body.status).toBe("error");
    expect(body.error).toBe("Database connection timeout");
    expect(body.startedAt).toBe(FAILED_RESULT.startedAt);
    expect(body.durationMs).toBe(FAILED_RESULT.durationMs);
    expect(typeof body.environment).toBe("string");
    // Slack text field
    expect(typeof body.text).toBe("string");
    expect(body.text).toContain("Database connection timeout");
  });

  it("adds PagerDuty routing_key and event_action when the env key is set", async () => {
    process.env.CRON_EXPORT_ALERT_WEBHOOK_URL = "https://events.pagerduty.com/v2/enqueue";
    process.env.CRON_EXPORT_ALERT_PAGERDUTY_KEY = "my-pd-routing-key";
    mockFetch.mockReturnValueOnce(okResponse());

    await sendCronExportAlert(FAILED_RESULT);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.routing_key).toBe("my-pd-routing-key");
    expect(body.event_action).toBe("trigger");
  });

  it("does not add PagerDuty fields when the key env var is absent", async () => {
    process.env.CRON_EXPORT_ALERT_WEBHOOK_URL = "https://hooks.example.com/alert";
    delete process.env.CRON_EXPORT_ALERT_PAGERDUTY_KEY;
    mockFetch.mockReturnValueOnce(okResponse());

    await sendCronExportAlert(FAILED_RESULT);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.routing_key).toBeUndefined();
    expect(body.event_action).toBeUndefined();
  });

  it("does not throw when the webhook returns a non-2xx response", async () => {
    process.env.CRON_EXPORT_ALERT_WEBHOOK_URL = "https://hooks.example.com/alert";
    mockFetch.mockReturnValueOnce(failResponse(503));

    await expect(sendCronExportAlert(FAILED_RESULT)).resolves.toBeUndefined();
  });

  it("does not throw when the webhook network call fails", async () => {
    process.env.CRON_EXPORT_ALERT_WEBHOOK_URL = "https://hooks.example.com/alert";
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    await expect(sendCronExportAlert(FAILED_RESULT)).resolves.toBeUndefined();
  });

  it("does not throw on an AbortError (5-second timeout)", async () => {
    process.env.CRON_EXPORT_ALERT_WEBHOOK_URL = "https://hooks.example.com/alert";
    const abortError = new DOMException("The user aborted a request.", "AbortError");
    mockFetch.mockRejectedValueOnce(abortError);

    await expect(sendCronExportAlert(FAILED_RESULT)).resolves.toBeUndefined();
  });

  it("uses 'Unknown export failure' as the error message when result.error is undefined", async () => {
    process.env.CRON_EXPORT_ALERT_WEBHOOK_URL = "https://hooks.example.com/alert";
    mockFetch.mockReturnValueOnce(okResponse());

    await sendCronExportAlert({ ...FAILED_RESULT, error: undefined });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.error).toBe("Unknown export failure");
  });
});

describe("pingCronExportSuccess", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    delete process.env.CRON_EXPORT_PING_URL;
  });

  it("is a no-op when CRON_EXPORT_PING_URL is not configured", async () => {
    await pingCronExportSuccess();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("is a no-op when CRON_EXPORT_PING_URL is whitespace only", async () => {
    process.env.CRON_EXPORT_PING_URL = "   ";
    await pingCronExportSuccess();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("sends a GET to the configured ping URL", async () => {
    process.env.CRON_EXPORT_PING_URL = "https://hc-ping.com/my-check-uuid";
    mockFetch.mockReturnValueOnce(okResponse());

    await pingCronExportSuccess();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://hc-ping.com/my-check-uuid");
    expect(options.method).toBe("GET");
  });

  it("does not throw when the ping fails", async () => {
    process.env.CRON_EXPORT_PING_URL = "https://hc-ping.com/my-check-uuid";
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    await expect(pingCronExportSuccess()).resolves.toBeUndefined();
  });

  it("does not throw on a non-2xx ping response", async () => {
    process.env.CRON_EXPORT_PING_URL = "https://hc-ping.com/my-check-uuid";
    mockFetch.mockReturnValueOnce(failResponse(404));

    await expect(pingCronExportSuccess()).resolves.toBeUndefined();
  });
});
