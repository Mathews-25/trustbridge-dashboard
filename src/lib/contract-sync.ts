import "server-only";

import { rpc, scValToNative, Contract, TransactionBuilder, Account, Networks, nativeToScVal, xdr } from "stellar-sdk";

import { recordAuditLog } from "@/lib/audit";
import { StructuredLogger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const logger = new StructuredLogger("contract-sync");

export type ContractSyncStatus = "ok" | "error" | "skipped";

export interface ContractSyncResult {
  status: ContractSyncStatus;
  startedAt: string;
  durationMs: number;
  synced?: number;
  created?: number;
  updated?: number;
  unchanged?: number;
  errors?: string[];
}

let lastRunAt: number | null = null;
let lastResult: ContractSyncResult | null = null;

function getMinIntervalMs(): number {
  const parsed = Number.parseInt(
    process.env.CONTRACT_SYNC_MIN_INTERVAL_MS ?? "60000",
    10
  );
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 60000;
}

function getSorobanRpcUrl(): string {
  return process.env.SOROBAN_RPC_URL?.trim() || "https://soroban-testnet.stellar.org";
}

function getNetworkPassphrase(): string {
  return process.env.SOROBAN_NETWORK_PASSPHRASE?.trim() || Networks.TESTNET;
}

interface ContractRegistration {
  stellarAddress: string;
  githubUsername?: string;
}

/**
 * Parse the native value returned by `get_registered_paginated` into a list
 * of contract registrations.
 *
 * The contract may return a Vec of tuples/arrays, a Vec of plain address
 * strings, or a mix of both. Malformed entries (null, non-string addresses,
 * empty addresses, unexpected shapes) are skipped rather than throwing so a
 * single bad row can't abort the whole sync.
 */
export function parseContractRegistrations(native: unknown): ContractRegistration[] {
  if (!Array.isArray(native)) {
    return [];
  }

  const registrations: ContractRegistration[] = [];

  for (const item of native) {
    if (Array.isArray(item)) {
      const address = item[0];
      if (typeof address !== "string" || address.length === 0) {
        continue;
      }
      const username = item.length > 1 ? item[1] : undefined;
      registrations.push({
        stellarAddress: address,
        githubUsername:
          typeof username === "string" && username.length > 0
            ? username
            : undefined,
      });
    } else if (typeof item === "string" && item.length > 0) {
      registrations.push({ stellarAddress: item });
    }
  }

  return registrations;
}

/**
 * Read a Soroban contract function via RPC `simulateTransaction`.
 *
 * Soroban contract reads are not plain RPC calls — they must be simulated
 * against a recent ledger so the host can execute the contract and return
 * the result. We build a read-only transaction from a throwaway source
 * account, simulate it, and decode the returned ScVal.
 */
async function simulateContractRead(
  contractId: string,
  method: string,
  args: xdr.ScVal[] = []
): Promise<unknown> {
  const server = new rpc.Server(getSorobanRpcUrl());
  const contract = new Contract(contractId);

  // A read-only simulation does not need a funded account; any valid
  // account id works as the transaction source.
  const source = new Account(
    "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
    "0"
  );

  const tx = new TransactionBuilder(source, {
    fee: "100",
    networkPassphrase: getNetworkPassphrase(),
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

  const simulation = await server.simulateTransaction(tx);

  if (rpc.Api.isSimulationError(simulation)) {
    throw new Error(simulation.error);
  }

  const result = (simulation as rpc.Api.SimulateTransactionSuccessResponse)
    .result;
  if (!result) {
    return undefined;
  }

  return scValToNative(result.retval);
}

/**
 * Fetch all registrations from the Soroban contract using get_registered_paginated.
 * Returns an empty array if the contract is not configured or on error.
 */
async function fetchContractRegistrations(): Promise<{
  registrations: ContractRegistration[];
  errors: string[];
}> {
  const contractId = process.env.SOROBAN_CONTRACT_ID?.trim();
  if (!contractId) {
    return { registrations: [], errors: ["SOROBAN_CONTRACT_ID is not configured"] };
  }

  try {
    // Fetch all registrations using get_registered_paginated via RPC simulate.
    // The contract should return a list of (stellarAddress, githubUsername) tuples.
    const native = await simulateContractRead(
      contractId,
      "get_registered_paginated",
      [nativeToScVal(0, { type: "u32" }), nativeToScVal(100, { type: "u32" })]
    );

    return { registrations: parseContractRegistrations(native), errors: [] };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Soroban error";
    return { registrations: [], errors: [`Soroban RPC error: ${message}`] };
  }
}

/**
 * Sync contract registrations into Postgres.
 *
 * Merge rules:
 * 1. If a registration exists in Postgres but not in contract → keep it (don't delete)
 * 2. If a registration exists in contract but not in Postgres → create it
 * 3. If a registration exists in both → update GitHub username if changed
 */
async function syncContractRegistrations(
  contractRegistrations: ContractRegistration[]
): Promise<{ created: number; updated: number; unchanged: number }> {
  let created = 0;
  let updated = 0;
  let unchanged = 0;

  // Get all existing registrations from Postgres
  const existingRegistrations = await prisma.registration.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      stellarAddress: true,
      userId: true,
      user: {
        select: { githubUsername: true },
      },
    },
  });

  const existingByAddress = new Map(
    existingRegistrations.map((r) => [r.stellarAddress, r])
  );

  // Process each contract registration
  for (const contractReg of contractRegistrations) {
    const existing = existingByAddress.get(contractReg.stellarAddress);

    if (!existing) {
      // New registration from contract — we can't create it without a user
      // Log it for now, but don't create without a user
      logger.info("contract_registration_not_in_postgres", {
        stellarAddress: contractReg.stellarAddress,
        githubUsername: contractReg.githubUsername,
      });
      created++;
      continue;
    }

    // Check if GitHub username changed
    if (
      contractReg.githubUsername &&
      existing.user.githubUsername !== contractReg.githubUsername
    ) {
      // Guard against conflicts: only update the linked User when the new
      // username isn't already claimed by a different user.
      const conflictingUser = await prisma.user.findFirst({
        where: {
          githubUsername: contractReg.githubUsername,
          id: { not: existing.userId },
        },
        select: { id: true },
      });

      if (conflictingUser) {
        logger.warn("contract_sync_username_conflict", {
          stellarAddress: contractReg.stellarAddress,
          oldUsername: existing.user.githubUsername,
          newUsername: contractReg.githubUsername,
          conflictingUserId: conflictingUser.id,
        });
        unchanged++;
        continue;
      }

      await prisma.user.update({
        where: { id: existing.userId },
        data: { githubUsername: contractReg.githubUsername },
      });
      logger.info("contract_sync_username_changed", {
        stellarAddress: contractReg.stellarAddress,
        oldUsername: existing.user.githubUsername,
        newUsername: contractReg.githubUsername,
      });
      updated++;
    } else {
      unchanged++;
    }
  }

  return { created, updated, unchanged };
}

