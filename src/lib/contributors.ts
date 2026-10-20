import type { ContributorRow, ReadinessStatus } from "@/types";

export type ContributorSortKey = "githubUsername" | "xlmBalance" | "lastCheckedAt" | "readiness";
export type ContributorFilter = "all" | "ready" | "needs_attention" | "low_reserve";

/** Column identifiers for the contributor table. */
export type ContributorColumnKey =
  | "githubUsername"
  | "stellarAddress"
  | "readiness"
  | "verified"
  | "xlmBalance"
  | "spendableXlmBalance"
  | "lastCheckedAt";

export interface ContributorColumnDef {
  key: ContributorColumnKey;
  label: string;
  defaultVisible: boolean;
}

/** All available columns in their default display order. */
export const CONTRIBUTOR_COLUMNS: ContributorColumnDef[] = [
  { key: "githubUsername",     label: "GitHub",         defaultVisible: true },
  { key: "stellarAddress",     label: "Stellar address", defaultVisible: true },
  { key: "readiness",          label: "Status",         defaultVisible: true },
  { key: "verified",           label: "Verified",       defaultVisible: true },
  { key: "xlmBalance",         label: "XLM",            defaultVisible: true },
  { key: "spendableXlmBalance",label: "Spendable XLM",  defaultVisible: false },
  { key: "lastCheckedAt",      label: "Last checked",   defaultVisible: true },
];

/** Returns the set of column keys that are visible by default. */
export function defaultVisibleColumns(): Set<ContributorColumnKey> {
  return new Set(
    CONTRIBUTOR_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key),
  );
}

export function readinessNeedsAttention(readiness: ReadinessStatus): boolean {
  return readiness !== "ready";
}

export function filterContributors(
  contributors: ContributorRow[],
  filter: ContributorFilter,
): ContributorRow[] {
  if (filter === "ready") {
    return contributors.filter((row) => row.readiness === "ready");
  }
  if (filter === "needs_attention") {
    return contributors.filter((row) => readinessNeedsAttention(row.readiness));
  }
  if (filter === "low_reserve") {
    return contributors.filter((row) => row.readiness === "low_reserve");
  }
  return [...contributors];
}

/**
 * Normalizes contributor search values so matching is resilient to case,
 * whitespace, leading @ symbols, and punctuation-heavy addresses.
 */
function normalizeSearchValue(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/[^a-z0-9]/g, "");
}

function levenshteinDistance(left: string, right: string): number {
  if (left === right) return 0;
  if (left.length === 0) return right.length;
  if (right.length === 0) return left.length;

  const matrix = Array.from({ length: left.length + 1 }, () =>
    Array(right.length + 1).fill(0),
  );

  for (let i = 0; i <= left.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= right.length; j += 1) matrix[0][j] = j;

  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );

      if (i > 1 && j > 1 && left[i - 1] === right[j - 2] && left[i - 2] === right[j - 1]) {
        matrix[i][j] = Math.min(matrix[i][j], matrix[i - 2][j - 2] + cost);
      }
    }
  }

  return matrix[left.length][right.length];
}

function fuzzyMatches(value: string, query: string): boolean {
  const normalizedValue = normalizeSearchValue(value);
  const normalizedQuery = normalizeSearchValue(query);

  if (!normalizedQuery) return true;
  if (normalizedValue.includes(normalizedQuery)) return true;

  const maxDistance = Math.max(1, Math.min(2, Math.floor(normalizedQuery.length * 0.2)));
  const vLen = normalizedValue.length;
  const qLen = normalizedQuery.length;
  if (Math.abs(vLen - qLen) > maxDistance + 2) return false;

  return levenshteinDistance(normalizedValue, normalizedQuery) <= maxDistance;
}

/**
 * Search contributors by GitHub username or Stellar address.
 * Performs case-insensitive matching and tolerates small typing errors.
 */
export function searchContributors(
  contributors: ContributorRow[],
  query: string,
): ContributorRow[] {
  const q = query.trim();
  if (!q) return contributors;

  return contributors.filter((row) => {
    const githubUsername = row.githubUsername ?? "";
    const stellarAddress = row.stellarAddress ?? "";

    return (
      fuzzyMatches(githubUsername, q) ||
      fuzzyMatches(stellarAddress, q) ||
      githubUsername.toLowerCase().includes(q.toLowerCase()) ||
      stellarAddress.toLowerCase().includes(q.toLowerCase())
    );
  });
}

export function compareContributors(
  a: ContributorRow,
  b: ContributorRow,
  sortKey: ContributorSortKey,
): number {
  if (sortKey === "githubUsername") {
    return a.githubUsername.localeCompare(b.githubUsername);
  }

  if (sortKey === "xlmBalance") {
    return Number.parseFloat(a.xlmBalance) - Number.parseFloat(b.xlmBalance);
  }

  if (sortKey === "readiness") {
    const order: Record<string, number> = { ready: 0, low_reserve: 1, not_ready: 2 };
    return (order[a.readiness] ?? 3) - (order[b.readiness] ?? 3);
  }

  const aTime = a.lastCheckedAt ? new Date(a.lastCheckedAt).getTime() : 0;
  const bTime = b.lastCheckedAt ? new Date(b.lastCheckedAt).getTime() : 0;
  return aTime - bTime;
}

export function sortContributors(
  contributors: ContributorRow[],
  sortKey: ContributorSortKey,
  ascending = true,
): ContributorRow[] {
  return [...contributors].sort((a, b) => {
    const comparison = compareContributors(a, b, sortKey);
    return ascending ? comparison : -comparison;
  });
}

export function countReadyContributors(contributors: ContributorRow[]): number {
  return contributors.filter((row) => row.readiness === "ready").length;
}
