import "server-only";

import {
  ACTION_DEFAULTS,
  DEFAULT_HORIZON_URL,
  resolveAssetCode,
  resolveAssetIssuer,
  resolveMinXlmBalance,
} from "@/lib/constants";
import { isValidStellarAddress } from "@/lib/stellar";
import type { ActionAlignment, NetworkConfig, StellarNetwork } from "@/types";

const DEFAULT_SOROBAN_RPC_URL = "https://soroban-testnet.stellar.org";

/**
 * Resolve the Horizon URL exactly as `getHorizonServer()` does in
 * `src/lib/horizon.ts` — kept in sync deliberately rather than imported,
 * since `horizon.ts` is a `server-only` module built around the SDK client
 * and importing it here would pull in `stellar-sdk` for a pure classifier.
 */
export function resolveHorizonUrl(): string {
  return process.env.NEXT_PUBLIC_HORIZON_URL?.trim() || DEFAULT_HORIZON_URL;
}

/** Mirrors `getSorobanRpcUrl()` in `src/lib/soroban.ts`. */
export function resolveSorobanRpcUrl(): string {
  return process.env.SOROBAN_RPC_URL?.trim() || DEFAULT_SOROBAN_RPC_URL;
}

/**
 * Resolves Soroban network passphrase. Returns SOROBAN_NETWORK_PASSPHRASE if explicitly set,
 * otherwise derives default from Horizon config (mainnet -> Public Global Stellar Network, testnet -> Test SDF Network).
 */
export function resolveSorobanNetworkPassphrase(): string {
  const explicit = process.env.SOROBAN_NETWORK_PASSPHRASE?.trim();
  if (explicit) return explicit;
  const horizonNetwork = classifyHorizonNetwork(resolveHorizonUrl());
  return horizonNetwork === "mainnet"
    ? "Public Global Stellar Network ; September 2015"
    : "Test SDF Network ; September 2015";
}

/** Classify a Horizon URL by hostname. Unknown hosts are "custom". */
export function classifyHorizonNetwork(url: string): StellarNetwork {
  const hostname = safeHostname(url);
  if (hostname === "horizon.stellar.org") return "mainnet";
  if (hostname === "horizon-testnet.stellar.org") return "testnet";
  return "custom";
}

/**
 * Classify a Soroban RPC URL by hostname. There is no single canonical
 * public mainnet Soroban RPC hostname the way there is for Horizon — most
 * mainnet deployments use a provider-specific endpoint (e.g. a paid RPC
 * service) rather than one blessed by the Stellar Development Foundation.
 * `soroban-testnet.stellar.org` is the one hostname worth hardcoding with
 * confidence; `mainnet.sorobanrpc.com` is documented in this project's own
 * docs/ENVIRONMENT.md as the mainnet example, so it is special-cased too.
 * Anything else is treated as "custom" rather than guessed at, so a
 * self-hosted or private RPC node never false-positives as a network
 * mismatch.
 */
export function classifySorobanNetwork(url: string): StellarNetwork {
  const hostname = safeHostname(url);
  if (hostname === "soroban-testnet.stellar.org") return "testnet";
  if (hostname === "mainnet.sorobanrpc.com") return "mainnet";
  return "custom";
}

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Compare the *resolved* dashboard configuration against the defaults declared
 * by trustbridge-action's `action.yml` (mirrored in `ACTION_DEFAULTS`).
 *
 * This is the check behind issue #119: the dashboard and the Action each read
 * their own environment, so nothing stops them drifting apart — and when they
 * do, a contributor reads as "ready" on the dashboard and still fails the
 * workflow that gates their payout (or the reverse). Rather than fail closed
 * on a mismatch — an operator may be running a deliberate testnet or
 * custom-asset deployment — this reports drift as warnings so the network
 * panel can show it and the operator can decide.
 *
 * The issuer check is the one exception that is *always* worth flagging: a
 * G-address that fails StrKey checksum validation cannot be a real account on
 * any network, so it is a misconfiguration regardless of intent.
 */
