import { describe, expect, it } from "vitest";

import { WIZARD_ACTION_COPY } from "@/lib/action-lookup";
import {
  buildFreighterProofChallenge,
  buildHorizonDebugInfo,
  buildWalletProofInfo,
} from "@/lib/registration-insights";

describe("registration-insights", () => {
  it("builds a Freighter proof challenge with normalized identity details", () => {
    const challenge = buildFreighterProofChallenge(
      "GABC123",
      "@gidson5"
    );

    expect(challenge).toContain("TrustBridge Freighter ownership proof");
    expect(challenge).toContain("GitHub handle: @gidson5");
    expect(challenge).toContain("Stellar address: GABC123");
  });

  it("returns wallet proof instructions and fallback text", () => {
    const proof = buildWalletProofInfo("GABC123", "gidson5");

    expect(proof.provider).toBe("Freighter");
    expect(proof.method).toBe("signMessage");
    expect(proof.instructions).toHaveLength(3);
    expect(proof.fallback).toContain("Freighter is unavailable");
  });

  it("summarizes failed Horizon checks and recommends the next step", () => {
    const debug = buildHorizonDebugInfo({
      funded: false,
      trustlineReady: false,
      trustlineAuthorized: false,
      readiness: "not_ready",
      xlmBalance: "0",
      spendableXlmBalance: "0",
      lastCheckedAt: null,
    });

    expect(debug.summary).toBe("Account is not funded on Stellar.");
    expect(debug.nextAction).toBe(WIZARD_ACTION_COPY.fund_account);
    expect(debug.warnings).toContain("Required USDC trustline is missing.");
  });

  it("returns a clean ready-state summary when all checks pass", () => {
    const debug = buildHorizonDebugInfo({
      funded: true,
      trustlineReady: true,
      trustlineAuthorized: true,
      readiness: "ready",
      xlmBalance: "12",
      spendableXlmBalance: "10.5",
      lastCheckedAt: "2026-07-26T10:00:00.000Z",
    });

    expect(debug.summary).toContain("All Horizon readiness checks currently pass");
    expect(debug.nextAction).toBe(WIZARD_ACTION_COPY.none);
    expect(debug.warnings).toEqual([]);
  });
});
