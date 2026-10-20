import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";

import { filterBaselineViolations } from "./axe-baseline";
import {
  interceptApi,
  mockContributorSession,
  mockMaintainerSession,
} from "./helpers";

// ── Fixture data ──────────────────────────────────────────────────────────

const contributorsFixture = {
  contributors: [
    {
      id: "reg-1",
      githubUsername: "alice",
      stellarAddress: "GADDRALICE12345678901234567890123456789012345678901234",
      trustlineReady: true,
      trustlineAuthorized: true,
      verified: true,
      funded: true,
      xlmBalance: "10",
      spendableXlmBalance: "7",
      lastCheckedAt: new Date().toISOString(),
      readiness: "ready",
    },
    {
      id: "reg-2",
      githubUsername: "bob",
      stellarAddress: "GADDRBOBBBB12345678901234567890123456789012345678901234",
      trustlineReady: true,
      trustlineAuthorized: true,
      verified: false,
      funded: true,
      xlmBalance: "1.2",
      spendableXlmBalance: "0.2",
      lastCheckedAt: new Date().toISOString(),
      readiness: "low_reserve",
    },
    {
      id: "reg-3",
      githubUsername: "charlie",
      stellarAddress: "GADDRCHARLIECCC12345678901234567890123456789012345678",
      trustlineReady: false,
      trustlineAuthorized: false,
      verified: false,
      funded: false,
      xlmBalance: "0",
      spendableXlmBalance: "0",
      lastCheckedAt: null,
      readiness: "not_ready",
    },
  ],
};

const networkFixture = {
  horizonUrl: "https://horizon-testnet.stellar.org",
  horizonNetwork: "testnet",
  sorobanUrl: "https://soroban-testnet.stellar.org",
  sorobanNetwork: "testnet",
  sorobanContractConfigured: false,
  mismatched: false,
  warnings: [],
};

const sorobanFixture = { events: [], latestLedger: 0, errors: [] };
const statsFixture = { totalContributors: 3, readyCount: 1, readyPercent: 33 };

// ── Helpers ───────────────────────────────────────────────────────────────

async function setupDashboard(page: Parameters<typeof interceptApi>[0]) {
  await mockMaintainerSession(page);
  await interceptApi(page, "**/api/contributors/paginated**", {
    ...contributorsFixture,
    total: contributorsFixture.contributors.length,
    hasMore: false,
  });
  await interceptApi(page, "**/api/settings/network", networkFixture);
  await interceptApi(page, "**/api/soroban/events", sorobanFixture);
  await interceptApi(page, "**/api/stats", statsFixture);
}

// ── Dashboard access ──────────────────────────────────────────────────────

test.describe("Maintainer dashboard — access control", () => {
  test("unauthenticated users are redirected away from /dashboard", async ({ page }) => {
    // No session mock → NextAuth /api/auth/session returns 200 with no user
    await page.route("**/api/auth/session", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({}),
      });
    });

    await page.goto("/dashboard");
    // Middleware redirects non-authenticated visitors
    await expect(page).not.toHaveURL(/\/dashboard/);
  });

  test("non-maintainer contributors cannot access /dashboard", async ({ page }) => {
    await mockContributorSession(page);
    await page.goto("/dashboard");
    // Middleware redirects non-maintainers to /register?error=maintainer
    await expect(page).toHaveURL(/register/);
  });

  test("maintainer can load the dashboard page", async ({ page }) => {
    await setupDashboard(page);
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: /maintainer dashboard/i })).toBeVisible();
  });

  // Issue #142 — axe-core accessibility gate.
  //
  // Runs on a fully signed-in maintainer /dashboard with every panel's data
  // mocked (contributors, network config, Soroban events, stats): no real
  // GitHub OAuth, Horizon, or database. `color-contrast` is excluded — it is
  // already covered by the from-scratch WCAG luminance calculator in
  // `src/lib/dark-mode-contrast-audit.test.ts`; see `tests/e2e/axe-baseline.ts`
  // for the full rationale and the (currently empty beyond that) baseline.
  test("the dashboard page has no axe violations beyond the baseline", async ({
    page,
  }) => {
    await setupDashboard(page);
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: /maintainer dashboard/i })
    ).toBeVisible();
    // Wait for the contributor table's async fetch to settle before scanning,
    // so the gate reflects the steady-state page a maintainer sees.
    await expect(page.getByText("@alice")).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const violations = filterBaselineViolations(results.violations);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });
});

