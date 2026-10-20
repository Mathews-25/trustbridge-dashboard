/**
 * Issue #151 — contributor-facing readiness copy.
 *
 * The badge/guidance strings are keyed by `ReadinessStatus` and by reason
 * code, so they get a regression test: completeness, plain-language rules, and
 * — the part that actually bites — agreement between what a badge promises and
 * what `computeNextAction()` will tell the same contributor to do.
 */

import { describe, expect, it } from "vitest";

import {
  computeNextAction,
  WIZARD_ACTION_COPY,
  type WizardAction,
} from "@/lib/action-lookup";
import {
  describeReadiness,
  describeReadinessWithNextStep,
  getReadinessConfig,
  getReadinessNextStep,
  READINESS_CONFIG,
} from "@/lib/readiness";
import type { HorizonCheckResult, ReadinessStatus } from "@/types";

const STATUSES: ReadinessStatus[] = ["ready", "low_reserve", "not_ready"];

const ACTIONS: WizardAction[] = [
  "fund_account",
  "add_trustline",
  "await_trustline_authorization",
  "increase_reserve",
  "none",
];

/**
 * Terms that mean nothing to a contributor arriving from a GitHub issue. They
 * are allowed in copy only when the same string also explains them, which is
 * why each entry carries the phrase that has to sit alongside it.
 */
const JARGON_NEEDING_GLOSS: Array<{ term: RegExp; gloss: RegExp }> = [
  { term: /trustline/i, gloss: /turn on|turned on|opt in|opts in/i },
  { term: /\breserve\b/i, gloss: /deposit|locked|small amount/i },
  { term: /\bhorizon\b/i, gloss: /never allowed/i },
];

/** Raw status codes and API field names must never reach contributor copy. */
const LEAKED_INTERNALS = [
  "low_reserve",
  "not_ready",
  "trustline_authorized",
  "spendable_xlm_balance",
  "reason_code",
];

