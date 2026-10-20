import { test, expect } from "@playwright/test";
import {
  signInAsContributor,
  mockMaintainerSession,
  signInWithSessionCookie,
  interceptApi,
} from "./helpers";

/**
 * Visual regression tests across key views (landing, register, dashboard)
 * in both light and dark color schemes.
 *
 * Flakiness guardrails:
 * - Timestamps, dynamic latency counters, and dates are masked.
 * - API responses are mocked to ensure deterministic UI state.
 * - Font rendering is allowed to settle with full-page screenshots.
 */

test.describe("Visual Regression (Dark & Light)", () => {
  const dynamicMaskSelectors = [
    '[data-testid="last-checked"]',
    '[data-testid="relative-time"]',
    "time",
    ".text-muted-foreground time",
    '[data-testid="horizon-latency"]',
    '[data-testid="audit-timestamp"]',
  ];

  test.describe("Landing Page", () => {
    test("landing page - light mode", async ({ page }) => {
      await page.emulateMedia({ colorScheme: "light" });
      await page.goto("/");
      await page.waitForLoadState("networkidle");

      // Verify essential element is rendered before snapping screenshot
      await expect(page.locator("body")).toBeVisible();

      await expect(page).toHaveScreenshot("landing-light.png", {
        fullPage: true,
        mask: dynamicMaskSelectors.map((sel) => page.locator(sel)),
        maxDiffPixelRatio: 0.05,
      });
    });

    test("landing page - dark mode", async ({ page }) => {
      await page.emulateMedia({ colorScheme: "dark" });
      await page.goto("/");
      await page.waitForLoadState("networkidle");

      await expect(page.locator("body")).toBeVisible();

      await expect(page).toHaveScreenshot("landing-dark.png", {
        fullPage: true,
        mask: dynamicMaskSelectors.map((sel) => page.locator(sel)),
        maxDiffPixelRatio: 0.05,
      });
    });
  });

  test.describe("Register Page (Mock)", () => {
    test("register page - light mode", async ({ context, page }) => {
      await page.emulateMedia({ colorScheme: "light" });

      await signInAsContributor(context, page, {
        id: "contributor-mock",
        githubUsername: "mockuser",
        name: "Mock User",
      });

      await interceptApi(page, "**/api/register", {
        stellarAddress: "GBX7ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCD",
        funded: true,
        trustlineReady: true,
        trustlineAuthorized: true,
        xlmBalance: "10.0000000",
        spendableXlmBalance: "8.5000000",
        readiness: "ready",
        verified: true,
        lastCheckedAt: "2026-09-24T00:00:00.000Z",
      });

      await page.goto("/register");
      await page.waitForLoadState("networkidle");
      await expect(page.locator("body")).toBeVisible();

      await expect(page).toHaveScreenshot("register-light.png", {
        fullPage: true,
        mask: dynamicMaskSelectors.map((sel) => page.locator(sel)),
        maxDiffPixelRatio: 0.05,
      });
    });

    test("register page - dark mode", async ({ context, page }) => {
      await page.emulateMedia({ colorScheme: "dark" });

      await signInAsContributor(context, page, {
        id: "contributor-mock",
        githubUsername: "mockuser",
        name: "Mock User",
      });

      await interceptApi(page, "**/api/register", {
        stellarAddress: "GBX7ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCD",
        funded: true,
        trustlineReady: true,
        trustlineAuthorized: true,
        xlmBalance: "10.0000000",
        spendableXlmBalance: "8.5000000",
        readiness: "ready",
        verified: true,
        lastCheckedAt: "2026-09-24T00:00:00.000Z",
      });

      await page.goto("/register");
      await page.waitForLoadState("networkidle");
      await expect(page.locator("body")).toBeVisible();

      await expect(page).toHaveScreenshot("register-dark.png", {
        fullPage: true,
        mask: dynamicMaskSelectors.map((sel) => page.locator(sel)),
        maxDiffPixelRatio: 0.05,
      });
    });
  });

  test.describe("Dashboard Page (Mock)", () => {
    const mockContributors = [
      {
        id: "mock-1",
        githubUsername: "alice",
        stellarAddress: "GBX7ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCD",
        funded: true,
        trustlineReady: true,
        trustlineAuthorized: true,
        xlmBalance: "25.0000000",
        spendableXlmBalance: "23.0000000",
        readiness: "ready",
        verified: true,
        lastCheckedAt: "2026-09-24T00:00:00.000Z",
      },
      {
        id: "mock-2",
        githubUsername: "bob",
        stellarAddress: "GAY2BCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCD",
        funded: false,
        trustlineReady: false,
        trustlineAuthorized: false,
        xlmBalance: "0.0000000",
        spendableXlmBalance: "0.0000000",
        readiness: "not_ready",
        verified: false,
        lastCheckedAt: "2026-09-24T00:00:00.000Z",
      },
    ];

    test("dashboard page - light mode", async ({ context, page }) => {
      await page.emulateMedia({ colorScheme: "light" });

      const maintainer = {
        id: "maintainer-mock",
        githubUsername: "lead-maintainer",
        name: "Lead Maintainer",
        isMaintainer: true,
      };

      await signInWithSessionCookie(context, maintainer);
      await mockMaintainerSession(page, maintainer);

      await interceptApi(page, "**/api/contributors*", {
        contributors: mockContributors,
        total: mockContributors.length,
        filtered: mockContributors.length,
      });

      await page.goto("/dashboard");
      await page.waitForLoadState("networkidle");
      await expect(page.locator("body")).toBeVisible();

      await expect(page).toHaveScreenshot("dashboard-light.png", {
        fullPage: true,
        mask: dynamicMaskSelectors.map((sel) => page.locator(sel)),
        maxDiffPixelRatio: 0.05,
      });
    });

    test("dashboard page - dark mode", async ({ context, page }) => {
      await page.emulateMedia({ colorScheme: "dark" });

      const maintainer = {
        id: "maintainer-mock",
        githubUsername: "lead-maintainer",
        name: "Lead Maintainer",
        isMaintainer: true,
      };

      await signInWithSessionCookie(context, maintainer);
      await mockMaintainerSession(page, maintainer);

      await interceptApi(page, "**/api/contributors*", {
        contributors: mockContributors,
        total: mockContributors.length,
        filtered: mockContributors.length,
      });

      await page.goto("/dashboard");
      await page.waitForLoadState("networkidle");
      await expect(page.locator("body")).toBeVisible();

      await expect(page).toHaveScreenshot("dashboard-dark.png", {
        fullPage: true,
        mask: dynamicMaskSelectors.map((sel) => page.locator(sel)),
        maxDiffPixelRatio: 0.05,
      });
    });
  });
});