// ── Contributor table ─────────────────────────────────────────────────────

test.describe("Maintainer dashboard — contributor table", () => {
  test.beforeEach(async ({ page }) => {
    await setupDashboard(page);
    await page.goto("/dashboard");
    // Wait for contributors to load
    await expect(page.getByText("@alice")).toBeVisible();
  });

  test("shows all contributors by default", async ({ page }) => {
    await expect(page.getByText("@alice")).toBeVisible();
    await expect(page.getByText("@bob")).toBeVisible();
    await expect(page.getByText("@charlie")).toBeVisible();
  });

  test("search filters contributors by username", async ({ page }) => {
    const searchInput = page.getByPlaceholder(/search by username/i);
    await searchInput.fill("alice");

    await expect(page.getByText("@alice")).toBeVisible();
    await expect(page.getByText("@bob")).not.toBeVisible();
    await expect(page.getByText("@charlie")).not.toBeVisible();
  });

  test("search is case-insensitive", async ({ page }) => {
    const searchInput = page.getByPlaceholder(/search by username/i);
    await searchInput.fill("ALICE");
    await expect(page.getByText("@alice")).toBeVisible();
    await expect(page.getByText("@bob")).not.toBeVisible();
  });

  test("searching by partial Stellar address works", async ({ page }) => {
    const searchInput = page.getByPlaceholder(/search by username/i);
    await searchInput.fill("GADDRBOBBBB");
    await expect(page.getByText("@bob")).toBeVisible();
    await expect(page.getByText("@alice")).not.toBeVisible();
  });

  test("no-match search shows an empty state message", async ({ page }) => {
    const searchInput = page.getByPlaceholder(/search by username/i);
    await searchInput.fill("zzz_no_match_zzz");
    await expect(page.getByText(/no contributors match/i)).toBeVisible();
  });

  test("clearing search restores all contributors", async ({ page }) => {
    const searchInput = page.getByPlaceholder(/search by username/i);
    await searchInput.fill("alice");
    await expect(page.getByText("@bob")).not.toBeVisible();

    await searchInput.clear();
    await expect(page.getByText("@bob")).toBeVisible();
    await expect(page.getByText("@charlie")).toBeVisible();
  });

  test("'Ready' filter shows only ready contributors", async ({ page }) => {
    await page.getByRole("button", { name: /✅ Ready/i }).click();

    await expect(page.getByText("@alice")).toBeVisible();
    await expect(page.getByText("@bob")).not.toBeVisible();
    await expect(page.getByText("@charlie")).not.toBeVisible();
  });

  test("'Needs attention' filter hides ready contributors", async ({ page }) => {
    await page.getByRole("button", { name: /❌ Needs attention/i }).click();

    await expect(page.getByText("@alice")).not.toBeVisible();
    // low_reserve and not_ready should appear
    await expect(page.getByText("@bob")).toBeVisible();
    await expect(page.getByText("@charlie")).toBeVisible();
  });

  test("'Low reserve' filter shows only low-reserve contributors", async ({ page }) => {
    await page.getByRole("button", { name: /⚠️ Low reserve/i }).click();

    await expect(page.getByText("@bob")).toBeVisible();
    await expect(page.getByText("@alice")).not.toBeVisible();
    await expect(page.getByText("@charlie")).not.toBeVisible();
  });

  test("column toggle panel opens and hides a column", async ({ page }) => {
    // Stellar address column is visible by default
    const addressHeader = page.getByRole("columnheader", { name: /stellar address/i });
    await expect(addressHeader).toBeVisible();

    // Open column picker
    await page.getByRole("button", { name: /columns/i }).click();

    // Toggle off "Stellar address"
    await page.getByRole("button", { name: /Stellar address/i }).click();

    // Column header should be gone
    await expect(addressHeader).not.toBeVisible();
  });

  test("toggling a hidden column back on restores it", async ({ page }) => {
    await page.getByRole("button", { name: /columns/i }).click();

    // Spendable XLM is hidden by default — toggle it on
    await page.getByRole("button", { name: /Spendable XLM/i }).click();

    await expect(
      page.getByRole("columnheader", { name: /spendable xlm/i })
    ).toBeVisible();
  });
});

// ── Re-check action ───────────────────────────────────────────────────────

