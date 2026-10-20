import "server-only";

import { buildCsv, buildCsvFilename } from "@/lib/csv";
import {
  buildWalletProofInfo,
  buildHorizonDebugInfo,
} from "@/lib/registration-insights";
import type { ContributorRow } from "@/types";

const CSV_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
let cachedCsv: { data: string; timestamp: number } | null = null;

export function buildContributorsCsv(
  contributors: ContributorRow[]
): string {
  const headers = [
    "id",
    "githubUsername",
    "stellarAddress",
    "funded",
    "trustlineReady",
    "trustlineAuthorized",
    "verified",
    "xlmBalance",
    "spendableXlmBalance",
    "readiness",
    "lastCheckedAt",
    "horizonDebugSummary",
    "horizonNextAction",
    "freighterProofChallenge",
  ];

  const rows = contributors.map((contributor) => {
    const horizonDebug =
      contributor.horizonDebug ??
      buildHorizonDebugInfo({
        funded: contributor.funded,
        trustlineReady: contributor.trustlineReady,
        trustlineAuthorized: contributor.trustlineAuthorized,
        readiness: contributor.readiness,
        xlmBalance: contributor.xlmBalance,
        spendableXlmBalance: contributor.spendableXlmBalance,
        lastCheckedAt: contributor.lastCheckedAt,
      });
    const walletProof =
      contributor.walletProof ??
      buildWalletProofInfo(
        contributor.stellarAddress,
        contributor.githubUsername
      );

    return [
      contributor.id,
      contributor.githubUsername,
      contributor.stellarAddress,
      contributor.funded ? "yes" : "no",
      contributor.trustlineReady ? "yes" : "no",
      contributor.trustlineAuthorized ? "yes" : "no",
      contributor.verified ? "yes" : "no",
      contributor.xlmBalance,
      contributor.spendableXlmBalance,
      contributor.readiness,
      contributor.lastCheckedAt || "",
      horizonDebug.summary,
      horizonDebug.nextAction,
      walletProof.challenge,
    ];
  });

  return buildCsv(headers, rows);
}

export function getContributorsCsvFilename(date = new Date()): string {
  return buildCsvFilename("contributors", date);
}

export function getCachedCsv(contributors: ContributorRow[]): string {
  const now = Date.now();

  if (
    cachedCsv &&
    now - cachedCsv.timestamp < CSV_CACHE_TTL
  ) {
    return cachedCsv.data;
  }

  const csv = buildContributorsCsv(contributors);
  cachedCsv = { data: csv, timestamp: now };
  return csv;
}

export function invalidateCsvCache(): void {
  cachedCsv = null;
}
