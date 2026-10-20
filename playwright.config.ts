import { defineConfig, devices } from "@playwright/test";

import { E2E_DATABASE_URL, E2E_NEXTAUTH_SECRET } from "./tests/e2e/env";

/**
 * Playwright configuration for TrustBridge Dashboard maintainer E2E tests.
 *
 * These tests run against a locally-started Next.js dev server.
 * Set E2E_BASE_URL to override the target (useful in CI against a staging URL).
 *
 * To run: npx playwright test
 * To show report: npx playwright show-report
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  fullyParallel: false,
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  // Spin up `next dev` automatically unless E2E_BASE_URL is overridden
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
        // The register spec signs its own NextAuth session cookie, so the dev
        // server has to verify it with the same secret. See tests/e2e/env.ts.
        env: {
          NEXTAUTH_SECRET: E2E_NEXTAUTH_SECRET,
          NEXTAUTH_URL: process.env.NEXTAUTH_URL ?? "http://localhost:3000",
          DATABASE_URL: E2E_DATABASE_URL,
          // Placeholders: `next dev` reads these at import time; no test ever
          // completes a real OAuth round trip.
          GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID ?? "e2e-placeholder",
          GITHUB_CLIENT_SECRET:
            process.env.GITHUB_CLIENT_SECRET ?? "e2e-placeholder",
        },
      },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
