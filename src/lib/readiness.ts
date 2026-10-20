import type { WizardAction } from "@/lib/action-lookup";
import { BASE_RESERVE_XLM, MIN_XLM_BALANCE } from "@/lib/constants";
import type { HorizonCheckResult, ReadinessStatus } from "@/types";

export interface ReadinessDisplayConfig {
  /** Badge text. Short enough to sit in a table cell. */
  label: string;
  variant: "ready" | "warning" | "danger";
  icon: string;
  /**
   * One sentence of plain language explaining what the state means for the
   * contributor. No Stellar vocabulary that is not explained in place.
   */
  description: string;
  /** The single next thing the contributor shouldo. */
  nextStep: string;
  /**
   * Reason codes that can produce this status, in the order
   * `computeNextAction()` checks them. Keeps the badge copy honest against
   * `WIZARD_ACTION_COPY` — see `readiness-copy.test.ts`.
   */
  reasonCodes: WizardAction[];
}

/** Pure helpers — safe for client and server; no stellar-sdk. */

export function parseXlmBalance(xlmBalance: string): number {
  const parsed = Number.parseFloat(xlmBalance ?? "0");
  return Number.isFinite(parsed) ? parsed : 0;
}

export interface SpendableBalanceOptions {
  /** XLM reserved per subentry/sponsorship unit. Defaults to `BASE_RESERVE_XLM`. */
  baseReserve?: number;
  subentryCount?: number;
  numSponsoring?: number;
  numSponsored?: number;
  /** Native balance line's `selling_liabilities`, if any (not spendable). */
  sellingLiabilities?: string;
}

/**
 * Every Stellar account must keep a minimum reserve of
 * `baseReserve * (2 + subentries + sponsoring - sponsored)` locked up, and
 * any XLM committed to open sell offers (`selling_liabilities`) is likewise
 * unavailable for payments. The raw native balance therefore overstates what
 * an account can actually spend — this computes the true spendable amount.
 */
export function computeSpendableXlmBalance(
  rawBalance: string,
  opts: SpendableBalanceOptions = {}
): string {
  const {
    baseReserve = BASE_RESERVE_XLM,
    subentryCount = 0,
    numSponsoring = 0,
    numSponsored = 0,
    sellingLiabilities = "0",
  } = opts;

  const raw = parseXlmBalance(rawBalance);
  const liabilities = parseXlmBalance(sellingLiabilities);
  const reserveUnits = 2 + subentryCount + numSponsoring - numSponsored;
  const reserve = baseReserve * Math.max(0, reserveUnits);

  const spendable = raw - reserve - liabilities;
  return Math.max(0, spendable).toFixed(7);
}

export interface ReadinessOptions {
  minimumBalance?: number;
  /**
   * Whether the trustline is authorized by the asset issuer. A trustline that
   * is present but unauthorized cannot receive the asset, so it is treated as
   * not ready. Defaults to `true` for callers that do not track authorization.
   */
  authorized?: boolean;
  /**
   * Spendable XLM balance (raw balance minus reserve and liabilities). When
   * provided, this is used for the reserve check instead of the raw balance.
   */
  spendableBalance?: string;
}

export function computeReadiness(
  funded: boolean,
  trustline: boolean,
  xlm_balance: string,
  options: ReadinessOptions = {}
): ReadinessStatus {
  const { minimumBalance = MIN_XLM_BALANCE, authorized = true, spendableBalance } = options;
  const balance = parseXlmBalance(
    spendableBalance !== undefined ? spendableBalance : xlm_balance
  );

  // A present-but-unauthorized trustline still fails payments.
  if (funded && trustline && !authorized) return "not_ready";

  if (funded && trustline && balance < minimumBalance) {
    return "low_reserve";
  }
  if (funded && trustline) return "ready";

  return "not_ready";
}

/** On-chain verified: funded, trustline present, and issuer-authorized. */
export function computeVerified(
  funded: boolean,
  trustline: boolean,
  authorized: boolean
): boolean {
  return funded && trustline && authorized;
}

