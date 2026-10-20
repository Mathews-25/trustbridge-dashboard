/**
 * Issue #152 — end-to-end coverage of the contributor register journey.
 *
 * This is the path that actually matters: sign in, paste a Stellar address,
 * see what the dashboard makes of it, save it, and copy the Freighter ownership
 * proof. Unit tests cover each piece; only an E2E catches the wiring between
 * them — the debounce that fires `/api/check`, the mutation that invalidates
 * the registration query, the clipboard write behind the copy button.
 *
 * Nothing here talks to GitHub, Horizon, or a real Freighter extension:
 *   • The session is a locally-signed NextAuth JWT (see `tests/e2e/env.ts`).
 *   • `/api/check` and `/api/register` are fulfilled from fixtures.
 *   • Freighter is a `window.freighterApi` stub injected before page scripts.
 *
 * Selectors are `data-testid` throughout — the copy on this page is the subject
 * of issue #151 and will keep moving.
 */

import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page } from "@playwright/test";

import { filterBaselineViolations } from "./axe-baseline";
import { interceptApi, signInAsContributor } from "./helpers";

// ── Fixtures ──────────────────────────────────────────────────────────────

const READY_ADDRESS =
  "GAREADY7777777777777777777777777777777777777777777777777";
const NOT_READY_ADDRESS =
  "GANOTREADY55555555555555555555555555555555555555555555555";

const readyCheck = {
  funded: true,
  trustline: true,
  trustline_authorized: true,
  verified: true,
  xlm_balance: "12.5",
  spendable_xlm_balance: "10.5",
  usdc_balance: "0",
  errors: [],
  readiness: "ready",
};

const notReadyCheck = {
  funded: false,
  trustline: false,
  trustline_authorized: false,
  verified: false,
  xlm_balance: "0",
  spendable_xlm_balance: "0",
  usdc_balance: "0",
  errors: [],
  readiness: "not_ready",
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

interface RegisterApiOptions {
  /** Readiness payload returned by `/api/check`. */
  check?: unknown;
  /** Registration returned by `GET /api/register` before any save. */
  existing?: unknown;
  /** Make `POST /api/register` fail with this message. */
  saveError?: string;
}

/**
 * Stand up every network call the register page makes.
 *
 * `GET /api/register` is served from a mutable fixture so that saving actually
 * changes what a refetch returns — the "current registration" card only appears
 * if the invalidate-and-refetch wiring works.
 */
async function mockRegisterApis(page: Page, options: RegisterApiOptions = {}) {
  const { check = readyCheck, existing = null, saveError } = options;

  const saved: { registration: unknown } = { registration: existing };
  const savePayloads: Array<Record<string, unknown>> = [];

  await interceptApi(page, "**/api/settings/network", networkFixture);
  await interceptApi(page, "**/api/stats", {
    totalContributors: 1,
    readyCount: 1,
    readyPercent: 100,
  });

  await page.route("**/api/check", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(check),
    });
  });

  await page.route("**/api/register", async (route) => {
    const request = route.request();

    if (request.method() === "POST") {
      const payload = (request.postDataJSON() ?? {}) as Record<string, unknown>;
      savePayloads.push(payload);

      if (saveError) {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ error: saveError }),
        });
        return;
      }

      saved.registration = {
        stellarAddress: payload.stellarAddress,
        readiness: (check as { readiness: string }).readiness,
      };

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ registration: saved.registration }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        saved.registration ? { registration: saved.registration } : {}
      ),
    });
  });

  return { savePayloads };
}

interface PrivacySettingsFixture {
  profilePublic: boolean;
  showStellarAddress: boolean;
}

async function mockProfilePrivacyApi(
  page: Page,
  initial: PrivacySettingsFixture = {
    profilePublic: false,
    showStellarAddress: false,
  }
) {
  let settings = { ...initial };
  const patchPayloads: PrivacySettingsFixture[] = [];

  await page.route("**/api/profile", async (route) => {
    if (route.request().method() === "PATCH") {
      const payload = route.request().postDataJSON() as PrivacySettingsFixture;
      patchPayloads.push(payload);
      settings = {
        profilePublic: payload.profilePublic,
        showStellarAddress: payload.profilePublic
          ? payload.showStellarAddress
          : false,
      };
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ settings }),
    });
  });

  return { patchPayloads };
}

