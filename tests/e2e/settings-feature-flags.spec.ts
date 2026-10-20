import { expect, test, type BrowserContext } from "@playwright/test";

import {
  interceptApi,
  mockMaintainerSession,
  signInWithSessionCookie,
} from "./helpers";

/**
 * Feature flags on /dashboard/settings (issue #510).
 *
 * `GET /api/settings/feature-flags` resolves the deployment's real environment
 * (`FEATURE_*`, database overrides). Asserting against it would make these
 * tests depend on whatever the host machine or CI runner happens to have set,
 * so every case below intercepts the endpoint with a fixture declared inside
 * the case. Nothing here reads application config or a shared mutable object,
 * which keeps the tests independent of each other and of run order.
 */

const NETWORK_FIXTURE = {
  horizonUrl: "https://horizon-testnet.stellar.org",
  horizonNetwork: "testnet",
  sorobanUrl: "https://soroban-testnet.stellar.org",
  sorobanNetwork: "testnet",
  sorobanContractConfigured: false,
  mismatched: false,
  warnings: [],
};

const AUDIT_FIXTURE = {
  entries: [],
  summary: { total: 0, byAction: {} },
};

/**
 * Sign in as a maintainer and stub every other endpoint /dashboard/settings
 * fetches on mount. Only the feature-flags route is left open for the caller.
 *
 * Both halves of the sign-in are needed: `signInWithSessionCookie` mints the
 * JWT cookie `withAuth` in `src/middleware.ts` decodes (otherwise the request is
 * redirected to sign-in before the page renders), and `mockMaintainerSession`
 * feeds the `/api/auth/session` payload `useSession()` reads. See
 * docs/E2E_TESTING.md, "Signing in without GitHub".
 */
async function setupSettingsPage({
  page,
  context,
}: {
  page: Parameters<typeof interceptApi>[0];
  context: BrowserContext;
}) {
  await signInWithSessionCookie(context, {
    id: "maintainer-1",
    githubUsername: "octocat",
    isMaintainer: true,
  });
  await mockMaintainerSession(page);
  await interceptApi(page, "**/api/settings/network", NETWORK_FIXTURE);
  await interceptApi(page, "**/api/audit*", AUDIT_FIXTURE);
  await interceptApi(page, "**/api/auth/session-info", {
    session: {
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      expiresInSeconds: 86_400,
      maxAgeSeconds: 86_400,
      strategy: "jwt",
    },
  });
  await interceptApi(page, "**/api/settings/api-keys", { keys: [] });
  await interceptApi(page, "**/api/registrations/deleted", { registrations: [] });
}

