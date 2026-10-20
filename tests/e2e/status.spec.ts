/**
 * Issue #384 — smoke test for the public /status health page.
 *
 * The status page (src/app/status/) is the operator-facing health view: it
 * server-renders a health snapshot via runHealthChecks() and hands it to
 * StatusClient, which adds the "Check now" refresh control (#309). This spec
 * confirms the page loads without authentication and renders its key content:
 * the heading, last-updated timestamp, overall status banner, the five
 * component checks, and the manual refresh path.
 *
 * Environment-dependent details are asserted against the full set of possible
 * values instead of one pinned label: the overall banner and per-check badges
 * depend on live probes (database reachable, Horizon/RPC reachable) which
 * differ between local runs (placeholder DATABASE_URL → "Service disruption")
 * and CI (reachable Postgres without migrations → "Partial degradation").
 * The refresh control is exercised against a mocked /api/health payload —
 * per docs/E2E_TESTING.md, route mocks are registered before page.goto().
 *
 * No session is needed: /status is deliberately outside the middleware auth
 * matcher (src/middleware.ts), so the smoke test also proves it stays public.
 */

import { test, expect } from "@playwright/test";

import { interceptApi } from "./helpers";

/** Canned health snapshot served to the "Check now" refresh (issue #309). */
const refreshedHealth = {
  status: "ok",
  timestamp: "2026-01-01T12:00:00.000Z",
  checks: {
    database: { status: "ok", latencyMs: 3 },
    horizon: { status: "ok", latencyMs: 42 },
    sorobanRpc: { status: "ok", latencyMs: 17 },
    csvStaleness: {
      status: "ok",
      staleCount: 0,
      totalCount: 3,
      stalePercent: 0,
      warning: "",
    },
    contractSync: { status: "ok", lastRunAt: null },
  },
  version: "0.1.0",
} as const;

/** Every label StatusClient can render for the overall banner. */
const overallLabels = [
  "All systems operational",
  "Partial degradation",
  "Service disruption",
];

/** The per-service rows StatusClient renders, in order. */
const componentRows = [
  "Dashboard",
  "Database",
  "Horizon (Stellar)",
  "Soroban RPC",
  "Data freshness",
];

test.describe("Status page smoke", () => {
  test("loads without auth and renders the health overview", async ({ page }) => {
    // No session helpers on purpose — /status must stay public.
    await page.goto("/status");

    // Scope to <main> so the global Header's nav links (which also contain
    // "Dashboard") cannot collide with the component rows.
    const main = page.getByRole("main");

    // Heading renders on both the healthy path and the fetch-failed fallback.
    await expect(
      main.getByRole("heading", { name: "Service status", level: 1 })
    ).toBeVisible();

    // Healthy SSR snapshot: last-updated timestamp with an ISO datetime.
    await expect(main.getByText("Last updated:")).toBeVisible();
    await expect(main.locator("time")).toHaveAttribute("datetime", /^\d{4}-\d{2}-\d{2}T/);

    // Overall banner shows one of the three known labels.
    await expect(
      main.getByText(new RegExp(overallLabels.join("|")))
    ).toBeVisible();

    // All five component checks are listed under the Components section.
    await expect(main.getByText("Components")).toBeVisible();
    for (const row of componentRows) {
      await expect(main.getByText(row)).toBeVisible();
    }

    // Manual refresh control and the auto-refresh note (#309).
    await expect(
      main.getByRole("button", { name: "Check service status now" })
    ).toBeVisible();
    await expect(
      main.getByText(/Auto-refreshes every 30 seconds/)
    ).toBeVisible();
  });

  test("refreshes the snapshot from /api/health via 'Check now'", async ({
    page,
  }) => {
    await interceptApi(page, "**/api/health", refreshedHealth);
    await page.goto("/status");

    const main = page.getByRole("main");
    await expect(
      main.getByRole("heading", { name: "Service status", level: 1 })
    ).toBeVisible();

    await main.getByRole("button", { name: "Check service status now" }).click();

    // The mocked snapshot drives the UI: all-systems banner plus fixture-only
    // content ("3 contributors tracked") that the initial SSR snapshot does
    // not contain in local or CI environments.
    await expect(main.getByText("All systems operational")).toBeVisible();
    await expect(main.getByText("3 contributors tracked")).toBeVisible();

    // The refresh result is announced through the aria-live region.
    await expect(main.getByRole("status")).toContainText(/Status updated at/);

    // The control is usable again after the refresh settles.
    await expect(
      main.getByRole("button", { name: "Check service status now" })
    ).toBeEnabled();
  });
});