/** Pretend the Freighter extension is installed in this page. */
async function installFreighterStub(page: Page) {
  await page.addInitScript(() => {
    const signed: string[] = [];
    (window as unknown as Record<string, unknown>).freighterApi = {
      signMessage: async (message: string) => {
        signed.push(message);
        (window as unknown as Record<string, unknown>).__signedMessages = signed;
        return { signedMessage: `signature-for:${message.length}` };
      },
    };
  });
}

// ── Access ────────────────────────────────────────────────────────────────

test.describe("Register page — access", () => {
  test("an unauthenticated visitor is bounced to sign-in", async ({ page }) => {
    await page.goto("/register");

    // Middleware guards /register; the register form must not render.
    await expect(page.getByTestId("register-page")).toHaveCount(0);
  });

  test("a signed-in contributor reaches the register form", async ({
    page,
    context,
  }) => {
    await signInAsContributor(context, page);
    await mockRegisterApis(page);

    await page.goto("/register");

    await expect(page.getByTestId("register-page")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /contributor registration/i })
    ).toBeVisible();
    // Scoped: the handle also appears in the header and in the proof challenge.
    await expect(
      page.getByTestId("register-page").getByText("@contributor", { exact: true })
    ).toBeVisible();
  });

  // Issue #142 — axe-core accessibility gate.
  //
  // Runs on a fully signed-in, fully mocked /register: no real GitHub OAuth,
  // no real Horizon/Freighter calls. `color-contrast` is excluded here — it is
  // already covered by the from-scratch WCAG luminance calculator in
  // `src/lib/dark-mode-contrast-audit.test.ts`; see `tests/e2e/axe-baseline.ts`
  // for the full rationale and the (currently empty beyond that) baseline.
  test("the register page has no axe violations beyond the baseline", async ({
    page,
    context,
  }) => {
    await signInAsContributor(context, page);
    await mockRegisterApis(page);

    await page.goto("/register");
    await expect(page.getByTestId("register-page")).toBeVisible();
    // Let the async panels (network config, wallet stepper) settle before
    // scanning, so the gate reflects the steady-state page a contributor sees.
    await expect(page.getByTestId("trustline-guidance")).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const violations = filterBaselineViolations(results.violations);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  test("the maintainer-only redirect explains itself", async ({
    page,
    context,
  }) => {
    await signInAsContributor(context, page);
    await mockRegisterApis(page);

    await page.goto("/register?error=maintainer");

    await expect(page.getByTestId("maintainer-error")).toBeVisible();
    // The contributor can still register despite the redirect.
    await expect(page.getByTestId("stellar-address-input")).toBeVisible();
  });
});

// ── Address entry and the readiness check ─────────────────────────────────

test.describe("Register page — address check", () => {
  test.beforeEach(async ({ page, context }) => {
    await signInAsContributor(context, page);
  });

  test("pasting a ready address shows the ready badge and next step", async ({
    page,
  }) => {
    await mockRegisterApis(page, { check: readyCheck });
    await page.goto("/register");

    await page.getByTestId("stellar-address-input").fill(READY_ADDRESS);

    const result = page.getByTestId("address-check-result");
    await expect(result).toBeVisible();
    await expect(page.getByTestId("readiness-badge-ready")).toBeVisible();
    await expect(page.getByTestId("next-action-copy")).toContainText(
      /nothing to do/i
    );
    await expect(result).toContainText("10.5 XLM");
  });

  test("pasting an unfunded address explains what to do next", async ({
    page,
  }) => {
    await mockRegisterApis(page, { check: notReadyCheck });
    await page.goto("/register");

    await page.getByTestId("stellar-address-input").fill(NOT_READY_ADDRESS);

    await expect(page.getByTestId("readiness-badge-not_ready")).toBeVisible();
    // The reason code for an unfunded account is `fund_account`.
    await expect(page.getByTestId("next-action-copy")).toContainText(
      /send at least 1 XLM/i
    );
  });

  test("the check is sent the pasted address", async ({ page }) => {
    await mockRegisterApis(page);
    await page.goto("/register");

    const checkRequest = page.waitForRequest(
      (request) =>
        request.url().includes("/api/check") && request.method() === "POST"
    );

    await page.getByTestId("stellar-address-input").fill(READY_ADDRESS);

    const request = await checkRequest;
    expect(request.postDataJSON()).toMatchObject({ address: READY_ADDRESS });
  });

  test("the setup guidance is available to a first-time contributor", async ({
    page,
  }) => {
    await mockRegisterApis(page);
    await page.goto("/register");

    const guidance = page.getByTestId("trustline-guidance");
    await expect(guidance).toBeVisible();
    await expect(guidance).toContainText(/turn on usdc/i);
  });
});

