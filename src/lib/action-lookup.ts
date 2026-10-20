import type { HorizonCheckResult } from "@/types";

/** Pure helpers — safe for client and server; no stellar-sdk. */

export type WizardAction =
  | "fund_account"
  | "add_trustline"
  | "await_trustline_authorization"
  | "increase_reserve"
  | "none";

export interface ActionLookupResult extends HorizonCheckResult {
  nextAction: WizardAction;
}

/**
 * Plain-language "what to do next", keyed by reason code.
 *
 * These strings are read by contributors who may never have used Stellar, so
 * each one names the jargon term once, in parentheses, and then explains the
 * step in ordinary words. Keep them aligned with `docs/READINESS_MODEL.md` and
 * with `READINESS_CONFIG` in `src/lib/readiness.ts` — `readiness-copy.test.ts`
 * asserts that every reason code stays reachable and consistently worded.
 */
export const WIZARD_ACTION_COPY: Record<WizardAction, string> = {
  fund_account:
    "Send at least 1 XLM to this address. A Stellar wallet does not exist until someone puts a little XLM in it, and payouts cannot reach a wallet that does not exist yet.",
  add_trustline:
    "Turn on USDC for this wallet (Stellar calls this \"adding a trustline\"). A Stellar wallet has to opt in to each kind of token before it can receive it.",
  await_trustline_authorization:
    "USDC is turned on, but the company that issues USDC has not approved this wallet yet. Wait for that approval — if it takes more than a day, contact the issuer.",
  increase_reserve:
    "Add a little more XLM. Stellar keeps a small amount locked in every wallet as a deposit, and this wallet is below the amount it needs to keep working.",
  none: "Nothing to do — this wallet can receive payouts.",
};

export function computeNextAction(
  result: Pick<
    HorizonCheckResult,
    "funded" | "trustline" | "trustline_authorized" | "readiness"
  >
): WizardAction {
  if (!result.funded) return "fund_account";
  if (!result.trustline) return "add_trustline";
  if (!result.trustline_authorized) return "await_trustline_authorization";
  if (result.readiness === "low_reserve") return "increase_reserve";
  return "none";
}

export function buildActionLookupResult(
  result: HorizonCheckResult
): ActionLookupResult {
  return {
    ...result,
    nextAction: computeNextAction(result),
  };
}
