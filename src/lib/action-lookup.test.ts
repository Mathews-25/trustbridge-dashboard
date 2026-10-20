import { describe, expect, it } from "vitest";

import {
  buildActionLookupResult,
  computeNextAction,
} from "@/lib/action-lookup";
import type { HorizonCheckResult } from "@/types";

function result(overrides: Partial<HorizonCheckResult>): HorizonCheckResult {
  return {
    funded: false,
    trustline: false,
    trustline_authorized: false,
    verified: false,
    xlm_balance: "0",
    spendable_xlm_balance: "0",
    errors: [],
    readiness: "not_ready",
    ...overrides,
  };
}

describe("computeNextAction", () => {
  it("tells an unfunded account to fund itself (success path)", () => {
    expect(
      computeNextAction({
        funded: false,
        trustline: false,
        trustline_authorized: false,
        readiness: "not_ready",
      })
    ).toBe("fund_account");
  });

  it("tells a funded account without a trustline to add one", () => {
    expect(
      computeNextAction({
        funded: true,
        trustline: false,
        trustline_authorized: false,
        readiness: "not_ready",
      })
    ).toBe("add_trustline");
  });

  it("tells a funded account with an unauthorized trustline to wait on the issuer", () => {
    expect(
      computeNextAction({
        funded: true,
        trustline: true,
        trustline_authorized: false,
        readiness: "not_ready",
      })
    ).toBe("await_trustline_authorization");
  });

  it("tells a low-reserve account to top up XLM", () => {
    expect(
      computeNextAction({
        funded: true,
        trustline: true,
        trustline_authorized: true,
        readiness: "low_reserve",
      })
    ).toBe("increase_reserve");
  });

  it("reports no action needed once ready", () => {
    expect(
      computeNextAction({
        funded: true,
        trustline: true,
        trustline_authorized: true,
        readiness: "ready",
      })
    ).toBe("none");
  });
});

describe("buildActionLookupResult", () => {
  it("preserves the underlying Horizon errors on a failure path", () => {
    const horizonResult = result({
      errors: ["Horizon error: rate limited"],
    });

    const lookup = buildActionLookupResult(horizonResult);

    expect(lookup.errors).toEqual(["Horizon error: rate limited"]);
    expect(lookup.nextAction).toBe("fund_account");
  });

  it("merges the computed next action alongside the readiness fields", () => {
    const horizonResult = result({
      funded: true,
      trustline: true,
      trustline_authorized: true,
      xlm_balance: "5",
      readiness: "ready",
    });

    expect(buildActionLookupResult(horizonResult)).toEqual({
      ...horizonResult,
      nextAction: "none",
    });
  });
});