test.describe("Maintainer dashboard — re-check action", () => {
  test("re-check all button triggers POST /api/contributors", async ({ page }) => {
    await setupDashboard(page);

    let recheckCalled = false;
    await page.route("**/api/contributors", async (route) => {
      if (route.request().method() === "POST") {
        recheckCalled = true;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ refreshed: 3, ...contributorsFixture }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(contributorsFixture),
        });
      }
    });

    await page.goto("/dashboard");
    await expect(page.getByText("@alice")).toBeVisible();

    await page.getByRole("button", { name: /re-check all/i }).click();
    await expect(async () => {
      expect(recheckCalled).toBe(true);
    }).toPass();
  });
});

// ── Admin metrics page ────────────────────────────────────────────────────

const metricsFixture = {
  contributors: {
    total: 3,
    ready: 1,
    readyPercent: 33,
    byStatus: { ready: 1, low_reserve: 1, not_ready: 1 },
  },
  audit: {
    recentEntries: 2,
    byAction: { "recheck.single": 1, "recheck.batch": 1 },
    latestAt: new Date().toISOString(),
  },
  config: {
    rateLimitWindowMs: 60000,
    rateLimitMaxRequests: 10,
    circuitBreakerFailureThreshold: 5,
    circuitBreakerRecoveryMs: 30000,
    staleCsvMaxAgeMs: 86400000,
    horizonUrl: "https://horizon-testnet.stellar.org",
    sorobanContractConfigured: false,
  },
};

test.describe("Admin metrics page", () => {
  test("non-maintainer cannot access /dashboard/metrics", async ({ page }) => {
    await mockContributorSession(page);
    await page.goto("/dashboard/metrics");
    await expect(page).toHaveURL(/register/);
  });

  test("maintainer sees the metrics page with contributor counts", async ({ page }) => {
    await mockMaintainerSession(page);
    await interceptApi(page, "**/api/metrics", metricsFixture);

    await page.goto("/dashboard/metrics");

    await expect(
      page.getByRole("heading", { name: /admin metrics/i })
    ).toBeVisible();

    // Contributor readiness breakdown should be visible
    await expect(page.getByText("1")).toBeVisible(); // ready count
  });

  test("metrics page shows operational config values", async ({ page }) => {
    await mockMaintainerSession(page);
    await interceptApi(page, "**/api/metrics", metricsFixture);

    await page.goto("/dashboard/metrics");
    await expect(page.getByText(/rate limit/i)).toBeVisible();
    await expect(page.getByText(/circuit breaker/i)).toBeVisible();
  });

  test("metrics page shows an error state when API fails", async ({ page }) => {
    await mockMaintainerSession(page);
    await interceptApi(page, "**/api/metrics", { error: "Forbidden" }, 403);

    await page.goto("/dashboard/metrics");
    await expect(page.getByText(/failed to load metrics/i)).toBeVisible();
  });
});


// ── Landing page (/) ──────────────────────────────────────────────────

test.describe("Landing page", () => {
  test("unauthenticated users see the landing page", async ({ page }) => {
    // Mock no session
    await page.route("**/api/auth/session", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({}),
      });
    });

    await page.goto("/");
    // Should see landing page content
    await expect(page).toHaveURL(/^\/$|register/);
  });

  test("authenticated contributors see CTA to register or dashboard", async ({ page }) => {
    await mockContributorSession(page);
    await page.goto("/");
    // Should see some landing content or be redirected appropriately
    await expect(page).not.toHaveURL(/\/dashboard/);
  });

  test("authenticated maintainers see dashboard link on landing", async ({ page }) => {
    await mockMaintainerSession(page);
    await page.goto("/");
    // Maintainer landing should show dashboard link
    const dashboardLink = page.getByRole("link", { name: /dashboard/i });
    await expect(dashboardLink).toBeVisible();
  });
});

// ── Register page (/register) ─────────────────────────────────────────

const networkFixtureForRegister = {
  horizonUrl: "https://horizon-testnet.stellar.org",
  horizonNetwork: "testnet",
  sorobanUrl: "https://soroban-testnet.stellar.org",
  sorobanNetwork: "testnet",
  sorobanContractConfigured: false,
  mismatched: false,
  warnings: [],
};