/**
 * Visual Regression — ContributorTable column states
 *
 * Covers:
 * - Default column set (spendableXlmBalance hidden)
 * - All columns visible (column picker enabled)
 * - Column picker panel open
 * - Minimal columns (only GitHub + Status)
 * - All readiness states visible (ready / low_reserve / not_ready)
 * - Banned contributor badge
 *
 * Each scenario is captured in light mode only — dark mode is covered by the
 * existing dashboard suite. Deterministic mock data is used throughout.
 *
 * Flakiness guardrails (same as parent suite):
 * - Timestamps / relative times are masked.
 * - API responses are fully intercepted.
 * - waitForLoadState("networkidle") before every screenshot.
 */

const CONTRIBUTOR_TABLE_MASK = [
  '[data-testid="last-checked"]',
  '[data-testid="relative-time"]',
  "time",
  ".text-muted-foreground time",
  '[data-testid="horizon-latency"]',
];

/** Three contributors covering every readiness state plus a banned entry. */
const COLUMN_TEST_CONTRIBUTORS = [
  {
    id: "col-1",
    githubUsername: "alice",
    stellarAddress: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    funded: true,
    trustlineReady: true,
    trustlineAuthorized: true,
    xlmBalance: "25.0000000",
    spendableXlmBalance: "23.5000000",
    usdcBalance: "100.0000000",
    horizonLatencyMs: 95,
    readiness: "ready",
    verified: true,
    lastCheckedAt: "2026-09-24T00:00:00.000Z",
    banned: false,
  },
  {
    id: "col-2",
    githubUsername: "bob",
    stellarAddress: "GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
    funded: true,
    trustlineReady: true,
    trustlineAuthorized: true,
    xlmBalance: "1.5000000",
    spendableXlmBalance: "0.2000000",
    usdcBalance: "0.0000000",
    horizonLatencyMs: 112,
    readiness: "low_reserve",
    verified: true,
    lastCheckedAt: "2026-09-24T00:00:00.000Z",
    banned: false,
  },
  {
    id: "col-3",
    githubUsername: "carol",
    stellarAddress: "GCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC",
    funded: false,
    trustlineReady: false,
    trustlineAuthorized: false,
    xlmBalance: "0.0000000",
    spendableXlmBalance: "0.0000000",
    usdcBalance: "0.0000000",
    horizonLatencyMs: null,
    readiness: "not_ready",
    verified: false,
    lastCheckedAt: "2026-09-24T00:00:00.000Z",
    banned: false,
  },
  {
    id: "col-4",
    githubUsername: "dave",
    stellarAddress: "GDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD",
    funded: true,
    trustlineReady: false,
    trustlineAuthorized: false,
    xlmBalance: "5.0000000",
    spendableXlmBalance: "3.0000000",
    usdcBalance: "0.0000000",
    horizonLatencyMs: 130,
    readiness: "not_ready",
    verified: false,
    lastCheckedAt: "2026-09-24T00:00:00.000Z",
    banned: true,
    banReason: "Policy violation",
  },
];