describe("READINESS_CONFIG — keyed contributor copy", () => {
  it("covers every readiness status", () => {
    expect(Object.keys(READINESS_CONFIG).sort()).toEqual([...STATUSES].sort());
  });

  it.each(STATUSES)("%s has a label, an explanation, and a next step", (status) => {
    const config = getReadinessConfig(status);

    expect(config.label.trim().length).toBeGreaterThan(0);
    expect(config.description.trim().length).toBeGreaterThan(0);
    expect(config.nextStep.trim().length).toBeGreaterThan(0);
    // Full sentences — these are read aloud by screen readers and pasted into
    // support threads, not squeezed into a chip.
    expect(config.description).toMatch(/\.$/);
    expect(config.nextStep).toMatch(/\.$/);
  });

  it.each(STATUSES)("%s copy leaks no internal identifiers", (status) => {
    const config = getReadinessConfig(status);
    const copy = `${config.label} ${config.description} ${config.nextStep}`;

    for (const internal of LEAKED_INTERNALS) {
      expect(copy).not.toContain(internal);
    }
  });

  it.each(STATUSES)("%s explains any Stellar jargon it uses", (status) => {
    const config = getReadinessConfig(status);
    const copy = `${config.description} ${config.nextStep}`;

    for (const { term, gloss } of JARGON_NEEDING_GLOSS) {
      if (term.test(copy)) {
        expect(copy).toMatch(gloss);
      }
    }
  });

  it("keeps badge labels short enough for a table cell", () => {
    for (const status of STATUSES) {
      expect(getReadinessConfig(status).label.length).toBeLessThanOrEqual(20);
    }
  });

  it("gives each status a distinct label", () => {
    const labels = STATUSES.map((status) => getReadinessConfig(status).label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("readiness copy helpers", () => {
  it("describeReadiness returns the plain-language explanation", () => {
    expect(describeReadiness("ready")).toBe(READINESS_CONFIG.ready.description);
  });

  it("getReadinessNextStep returns the what-to-do-next line", () => {
    expect(getReadinessNextStep("low_reserve")).toBe(
      READINESS_CONFIG.low_reserve.nextStep
    );
  });

  it("describeReadinessWithNextStep joins explanation and next step", () => {
    expect(describeReadinessWithNextStep("not_ready")).toBe(
      `${READINESS_CONFIG.not_ready.description} ${READINESS_CONFIG.not_ready.nextStep}`
    );
  });
});

describe("WIZARD_ACTION_COPY — keyed reason-code copy", () => {
  it("covers every reason code", () => {
    expect(Object.keys(WIZARD_ACTION_COPY).sort()).toEqual([...ACTIONS].sort());
  });

  it.each(ACTIONS)("%s copy tells the contributor what to do", (action) => {
    const copy = WIZARD_ACTION_COPY[action];
    expect(copy.trim().length).toBeGreaterThan(0);
    expect(copy).toMatch(/\.$/);
  });

  it.each(ACTIONS)("%s copy leaks no internal identifiers", (action) => {
    for (const internal of LEAKED_INTERNALS) {
      expect(WIZARD_ACTION_COPY[action]).not.toContain(internal);
    }
  });

  it.each(ACTIONS)("%s copy explains any Stellar jargon it uses", (action) => {
    const copy = WIZARD_ACTION_COPY[action];
    for (const { term, gloss } of JARGON_NEEDING_GLOSS) {
      if (term.test(copy)) {
        expect(copy).toMatch(gloss);
      }
    }
  });
});

// ── Accuracy: badge copy vs. the reason code the same account produces ──────

function check(overrides: Partial<HorizonCheckResult>): HorizonCheckResult {
  return {
    funded: false,
    trustline: false,
    trustline_authorized: false,
    verified: false,
    xlm_balance: "0",
    spendable_xlm_balance: "0",
    usdc_balance: "0",
    errors: [],
    readiness: "not_ready",
    ...overrides,
  };
}

describe("badge copy stays accurate against Action reason codes", () => {
  it("every reason code is claimed by exactly one readiness status", () => {
    const claimed = STATUSES.flatMap(
      (status) => getReadinessConfig(status).reasonCodes
    );
    expect(claimed.sort()).toEqual([...ACTIONS].sort());
  });

  const cases: Array<{
    name: string;
    result: HorizonCheckResult;
    expectedAction: WizardAction;
  }> = [
    {
      name: "unfunded account",
      result: check({ readiness: "not_ready" }),
      expectedAction: "fund_account",
    },
    {
      name: "funded account with no trustline",
      result: check({ funded: true, readiness: "not_ready" }),
      expectedAction: "add_trustline",
    },
    {
      name: "trustline awaiting issuer authorization",
      result: check({ funded: true, trustline: true, readiness: "not_ready" }),
      expectedAction: "await_trustline_authorization",
    },
    {
      name: "low reserve",
      result: check({
        funded: true,
        trustline: true,
        trustline_authorized: true,
        readiness: "low_reserve",
      }),
      expectedAction: "increase_reserve",
    },
    {
      name: "ready",
      result: check({
        funded: true,
        trustline: true,
        trustline_authorized: true,
        verified: true,
        readiness: "ready",
      }),
      expectedAction: "none",
    },
  ];

  it.each(cases)(
    "$name: the badge's status lists the reason code the wizard actually returns",
    ({ result, expectedAction }) => {
      const action = computeNextAction(result);
      expect(action).toBe(expectedAction);
      expect(getReadinessConfig(result.readiness).reasonCodes).toContain(action);
    }
  );

  it("only the ready badge says there is nothing to do", () => {
    expect(getReadinessConfig("ready").nextStep).toMatch(/nothing to do/i);
    expect(getReadinessConfig("low_reserve").nextStep).not.toMatch(
      /nothing to do/i
    );
    expect(getReadinessConfig("not_ready").nextStep).not.toMatch(
      /nothing to do/i
    );
  });

  it("the low-balance badge and the increase_reserve reason code both ask for XLM", () => {
    expect(getReadinessConfig("low_reserve").nextStep).toMatch(/XLM/);
    expect(WIZARD_ACTION_COPY.increase_reserve).toMatch(/XLM/);
  });

  it("the not-ready badge does not promise a payout can arrive", () => {
    expect(getReadinessConfig("not_ready").description).toMatch(
      /cannot receive/i
    );
  });
});