test.describe("Settings — feature flags panel", () => {
  test("renders the mocked flags with their keys, sources and toggle states", async ({
    page,
    context,
  }) => {
    await setupSettingsPage({ page, context });
    await interceptApi(page, "**/api/settings/feature-flags", {
      flags: [
        {
          key: "MAINTENER_TOOLS",
          enabled: true,
          value: true,
          source: "environment",
          description: "Maintainer-only tooling",
        },
        {
          key: "PUBLIC_REGISTRATION",
          enabled: false,
          value: false,
          source: "database",
        },
        {
          // `enabled` absent: the panel falls back to `value`.
          key: "MAINTENANCE_MODE",
          value: true,
          source: "default",
        },
      ],
    });

    await page.goto("/dashboard/settings");

    const panel = page.getByTestId("feature-flags-panel");
    await expect(panel).toBeVisible();

    // Every key from the fixture, and nothing else.
    await expect(panel.getByText("MAINTENER_TOOLS")).toBeVisible();
    await expect(panel.getByText("PUBLIC_REGISTRATION")).toBeVisible();
    await expect(panel.getByText("MAINTENANCE_MODE")).toBeVisible();
    await expect(panel.getByRole("listitem")).toHaveCount(3);

    // Sources are rendered per flag.
    await expect(panel.getByText("environment")).toBeVisible();
    await expect(panel.getByText("database")).toBeVisible();
    await expect(panel.getByText("default")).toBeVisible();

    // States: two enabled (one via the `value` fallback), one disabled.
    await expect(panel.getByText("enabled")).toHaveCount(2);
    await expect(panel.getByText("disabled")).toHaveCount(1);
  });

  test("shows an enabled state for a flag the fixture turns on", async ({ page, context }) => {
    await setupSettingsPage({ page, context });
    await interceptApi(page, "**/api/settings/feature-flags", {
      flags: [
        { key: "ALPHA_ENABLED", enabled: true, source: "environment" },
      ],
    });

    await page.goto("/dashboard/settings");

    const row = page
      .getByTestId("feature-flags-panel")
      .getByRole("listitem")
      .filter({ hasText: "ALPHA_ENABLED" });
    await expect(row).toBeVisible();
    await expect(row.getByText("enabled")).toBeVisible();
    await expect(row.getByText("disabled")).toHaveCount(0);
  });

  test("shows a disabled state for a flag the fixture turns off", async ({ page, context }) => {
    await setupSettingsPage({ page, context });
    await interceptApi(page, "**/api/settings/feature-flags", {
      flags: [
        { key: "ALPHA_DISABLED", enabled: false, source: "default" },
      ],
    });

    await page.goto("/dashboard/settings");

    const row = page
      .getByTestId("feature-flags-panel")
      .getByRole("listitem")
      .filter({ hasText: "ALPHA_DISABLED" });
    await expect(row).toBeVisible();
    await expect(row.getByText("disabled")).toBeVisible();
    await expect(row.getByText("enabled")).toHaveCount(0);
  });

  test("shows the empty-state copy when the deployment has no flags", async ({
    page,
    context,
  }) => {
    await setupSettingsPage({ page, context });
    await interceptApi(page, "**/api/settings/feature-flags", { flags: [] });

    await page.goto("/dashboard/settings");

    const panel = page.getByTestId("feature-flags-panel");
    await expect(panel).toBeVisible();
    await expect(panel.getByText(/no feature flags configured/i)).toBeVisible();
    await expect(panel.getByRole("listitem")).toHaveCount(0);
  });

  test("shows the loading state until the slow response arrives", async ({ page, context }) => {
    await setupSettingsPage({ page, context });

    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    await page.route("**/api/settings/feature-flags", async (route) => {
      await gate;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          flags: [{ key: "SLOW_FLAG", enabled: true, source: "environment" }],
        }),
      });
    });

    await page.goto("/dashboard/settings");

    const panel = page.getByTestId("feature-flags-panel");
    await expect(panel.getByText(/loading feature flags/i)).toBeVisible();
    await expect(panel.getByText("SLOW_FLAG")).toHaveCount(0);

    release();

    await expect(panel.getByText("SLOW_FLAG")).toBeVisible();
    await expect(panel.getByText(/loading feature flags/i)).toHaveCount(0);
  });

  test("shows the error state when the endpoint returns HTTP 500", async ({
    page,
    context,
  }) => {
    await setupSettingsPage({ page, context });
    await interceptApi(
      page,
      "**/api/settings/feature-flags",
      { error: "Internal Server Error" },
      500
    );

    await page.goto("/dashboard/settings");

    const panel = page.getByTestId("feature-flags-panel");
    await expect(panel.getByText(/failed to load feature flags/i)).toBeVisible();
    // An error must not leave the empty state or a stale list behind.
    await expect(panel.getByText(/no feature flags configured/i)).toHaveCount(0);
    await expect(panel.getByRole("listitem")).toHaveCount(0);
  });

  test("recovers from an error and renders the flags on retry", async ({ page, context }) => {
    await setupSettingsPage({ page, context });

    let attempt = 0;
    await page.route("**/api/settings/feature-flags", async (route) => {
      attempt += 1;
      if (attempt === 1) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "Internal Server Error" }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          flags: [{ key: "RECOVERED_FLAG", enabled: true, source: "database" }],
        }),
      });
    });

    await page.goto("/dashboard/settings");
    const panel = page.getByTestId("feature-flags-panel");
    await expect(panel.getByText(/failed to load feature flags/i)).toBeVisible();

    // Re-navigating re-runs the query: the default react-query cache is in the
    // browser session, so a fresh document is the deterministic way to ask again.
    await page.reload();

    await expect(panel.getByText("RECOVERED_FLAG")).toBeVisible();
    await expect(panel.getByText(/failed to load feature flags/i)).toHaveCount(0);
  });

  test("requests the flags again when the page is revisited", async ({ page, context }) => {
    await setupSettingsPage({ page, context });

    let requests = 0;
    await page.route("**/api/settings/feature-flags", async (route) => {
      requests += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          flags: [{ key: `VISIT_${requests}`, enabled: true, source: "environment" }],
        }),
      });
    });

    await page.goto("/dashboard/settings");
    const panel = page.getByTestId("feature-flags-panel");
    await expect(panel.getByText("VISIT_1")).toBeVisible();

    await page.goto("/dashboard");
    await page.goto("/dashboard/settings");

    await expect(panel.getByText("VISIT_2")).toBeVisible();
    expect(requests).toBe(2);
  });
});