// ── Saving ────────────────────────────────────────────────────────────────

test.describe("Register page — saving", () => {
  test.beforeEach(async ({ page, context }) => {
    await signInAsContributor(context, page);
  });

  test("save is disabled until an address is entered", async ({ page }) => {
    await mockRegisterApis(page);
    await page.goto("/register");

    await expect(page.getByTestId("save-registration")).toBeDisabled();

    await page.getByTestId("stellar-address-input").fill(READY_ADDRESS);
    await expect(page.getByTestId("save-registration")).toBeEnabled();
  });

  test("saving posts the address and confirms", async ({ page }) => {
    const { savePayloads } = await mockRegisterApis(page);
    await page.goto("/register");

    await page.getByTestId("stellar-address-input").fill(READY_ADDRESS);
    await page.getByTestId("save-registration").click();

    await expect(page.getByTestId("registration-saved")).toBeVisible();
    expect(savePayloads).toEqual([{ stellarAddress: READY_ADDRESS }]);
  });

  test("the saved address comes back as the current registration", async ({
    page,
  }) => {
    await mockRegisterApis(page);
    await page.goto("/register");

    await expect(page.getByTestId("current-registration")).toHaveCount(0);

    await page.getByTestId("stellar-address-input").fill(READY_ADDRESS);
    await page.getByTestId("save-registration").click();

    // Appears only if the mutation invalidated and refetched the registration.
    await expect(page.getByTestId("current-registration-address")).toHaveText(
      READY_ADDRESS
    );
    await expect(page.getByTestId("readiness-next-step")).toBeVisible();
  });

  test("a rejected save surfaces the server's message", async ({ page }) => {
    await mockRegisterApis(page, {
      saveError: "That Stellar address is already registered",
    });
    await page.goto("/register");

    await page.getByTestId("stellar-address-input").fill(READY_ADDRESS);
    await page.getByTestId("save-registration").click();

    await expect(page.getByTestId("registration-error")).toHaveText(
      "That Stellar address is already registered"
    );
    await expect(page.getByTestId("registration-saved")).toHaveCount(0);
  });
});

// ── Profile privacy ──────────────────────────────────────────────────────

test.describe("Register page — profile privacy", () => {
  test.beforeEach(async ({ page, context }) => {
    await signInAsContributor(context, page);
  });

  test("privacy toggles save and persist across reloads", async ({ page }) => {
    const { patchPayloads } = await mockProfilePrivacyApi(page);
    await interceptApi(page, "**/api/address-history", { history: [] });
    await mockRegisterApis(page, {
      existing: { stellarAddress: READY_ADDRESS, readiness: "ready" },
    });
    await page.goto("/register");

    const panel = page.getByTestId("profile-privacy-panel");
    const publicToggle = panel.getByTestId("toggle-profile-public");
    const addressToggle = panel.getByTestId("toggle-show-address");

    await expect(panel).toBeVisible();
    await expect(
      publicToggle,
      "Public profile toggle should start private"
    ).toHaveAttribute("aria-pressed", "false");
    await expect(
      addressToggle,
      "Stellar address should start hidden and unavailable"
    ).toBeDisabled();

    await publicToggle.click();
    await expect(
      publicToggle,
      "Public profile toggle did not enable the profile"
    ).toHaveAttribute("aria-pressed", "true");
    expect(patchPayloads[0], "Public profile toggle sent the wrong settings").toEqual({
      profilePublic: true,
      showStellarAddress: false,
    });

    await page.reload();
    await expect(
      publicToggle,
      "Public profile setting was not persisted after reload"
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      addressToggle,
      "Address visibility should remain off after enabling the public profile"
    ).toHaveAttribute("aria-pressed", "false");

    await addressToggle.click();
    await expect(
      addressToggle,
      "Show Stellar address toggle did not enable address visibility"
    ).toHaveAttribute("aria-pressed", "true");
    expect(patchPayloads[1], "Show Stellar address toggle sent the wrong settings").toEqual({
      profilePublic: true,
      showStellarAddress: true,
    });

    await page.reload();
    await expect(
      addressToggle,
      "Stellar address visibility was not persisted after reload"
    ).toHaveAttribute("aria-pressed", "true");

    await addressToggle.click();
    await expect(
      addressToggle,
      "Hide Stellar address toggle did not hide the address"
    ).toHaveAttribute("aria-pressed", "false");
    expect(patchPayloads[2], "Hide Stellar address toggle sent the wrong settings").toEqual({
      profilePublic: true,
      showStellarAddress: false,
    });

    await page.reload();
    await expect(
      addressToggle,
      "Hidden Stellar address setting was not persisted after reload"
    ).toHaveAttribute("aria-pressed", "false");

    await publicToggle.click();
    await expect(
      publicToggle,
      "Make private toggle did not disable the public profile"
    ).toHaveAttribute("aria-pressed", "false");
    await expect(
      addressToggle,
      "Making the profile private should also hide the Stellar address"
    ).toHaveAttribute("aria-pressed", "false");
    expect(patchPayloads[3], "Make private toggle sent the wrong settings").toEqual({
      profilePublic: false,
      showStellarAddress: false,
    });

    await page.reload();
    await expect(
      publicToggle,
      "Private profile setting was not persisted after reload"
    ).toHaveAttribute("aria-pressed", "false");
    await expect(
      addressToggle,
      "Address visibility should remain off for a private profile"
    ).toBeDisabled();
  });
});