export function buildCheckResult(
  funded: boolean,
  trustline: boolean,
  xlm_balance: string,
  errors: string[] = [],
  trustlineAuthorized: boolean = trustline,
  spendableXlmBalance?: string,
  usdcBalance?: string,
  horizonLatencyMs?: number
): HorizonCheckResult {
  const balance = String(xlm_balance ?? "0");
  const spendableBalance =
    spendableXlmBalance !== undefined ? String(spendableXlmBalance) : balance;
  const assetBalance = String(usdcBalance ?? "0");
  return {
    funded,
    trustline,
    trustline_authorized: trustlineAuthorized,
    verified: computeVerified(funded, trustline, trustlineAuthorized),
    xlm_balance: balance,
    spendable_xlm_balance: spendableBalance,
    usdc_balance: assetBalance,
    horizon_latency_ms: horizonLatencyMs,
    errors,
    readiness: computeReadiness(funded, trustline, balance, {
      authorized: trustlineAuthorized,
      spendableBalance,
    }),
  };
}

export function getReadinessTone(
  status: ReadinessStatus
): "success" | "warning" | "danger" {
  if (status === "ready") return "success";
  if (status === "low_reserve") return "warning";
  return "danger";
}

export function getHorizonErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown Horizon error";
}

export function isAccountNotFoundError(message: string): boolean {
  const normalized = message.toLowerCase();
  return message.includes("404") || normalized.includes("not found");
}

export function buildNotFoundCheckResult(): HorizonCheckResult {
  return buildCheckResult(false, false, "0", [
    "Account not found on the Stellar network (not funded)",
  ]);
}

/**
 * Contributor-facing copy for each readiness state.
 *
 * Written for someone whose first contact with Stellar is this page: say what
 * the state means for their payout, then what to do about it. The Horizon
 * field names, balances, and reason codes behind the state belong in the
 * maintainer "Horizon debug" panel (`ContributorDebugPanel`), not here.
 *
 * Keep in step with `docs/READINESS_MODEL.md` and `WIZARD_ACTION_COPY`.
 */
export const READINESS_CONFIG: Record<ReadinessStatus, ReadinessDisplayConfig> = {
  ready: {
    label: "Ready",
    variant: "ready",
    icon: "✅",
    description: "This wallet is set up and can receive USDC payouts.",
    nextStep: "Nothing to do — you are set for the next payout.",
    reasonCodes: ["none"],
  },
  low_reserve: {
    label: "Low balance",
    variant: "warning",
    icon: "⚠️",
    description:
      "This wallet can receive USDC, but it is running low on XLM — the small deposit Stellar keeps locked in every wallet.",
    nextStep:
      "Add a little more XLM so the wallet keeps working when the payout lands.",
    reasonCodes: ["increase_reserve"],
  },
  not_ready: {
    label: "Not ready yet",
    variant: "danger",
    icon: "❌",
    description: "This wallet cannot receive USDC payouts yet.",
    nextStep:
      "Follow the setup steps: put some XLM in the wallet, then turn on USDC for it.",
    reasonCodes: [
      "fund_account",
      "add_trustline",
      "await_trustline_authorization",
    ],
  },
};

export function getReadinessConfig(status: ReadinessStatus): ReadinessDisplayConfig {
  return READINESS_CONFIG[status];
}

export function getRowAccent(status: ReadinessStatus): string {
  switch (status) {
    case "ready":
      return "border-l-4 border-l-emerald-500";
    case "low_reserve":
      return "border-l-4 border-l-amber-500";
    case "not_ready":
      return "border-l-4 border-l-red-500";
  }
}

export function describeReadiness(status: ReadinessStatus): string {
  return getReadinessConfig(status).description;
}

/** Plain-language "what to do next" for a readiness state. */
export function getReadinessNextStep(status: ReadinessStatus): string {
  return getReadinessConfig(status).nextStep;
}

/**
 * Full badge copy: what the state means plus what to do about it. Used for the
 * badge tooltip and for the expanded guidance under the badge.
 */
export function describeReadinessWithNextStep(status: ReadinessStatus): string {
  const config = getReadinessConfig(status);
  return `${config.description} ${config.nextStep}`;
}