test.describe("Register page", () => {
  test("unauthenticated users can view the register page", async ({ page }) => {
    await page.route("**/api/auth/session", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({}),
      });
    });

    await page.goto("/register");
    await expect(page).toHaveURL(/register/);
  });

  test("register page has GitHub OAuth button", async ({ page }) => {
    await page.route("**/api/auth/session", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({}),
      });
    });

    await page.goto("/register");
    const oauthButton = page.getByRole("button", { name: /github|sign in/i });
    await expect(oauthButton).toBeVisible();
  });

  test("register page shows address lookup form", async ({ page }) => {
    await page.route("**/api/auth/session", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({}),
      });
    });
    await interceptApi(page, "**/api/settings/network", networkFixtureForRegister);

    await page.goto("/register");
    const addressInput = page.getByPlaceholder(/stellar address|G[A-Z0-9]{55}/i);
    await expect(addressInput).toBeVisible();
  });

  test("register page shows error when maintainer-only error param is present", async ({ page }) => {
    await page.route("**/api/auth/session", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({}),
      });
    });

    await page.goto("/register?error=maintainer");
    await expect(page.getByText(/maintainer|access|permission|denied/i)).toBeVisible();
  });

  test("register page validates Stellar address input", async ({ page }) => {
    await page.route("**/api/auth/session", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({}),
      });
    });
    await interceptApi(page, "**/api/settings/network", networkFixtureForRegister);

    await page.goto("/register");
    const addressInput = page.getByPlaceholder(/stellar address|G[A-Z0-9]{55}/i);
    const submitButton = page.getByRole("button", { name: /check|lookup|verify/i });

    // Try invalid address
    await addressInput.fill("INVALID");
    await expect(submitButton).toBeDisabled();
  });
});

// ── Settings page (/dashboard/settings) ───────────────────────────────

const settingsAuditFixture = {
  entries: [
    {
      id: "audit-1",
      action: "settings.viewed",
      userId: "maintainer-1",
      details: { path: "/dashboard/settings" },
      createdAt: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: "audit-2",
      action: "settings.network.checked",
      userId: "maintainer-1",
      details: { horizonUrl: "https://horizon-testnet.stellar.org" },
      createdAt: new Date(Date.now() - 7200000).toISOString(),
    },
  ],
};

async function setupSettingsPage(page: Parameters<typeof interceptApi>[0]) {
  await mockMaintainerSession(page);
  await interceptApi(page, "**/api/settings/network", networkFixtureForRegister);
  await interceptApi(page, "**/api/audit*", settingsAuditFixture);
  await interceptApi(page, "**/api/auth/session-info", {
    session: {
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      expiresInSeconds: 86400,
      maxAgeSeconds: 86400,
      strategy: "jwt",
    },
  });
  await interceptApi(page, "**/api/settings/api-keys", { keys: [] });
  await interceptApi(page, "**/api/registrations/deleted", { registrations: [] });
}

test.describe("Settings page", () => {
  test("non-maintainer cannot access /dashboard/settings", async ({ page }) => {
    await mockContributorSession(page);
    await page.goto("/dashboard/settings");
    await expect(page).toHaveURL(/register/);
  });

  test("maintainer can load settings page", async ({ page }) => {
    await setupSettingsPage(page);

    await page.goto("/dashboard/settings");
    await expect(
      page.getByRole("heading", { name: /settings|configuration/i })
    ).toBeVisible();
  });

  test("settings page displays network configuration", async ({ page }) => {
    await setupSettingsPage(page);

    await page.goto("/dashboard/settings");
    await expect(page.getByText(/horizon|network|testnet/i)).toBeVisible();
  });

  test("settings page shows audit log entries", async ({ page }) => {
    await setupSettingsPage(page);

    await page.goto("/dashboard/settings");
    // Should show audit entries (action names or timestamps)
    const auditSection = page.locator("text=/audit|history|log/i");
    await expect(auditSection).toBeVisible();
  });

  test("settings page handles network error gracefully", async ({ page }) => {
    await mockMaintainerSession(page);
    await interceptApi(page, "**/api/settings/network", { error: "Network error" }, 500);
    await interceptApi(page, "**/api/audit*", { error: "Network error" }, 500);
    await interceptApi(page, "**/api/auth/session-info", { error: "Network error" }, 500);
    await interceptApi(page, "**/api/settings/api-keys", { error: "Network error" }, 500);
    await interceptApi(page, "**/api/registrations/deleted", { error: "Network error" }, 500);

    await page.goto("/dashboard/settings");
    // Page should show but may display error state
    await expect(page).toHaveURL(/dashboard\/settings/);
  });
});

