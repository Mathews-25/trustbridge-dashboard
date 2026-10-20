"use client";

import { useMemo } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ContributorRow } from "@/types";

export interface StalenessSummary {
  stale: boolean;
  staleCount: number;
  totalCount: number;
  stalePercent: number;
  warning: string;
  allowExport: boolean;
  neverCheckedCount: number;
  oldestCheckedAt: string | null;
  thresholdHours: number;
}

function parseLastCheckedAt(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function getDefaultMaxAgeMs(): number {
  if (typeof window === "undefined") return 86_400_000;
  return 86_400_000;
}

export function buildStalenessSummaryClient(
  contributors: ContributorRow[],
  maxAgeMs?: number
): StalenessSummary {
  const threshold = maxAgeMs ?? getDefaultMaxAgeMs();
  const now = Date.now();
  const thresholdHours = Math.round(threshold / 3_600_000);

  let staleCount = 0;
  let neverCheckedCount = 0;
  let oldestCheckedAt: number | null = null;

  for (const c of contributors) {
    const checked = parseLastCheckedAt(c.lastCheckedAt);
    if (!checked) {
      staleCount++;
      neverCheckedCount++;
      continue;
    }
    const age = now - checked.getTime();
    if (age > threshold) {
      staleCount++;
    }
    if (oldestCheckedAt === null || checked.getTime() < oldestCheckedAt) {
      oldestCheckedAt = checked.getTime();
    }
  }

  const totalCount = contributors.length;
  const stalePercent = totalCount > 0 ? Math.round((staleCount / totalCount) * 100) : 0;

  let warning = "";
  if (staleCount > 0) {
    const neverClause =
      neverCheckedCount > 0
        ? ` (${neverCheckedCount} have never been verified)`
        : "";
    warning =
      `${staleCount} of ${totalCount} contributors (${stalePercent}%) have not been verified in the last ${thresholdHours} hour(s)${neverClause}. ` +
      `Stale data may cause payout failures. Run "Re-check all" to refresh from Horizon.`;
  }

  return {
    stale: staleCount > 0,
    staleCount,
    totalCount,
    stalePercent,
    warning,
    allowExport: staleCount === 0,
    neverCheckedCount,
    oldestCheckedAt: oldestCheckedAt ? new Date(oldestCheckedAt).toISOString() : null,
    thresholdHours,
  };
}

export interface StaleDataBannerProps {
  staleness: StalenessSummary;
  onRecheckAll?: () => void;
  isRecheckRunning?: boolean;
}

export function StaleDataBanner({
  staleness,
  onRecheckAll,
  isRecheckRunning = false,
}: StaleDataBannerProps) {
  const severity = useMemo<"warning" | "critical" | "info">(() => {
    if (!staleness.stale) return "info";
    if (staleness.stalePercent >= 50 || staleness.neverCheckedCount > 0) return "critical";
    return "warning";
  }, [staleness]);

  if (!staleness.stale) return null;

  const baseStyles =
    "mb-6 border-2";
  const severityStyles =
    severity === "critical"
      ? "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/60"
      : "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/60";

  const textColor =
    severity === "critical"
      ? "text-red-900 dark:text-red-200"
      : "text-amber-900 dark:text-amber-200";

  const badgeColor =
    severity === "critical"
      ? "bg-red-200 text-red-900 dark:bg-red-900 dark:text-red-100"
      : "bg-amber-200 text-amber-900 dark:bg-amber-900 dark:text-amber-100";

  return (
    <div
      role="alert"
      aria-live="polite"
      data-testid="stale-data-banner"
      className={`${baseStyles} ${severityStyles} rounded-lg`}
    >
      <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <AlertTriangle
            className={`mt-0.5 h-5 w-5 flex-shrink-0 ${textColor}`}
            aria-hidden
          />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badgeColor}`}>
                {severity === "critical" ? "Stale data — critical" : "Stale data"}
              </span>
              <span className={`text-sm font-medium ${textColor}`}>
                Dashboard data may be out of date
              </span>
            </div>
            <p className={`mt-1.5 text-sm ${textColor}`}>
              {staleness.warning}
            </p>
            {staleness.oldestCheckedAt && (
              <p className="mt-1 text-xs text-muted-foreground">
                Oldest last-checked entry:{" "}
                <time dateTime={staleness.oldestCheckedAt}>
                  {new Date(staleness.oldestCheckedAt).toLocaleString()}
                </time>
              </p>
            )}
          </div>
        </div>
        {onRecheckAll && (
          <Button
            variant={severity === "critical" ? "destructive" : "stellar"}
            size="sm"
            onClick={onRecheckAll}
            disabled={isRecheckRunning}
            className="flex-shrink-0 w-full sm:w-auto"
            data-testid="stale-banner-recheck"
          >
            <RefreshCw
              className={`mr-1.5 h-4 w-4 ${isRecheckRunning ? "animate-spin" : ""}`}
            />
            {isRecheckRunning ? "Refreshing…" : "Re-check all"}
          </Button>
        )}
      </div>
    </div>
  );
}