export function checkActionAlignment(): ActionAlignment {
  const horizonUrl = resolveHorizonUrl();
  const assetCode = resolveAssetCode();
  const assetIssuer = resolveAssetIssuer();
  const minXlmBalance = resolveMinXlmBalance();

  const warnings: string[] = [];

  if (!isValidStellarAddress(assetIssuer)) {
    warnings.push(
      `NEXT_PUBLIC_DEFAULT_ASSET_ISSUER (${assetIssuer}) is not a valid Stellar G-address — it fails StrKey checksum validation, so no trustline check against it can ever succeed. The trustbridge-action default is ${ACTION_DEFAULTS.assetIssuer}.`
    );
  } else if (assetIssuer !== ACTION_DEFAULTS.assetIssuer) {
    warnings.push(
      `Asset issuer differs from trustbridge-action: dashboard uses ${assetIssuer}, the Action defaults to ${ACTION_DEFAULTS.assetIssuer}. Contributors may pass one check and fail the other.`
    );
  }

  if (assetCode !== ACTION_DEFAULTS.assetCode) {
    warnings.push(
      `Asset code differs from trustbridge-action: dashboard uses ${assetCode}, the Action defaults to ${ACTION_DEFAULTS.assetCode}.`
    );
  }

  if (horizonUrl !== ACTION_DEFAULTS.horizonUrl) {
    warnings.push(
      `Horizon URL differs from trustbridge-action: dashboard uses ${horizonUrl}, the Action defaults to ${ACTION_DEFAULTS.horizonUrl}.`
    );
  }

  // Only a *lower* dashboard floor is dangerous: it marks contributors ready
  // who the Action will then reject. A higher floor is merely conservative.
  if (minXlmBalance < ACTION_DEFAULTS.minXlmReserve) {
    warnings.push(
      `Minimum XLM balance (${minXlmBalance}) is below trustbridge-action's min_xlm_reserve default (${ACTION_DEFAULTS.minXlmReserve}). Contributors between the two thresholds will show as ready here and fail the Action.`
    );
  }

  return {
    horizonUrl,
    assetCode,
    assetIssuer,
    minXlmBalance,
    expected: {
      horizonUrl: ACTION_DEFAULTS.horizonUrl,
      assetCode: ACTION_DEFAULTS.assetCode,
      assetIssuer: ACTION_DEFAULTS.assetIssuer,
      minXlmBalance: ACTION_DEFAULTS.minXlmReserve,
    },
    aligned: warnings.length === 0,
    warnings,
  };
}

/**
 * Reads the resolved Horizon and Soroban RPC endpoints and flags a
 * mismatch when they point at two different *known* named networks (e.g.
 * Horizon mainnet + Soroban testnet — the project's actual default
 * configuration). Custom endpoints on either side are never flagged, since
 * a private/self-hosted RPC node is a legitimate setup this check cannot
 * confidently classify.
 */
export function getNetworkConfig(): NetworkConfig {
  const horizonUrl = resolveHorizonUrl();
  const sorobanUrl = resolveSorobanRpcUrl();
  const horizonNetwork = classifyHorizonNetwork(horizonUrl);
  const sorobanNetwork = classifySorobanNetwork(sorobanUrl);
  const sorobanContractConfigured = Boolean(
    process.env.SOROBAN_CONTRACT_ID?.trim()
  );

  const mismatched =
    horizonNetwork !== "custom" &&
    sorobanNetwork !== "custom" &&
    horizonNetwork !== sorobanNetwork;

  const warnings: string[] = [];
  if (mismatched) {
    warnings.push(
      `Horizon is configured for ${horizonNetwork} (${horizonUrl}) but Soroban RPC is configured for ${sorobanNetwork} (${sorobanUrl}). Contributor funding and Soroban events are being read from different networks.`
    );
  }
  if (!sorobanContractConfigured) {
    warnings.push(
      "SOROBAN_CONTRACT_ID is not configured — the Soroban event timeline is disabled."
    );
  }

  const actionAlignment = checkActionAlignment();
  warnings.push(...actionAlignment.warnings);

  return {
    horizonUrl,
    horizonNetwork,
    sorobanUrl,
    sorobanNetwork,
    sorobanContractConfigured,
    mismatched,
    actionAlignment,
    warnings,
  };
}