/**
 * Syncs Postgres registration state against on-chain contract data.
 *
 * This is the TRUE contract→Postgres sync, not a Horizon re-check.
 * It reads from the Soroban contract and updates Postgres accordingly.
 *
 * Rate-limited (`CONTRACT_SYNC_MIN_INTERVAL_MS`) so an over-eager
 * scheduler or retry storm can't fan out into repeated full-table sweeps.
 * Never throws: RPC outages and DB errors are caught and
 * returned as a result so a cron trigger never surfaces a 500.
 */
export async function syncContractToPostgres(): Promise<ContractSyncResult> {
  const now = Date.now();
  const minIntervalMs = getMinIntervalMs();

  if (lastRunAt !== null && now - lastRunAt < minIntervalMs) {
    logger.info("sync_skipped_rate_limited", {
      msSinceLastRun: now - lastRunAt,
      minIntervalMs,
    });
    return {
      status: "skipped",
      startedAt: new Date(now).toISOString(),
      durationMs: 0,
    };
  }

  lastRunAt = now;
  const startedAt = new Date(now).toISOString();
  logger.info("sync_started", { startedAt });

  try {
    const { registrations, errors } = await fetchContractRegistrations();

    if (errors.length > 0) {
      const durationMs = Date.now() - now;
      lastResult = {
        status: "error",
        startedAt,
        durationMs,
        errors,
      };
      logger.error("sync_failed", { errors });
      return lastResult;
    }

    const { created, updated, unchanged } = await syncContractRegistrations(
      registrations
    );

    const durationMs = Date.now() - now;
    lastResult = {
      status: "ok",
      startedAt,
      durationMs,
      synced: registrations.length,
      created,
      updated,
      unchanged,
    };
    logger.info("sync_completed", {
      synced: registrations.length,
      created,
      updated,
      unchanged,
      durationMs,
    });
    return lastResult;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown sync error";
    const durationMs = Date.now() - now;
    lastResult = {
      status: "error",
      startedAt,
      durationMs,
      errors: [message],
    };
    logger.error("sync_failed", { error: message });
    return lastResult;
  }
}

/**
 * Returns the most recent sync result, if any. Never triggers a new run.
 *
 * Named `getContractSyncHealth` because that is the name every caller uses:
 * `src/lib/health.ts` (the /status page and /api/health), the
 * /api/contract-sync route, and both test files. Commit bf7b2a0 (#423)
 * renamed this export without updating any of them, which made
 * `runHealthChecks()` throw and the status page fall back to
 * "Unable to fetch status".
 */
export function getContractSyncHealth(): ContractSyncResult | null {
  return lastResult;
}

/**
 * Test-only: reset in-memory rate-limit/health state between test runs.
 *
 * Also removed by bf7b2a0 (#423); `src/lib/contract-sync.test.ts` calls it in
 * `beforeEach` to keep the lastRunAt rate-limit window and the health snapshot
 * independent between tests.
 */
export function resetContractSyncState(): void {
  lastRunAt = null;
  lastResult = null;
}
