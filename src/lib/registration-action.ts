import "server-only";

import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkStellarAddress } from "@/lib/horizon";
import { toContributorRow } from "@/lib/registrations";
import { isValidStellarAddress, normalizeStellarAddress } from "@/lib/stellar";
import type { ContributorRow } from "@/types";

/**
 * Shared server action for registering or updating a Stellar address.
 * Validates the address, checks Horizon for readiness, and persists to the database.
 *
 * Returns the updated contributor row on success, or an error message.
 */
export async function registerStellarAddress(
  address: string
): Promise<{ success: true; data: ContributorRow } | { success: false; error: string }> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" };
  }

  const trimmed = normalizeStellarAddress(address);
  if (!trimmed) {
    return { success: false, error: "Address is required" };
  }

  if (!isValidStellarAddress(trimmed)) {
    return {
      success: false,
      error: "Invalid Stellar public key (must be a valid G-address)",
    };
  }

  const checkResult = await checkStellarAddress(trimmed);
  if (checkResult.errors.length > 0 && !checkResult.funded && !checkResult.trustline) {
    // Soft-fail Horizon errors only when we got nothing useful back.
    // Unfunded/no-trustline accounts are still registerable.
    const hardError = checkResult.errors.some((error) =>
      /invalid|required|unavailable/i.test(error)
    );
    if (hardError) {
      return { success: false, error: checkResult.errors.join(", ") };
    }
  }

  const registration = await prisma.registration.upsert({
    where: { userId: session.user.id },
    create: {
      userId: session.user.id,
      stellarAddress: trimmed,
      deletedAt: null,
      funded: checkResult.funded,
      trustlineReady: checkResult.trustline,
      trustlineAuthorized: checkResult.trustline_authorized,
      xlmBalance: checkResult.xlm_balance,
      spendableXlmBalance: checkResult.spendable_xlm_balance,
      usdcBalance: checkResult.usdc_balance,
      horizonLatencyMs: checkResult.horizon_latency_ms ?? null,
      lastCheckedAt: new Date(),
    },
    update: {
      stellarAddress: trimmed,
      deletedAt: null,
      funded: checkResult.funded,
      trustlineReady: checkResult.trustline,
      trustlineAuthorized: checkResult.trustline_authorized,
      xlmBalance: checkResult.xlm_balance,
      spendableXlmBalance: checkResult.spendable_xlm_balance,
      usdcBalance: checkResult.usdc_balance,
      horizonLatencyMs: checkResult.horizon_latency_ms ?? null,
      lastCheckedAt: new Date(),
    },
    include: {
      user: { select: { githubUsername: true } },
    },
  });

  return { success: true, data: toContributorRow(registration) };
}

/**
 * Fetch the current user's registration (if it exists).
 */
export async function getCurrentUserRegistration(): Promise<ContributorRow | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return null;
  }

  const registration = await prisma.registration.findUnique({
    where: { userId: session.user.id },
    include: {
      user: { select: { githubUsername: true } },
    },
  });

  return registration && !registration.deletedAt
    ? toContributorRow(registration)
    : null;
}

/**
 * Validate a Stellar address and return readiness status without persisting.
 * Useful for preview/wizard flows before final registration.
 */
export async function validateStellarAddress(address: string) {
  const trimmed = normalizeStellarAddress(address);
  if (!trimmed) {
    return {
      valid: false,
      errors: ["Address is required"],
      readiness: null as null,
    };
  }

  if (!isValidStellarAddress(trimmed)) {
    return {
      valid: false,
      errors: ["Invalid Stellar public key (must be a valid G-address)"],
      readiness: null as null,
    };
  }

  const checkResult = await checkStellarAddress(trimmed);
  return {
    valid: true,
    errors: checkResult.errors,
    readiness: {
      funded: checkResult.funded,
      trustline: checkResult.trustline,
      trustlineAuthorized: checkResult.trustline_authorized,
      verified: checkResult.verified,
      xlmBalance: checkResult.xlm_balance,
      spendableXlmBalance: checkResult.spendable_xlm_balance,
      usdcBalance: checkResult.usdc_balance,
      status: checkResult.readiness,
    },
  };
}