/**
 * Intercept all contributor-related API calls used by the dashboard with a
 * deterministic fixture.
 */
async function interceptContributorApis(
  page: Parameters<typeof interceptApi>[0],
  contributors = COLUMN_TEST_CONTRIBUTORS
) {
  const payload = {
    contributors,
    total: contributors.length,
    filtered: contributors.length,
  };
  await interceptApi(page, "**/api/contributors*", payload);
  // The dashboard also fetches /api/soroban/events, /api/settings/network, /api/freeze-status
  await interceptApi(page, "**/api/soroban/events", { events: [], latestLedger: 0, errors: [] });
  await interceptApi(page, "**/api/settings/network", {
    horizonUrl: "https://horizon.stellar.org",
    horizonNetwork: "mainnet",
    sorobanUrl: "https://soroban-testnet.stellar.org",
    sorobanNetwork: "testnet",
    sorobanContractConfigured: false,
    mismatched: false,
    actionAlignment: { aligned: true, warnings: [] },
    warnings: [],
  });
  await interceptApi(page, "**/api/freeze-status", { active: false });
}

async function signInAsMaintainer(
  context: Parameters<typeof signInWithSessionCookie>[0],
  page: Parameters<typeof mockMaintainerSession>[0]
) {
  const maintainer = {
    id: "col-maintainer",
    githubUsername: "column-tester",
    name: "Column Tester",
    isMaintainer: true,
  };
  await signInWithSessionCookie(context, maintainer);
  await mockMaintainerSession(page, maintainer);
}

