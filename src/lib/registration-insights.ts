import { computeNextAction, WIZARD_ACTION_COPY } from "@/lib/action-lookup";
import { DEFAULT_ASSET } from "@/lib/constants";

import type { HorizonCheckResult, HorizonDebugInfo, WalletProofInfo } from "@/types";

interface DebugInput {
  funded: boolean;
  trustlineReady: boolean;
  trustlineAuthorized: boolean;
  readiness: HorizonCheckResult["readiness"];
  xlmBalance: string;
  spendableXlmBalance: string;
  lastCheckedAt?: string | null;
}

function trimHandle(githubUsername?: string | null): string | null {
  const normalized = githubUsername?.trim().replace(/^@+/, "");
  return normalized ? normalized : null;
}

export function buildFreighterProofChallenge(
  stellarAddress?: string | null,
  githubUsername?: string | null
): string {
  const handle = trimHandle(githubUsername);
  const address = stellarAddress?.trim() || "not-yet-provided";

  return [
    "TrustBridge Freighter ownership proof",
    handle ? `GitHub handle: @${handle}` : "GitHub handle: unavailable",
    `Stellar address: ${address}`,
    `Asset context: ${DEFAULT_ASSET.code}`,
    "Purpose: confirm control of the payout wallet before Wave disbursement.",
  ].join("\n");
}

export function buildWalletProofInfo(
  stellarAddress?: string | null,
  githubUsername?: string | null
): WalletProofInfo {
  return {
    provider: "Freighter",
    method: "signMessage",
    challenge: buildFreighterProofChallenge(stellarAddress, githubUsername),
    instructions: [
      "Open Freighter and unlock the wallet that holds your payout address.",
      "Sign the exact challenge text shown here with Freighter's message-signing flow.",
      "Keep the signed message and signer address ready for maintainer review.",
    ],
    fallback:
      "If Freighter is unavailable, use the same address in another Stellar wallet and share the signed challenge through maintainer support.",
  };
}

export function buildHorizonDebugInfo(input: DebugInput): HorizonDebugInfo {
  const nextAction = computeNextAction({
    funded: input.funded,
    trustline: input.trustlineReady,
    trustline_authorized: input.trustlineAuthorized,
    readiness: input.readiness,
  });

  const warnings: string[] = [];
  if (!input.funded) warnings.push("Account is not funded on Stellar.");
  if (!input.trustlineReady) {
    warnings.push(`Required ${DEFAULT_ASSET.code} trustline is missing.`);
  }
  if (input.trustlineReady && !input.trustlineAuthorized) {
    warnings.push("Trustline exists but issuer authorization is still pending.");
  }
  if (input.readiness === "low_reserve") {
    warnings.push("Spendable XLM is below the configured reserve threshold.");
  }

  return {
    summary:
      warnings[0] ?? "All Horizon readiness checks currently pass for this row.",
    nextAction: WIZARD_ACTION_COPY[nextAction],
    checkpoints: [
      {
        label: "Funded",
        value: input.funded ? "Yes" : "No",
      },
      {
        label: `${DEFAULT_ASSET.code} trustline`,
        value: input.trustlineReady ? "Present" : "Missing",
      },
      {
        label: "Trustline authorization",
        value: input.trustlineReady
          ? input.trustlineAuthorized
            ? "Authorized"
            : "Pending issuer authorization"
          : "Not applicable",
      },
      {
        label: "Raw XLM balance",
        value: `${input.xlmBalance} XLM`,
      },
      {
        label: "Spendable XLM",
        value: `${input.spendableXlmBalance} XLM`,
      },
      {
        label: "Last checked",
        value: input.lastCheckedAt ?? "Never",
      },
    ],
    warnings,
  };
}