// ── Webhook replay form (/dashboard/settings) ─────────────────────────

test.describe("Settings page — GitHub org webhook replay form", () => {
  test.beforeEach(async ({ page }) => {
    await setupSettingsPage(page);
  });

  test("renders webhook replay form with default payload and input controls", async ({
    page,
  }) => {
    await page.goto("/dashboard/settings");

    await expect(
      page.getByRole("heading", { name: /github org webhook replay/i })
    ).toBeVisible();

    const payloadTextarea = page.getByLabel(/event payload/i);
    await expect(payloadTextarea).toBeVisible();
    await expect(payloadTextarea).toHaveValue(/octocat/);

    const signatureInput = page.getByLabel(/optional signature/i);
    await expect(signatureInput).toBeVisible();

    const replayButton = page.getByRole("button", { name: /replay event/i });
    await expect(replayButton).toBeVisible();
    await expect(replayButton).toBeEnabled();
  });

  test("submits valid replay and displays success feedback", async ({ page }) => {
    let capturedBody = "";
    let capturedSignature: string | null = null;

    await page.route("**/api/webhooks/github-org-membership/replay", async (route) => {
      const request = route.request();
      capturedBody = request.postData() ?? "";
      capturedSignature = request.headers()["x-hub-signature-256"] ?? null;

      await route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({
          status: "processed",
          event: "member_added",
        }),
      });
    });

    await page.goto("/dashboard/settings");

    const signatureInput = page.getByLabel(/optional signature/i);
    await signatureInput.fill("sha256=abcdef1234567890");

    const replayButton = page.getByRole("button", { name: /replay event/i });
    await replayButton.click();

    // Verify success feedback appears
    const statusFeedback = page.getByTestId("webhook-replay-status");
    await expect(statusFeedback).toBeVisible();
    await expect(statusFeedback).toHaveText(/replay accepted for processed\./i);

    // Verify sent payload and header
    expect(capturedBody).toContain("octocat");
    expect(capturedSignature).toBe("sha256=abcdef1234567890");
  });

  test("displays validation error when submit fails with 400 Bad Request", async ({
    page,
  }) => {
    await page.route("**/api/webhooks/github-org-membership/replay", async (route) => {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Invalid payload JSON: unexpected token",
        }),
      });
    });

    await page.goto("/dashboard/settings");

    const payloadTextarea = page.getByLabel(/event payload/i);
    await payloadTextarea.fill('{ "invalid": json }');

    const replayButton = page.getByRole("button", { name: /replay event/i });
    await replayButton.click();

    // Verify error feedback appears without crashing
    const statusFeedback = page.getByTestId("webhook-replay-status");
    await expect(statusFeedback).toBeVisible();
    await expect(statusFeedback).toHaveText(/invalid payload json: unexpected token/i);

    // Button should be re-enabled after request finishes
    await expect(replayButton).toBeEnabled();
  });

  test("displays error feedback when replay is rejected as unauthorized (403)", async ({
    page,
  }) => {
    await page.route("**/api/webhooks/github-org-membership/replay", async (route) => {
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Unauthorized",
        }),
      });
    });

    await page.goto("/dashboard/settings");

    const signatureInput = page.getByLabel(/optional signature/i);
    await signatureInput.fill("sha256=invalid_signature");

    const replayButton = page.getByRole("button", { name: /replay event/i });
    await replayButton.click();

    const statusFeedback = page.getByTestId("webhook-replay-status");
    await expect(statusFeedback).toBeVisible();
    await expect(statusFeedback).toHaveText(/unauthorized/i);
  });

  test("handles server failure (500) gracefully without crashing UI", async ({
    page,
  }) => {
    await page.route("**/api/webhooks/github-org-membership/replay", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Internal Server Error",
        }),
      });
    });

    await page.goto("/dashboard/settings");

    const replayButton = page.getByRole("button", { name: /replay event/i });
    await replayButton.click();

    const statusFeedback = page.getByTestId("webhook-replay-status");
    await expect(statusFeedback).toBeVisible();
    await expect(statusFeedback).toHaveText(/internal server error/i);
    await expect(replayButton).toBeEnabled();
  });
});