test.describe("Visual Regression — ContributorTable columns", () => {
  test.describe("Default column set (spendableXlmBalance hidden)", () => {
    test("default columns - light mode", async ({ context, page }) => {
      await page.emulateMedia({ colorScheme: "light" });
      await signInAsMaintainer(context, page);
      await interceptContributorApis(page);

      await page.goto("/dashboard");
      await page.waitForLoadState("networkidle");

      // Scroll to the contributor table so it is fully visible
      const table = page.locator('[data-testid="contributor-table-region"]');
      await table.waitFor({ state: "visible" });
      await table.scrollIntoViewIfNeeded();

      // Confirm spendableXlmBalance column is hidden by default
      await expect(
        page.locator('th:has-text("Spendable XLM")')
      ).not.toBeVisible();

      await expect(table).toHaveScreenshot("contributor-table-default-columns-light.png", {
        mask: CONTRIBUTOR_TABLE_MASK.map((s) => page.locator(s)),
        maxDiffPixelRatio: 0.05,
      });
    });

    test("default columns - dark mode", async ({ context, page }) => {
      await page.emulateMedia({ colorScheme: "dark" });
      await signInAsMaintainer(context, page);
      await interceptContributorApis(page);

      await page.goto("/dashboard");
      await page.waitForLoadState("networkidle");

      const table = page.locator('[data-testid="contributor-table-region"]');
      await table.waitFor({ state: "visible" });
      await table.scrollIntoViewIfNeeded();

      await expect(table).toHaveScreenshot("contributor-table-default-columns-dark.png", {
        mask: CONTRIBUTOR_TABLE_MASK.map((s) => page.locator(s)),
        maxDiffPixelRatio: 0.05,
      });
    });
  });

  test.describe("All columns visible", () => {
    test("all columns enabled via column picker - light mode", async ({ context, page }) => {
      await page.emulateMedia({ colorScheme: "light" });
      await signInAsMaintainer(context, page);
      await interceptContributorApis(page);

      await page.goto("/dashboard");
      await page.waitForLoadState("networkidle");

      const table = page.locator('[data-testid="contributor-table-region"]');
      await table.waitFor({ state: "visible" });
      await table.scrollIntoViewIfNeeded();

      // Open the column picker and enable the hidden Spendable XLM column
      await page.getByRole("button", { name: /columns/i }).click();
      const picker = page.getByTestId("column-picker");
      await expect(picker).toBeVisible();

      const spendableCheckbox = picker.getByText("Spendable XLM");
      const isChecked = await spendableCheckbox
        .locator("input[type=checkbox]")
        .isChecked();
      if (!isChecked) {
        await spendableCheckbox.locator("input[type=checkbox]").check();
      }

      // Close picker to keep screenshot clean
      await page.keyboard.press("Escape");

      await expect(
        page.locator('th:has-text("Spendable XLM")')
      ).toBeVisible();

      await expect(table).toHaveScreenshot("contributor-table-all-columns-light.png", {
        mask: CONTRIBUTOR_TABLE_MASK.map((s) => page.locator(s)),
        maxDiffPixelRatio: 0.05,
      });
    });
  });

  test.describe("Column picker panel open", () => {
    test("column picker open state - light mode", async ({ context, page }) => {
      await page.emulateMedia({ colorScheme: "light" });
      await signInAsMaintainer(context, page);
      await interceptContributorApis(page);

      await page.goto("/dashboard");
      await page.waitForLoadState("networkidle");

      const table = page.locator('[data-testid="contributor-table-region"]');
      await table.waitFor({ state: "visible" });
      await table.scrollIntoViewIfNeeded();

      // Open the column picker
      await page.getByRole("button", { name: /columns/i }).click();
      await expect(page.getByTestId("column-picker")).toBeVisible();

      await expect(table).toHaveScreenshot("contributor-table-column-picker-open-light.png", {
        mask: CONTRIBUTOR_TABLE_MASK.map((s) => page.locator(s)),
        maxDiffPixelRatio: 0.05,
      });
    });
  });

  test.describe("Minimal columns (GitHub + Status only)", () => {
    test("two columns visible - light mode", async ({ context, page }) => {
      await page.emulateMedia({ colorScheme: "light" });
      await signInAsMaintainer(context, page);
      await interceptContributorApis(page);

      await page.goto("/dashboard");
      await page.waitForLoadState("networkidle");

      const table = page.locator('[data-testid="contributor-table-region"]');
      await table.waitFor({ state: "visible" });
      await table.scrollIntoViewIfNeeded();

      // Open the column picker and hide everything except githubUsername and readiness
      await page.getByRole("button", { name: /columns/i }).click();
      const picker = page.getByTestId("column-picker");
      await expect(picker).toBeVisible();

      const columnsToHide = ["Stellar address", "Verified", "XLM", "Last checked"];
      for (const label of columnsToHide) {
        const checkbox = picker.getByText(label).locator("input[type=checkbox]");
        const checked = await checkbox.isChecked();
        if (checked) await checkbox.uncheck();
      }

      await page.keyboard.press("Escape");

      await expect(table).toHaveScreenshot("contributor-table-minimal-columns-light.png", {
        mask: CONTRIBUTOR_TABLE_MASK.map((s) => page.locator(s)),
        maxDiffPixelRatio: 0.05,
      });
    });
  });

  test.describe("All readiness states + banned badge", () => {
    test("ready / low_reserve / not_ready + banned - light mode", async ({ context, page }) => {
      await page.emulateMedia({ colorScheme: "light" });
      await signInAsMaintainer(context, page);
      await interceptContributorApis(page);

      await page.goto("/dashboard");
      await page.waitForLoadState("networkidle");

      const table = page.locator('[data-testid="contributor-table-region"]');
      await table.waitFor({ state: "visible" });
      await table.scrollIntoViewIfNeeded();

      // Verify all four rows are present (3 readiness states + 1 banned)
      await expect(
        table.locator('[data-testid="banned-badge-dave"]')
      ).toBeVisible();

      await expect(table).toHaveScreenshot("contributor-table-all-states-light.png", {
        mask: CONTRIBUTOR_TABLE_MASK.map((s) => page.locator(s)),
        maxDiffPixelRatio: 0.05,
      });
    });

    test("ready / low_reserve / not_ready + banned - dark mode", async ({ context, page }) => {
      await page.emulateMedia({ colorScheme: "dark" });
      await signInAsMaintainer(context, page);
      await interceptContributorApis(page);

      await page.goto("/dashboard");
      await page.waitForLoadState("networkidle");

      const table = page.locator('[data-testid="contributor-table-region"]');
      await table.waitFor({ state: "visible" });
      await table.scrollIntoViewIfNeeded();

      await expect(table).toHaveScreenshot("contributor-table-all-states-dark.png", {
        mask: CONTRIBUTOR_TABLE_MASK.map((s) => page.locator(s)),
        maxDiffPixelRatio: 0.05,
      });
    });
  });

  test.describe("Empty states", () => {
    test("zero contributors empty state - light mode", async ({ context, page }) => {
      await page.emulateMedia({ colorScheme: "light" });
      await signInAsMaintainer(context, page);
      await interceptContributorApis(page, []);

      await page.goto("/dashboard");
      await page.waitForLoadState("networkidle");

      // The zero-empty state renders in place of the table
      const emptyState = page.getByTestId("contributors-zero-empty");
      await expect(emptyState).toBeVisible();

      await expect(emptyState).toHaveScreenshot(
        "contributor-table-zero-empty-light.png",
        { maxDiffPixelRatio: 0.05 }
      );
    });
  });
});