// ── Freighter proof ───────────────────────────────────────────────────────

test.describe("Register page — Freighter ownership proof", () => {
  // Chromium only; the config runs a single chromium project.
  test.use({ permissions: ["clipboard-read", "clipboard-write"] });

  test.beforeEach(async ({ page, context }) => {
    await signInAsContributor(context, page);
  });

  test("copy is unavailable until an address is entered", async ({ page }) => {
    await mockRegisterApis(page);
    await page.goto("/register");

    await expect(page.getByTestId("copy-challenge")).toBeDisabled();
  });

  test("the challenge names the pasted address and the GitHub handle", async ({
    page,
  }) => {
    await mockRegisterApis(page);
    await page.goto("/register");

    await page.getByTestId("stellar-address-input").fill(READY_ADDRESS);

    const challenge = page.getByTestId("freighter-challenge");
    await expect(challenge).toContainText(READY_ADDRESS);
    await expect(challenge).toContainText("@contributor");
    await expect(challenge).toContainText(
      "TrustBridge Freighter ownership proof"
    );
  });

  test("copying puts the challenge on the clipboard", async ({ page }) => {
    await mockRegisterApis(page);
    await page.goto("/register");

    await page.getByTestId("stellar-address-input").fill(READY_ADDRESS);

    const copyButton = page.getByTestId("copy-challenge");
    await expect(copyButton).toBeEnabled();
    await copyButton.click();

    // The button confirms in place …
    await expect(copyButton).toHaveText(/copied challenge/i);

    // … and the clipboard really holds the challenge, not a stale value.
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toContain("TrustBridge Freighter ownership proof");
    expect(clipboard).toContain(READY_ADDRESS);
    expect(clipboard).toContain("@contributor");

    const onScreen = await page
      .getByTestId("freighter-challenge")
      .textContent();
    expect(clipboard.trim()).toBe((onScreen ?? "").trim());
  });

  test("the copy confirmation reverts so a second copy is obvious", async ({
    page,
  }) => {
    await mockRegisterApis(page);
    await page.goto("/register");

    await page.getByTestId("stellar-address-input").fill(READY_ADDRESS);
    await page.getByTestId("copy-challenge").click();

    await expect(page.getByTestId("copy-challenge")).toHaveText(
      /copy challenge/i,
      { timeout: 5_000 }
    );
  });

  test("without Freighter, the page says so and offers copy only", async ({
    page,
  }) => {
    await mockRegisterApis(page);
    await page.goto("/register");

    await expect(page.getByTestId("freighter-detection-status")).toContainText(
      /not detected/i
    );
    await expect(page.getByTestId("sign-challenge")).toHaveCount(0);
    await expect(page.getByTestId("copy-challenge")).toBeVisible();
  });

  test("with Freighter stubbed, the challenge can be signed", async ({
    page,
  }) => {
    await installFreighterStub(page);
    await mockRegisterApis(page);
    await page.goto("/register");

    await expect(page.getByTestId("freighter-detection-status")).toContainText(
      /freighter detected/i
    );

    await page.getByTestId("stellar-address-input").fill(READY_ADDRESS);
    await page.getByTestId("sign-challenge").click();

    await expect(page.getByTestId("sign-challenge")).toHaveText(
      /challenge signed/i
    );

    const signed = await page.evaluate(
      () => (window as unknown as { __signedMessages?: string[] }).__signedMessages
    );
    expect(signed?.[0]).toContain(READY_ADDRESS);
  });
});
