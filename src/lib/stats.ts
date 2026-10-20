import { calculatePercent } from "@/lib/utils";
import type { ContributorRow, DashboardStats } from "@/types";

export interface HorizonLatencyStats {
  averageMs: number;
  p50Ms: number;
  p95Ms: number;
  sampleCount: number;
}

export function buildDashboardStats(
  totalContributors: number,
  readyCount: number
): DashboardStats {
  return {
    totalContributors,
    readyCount,
    readyPercent: calculatePercent(readyCount, totalContributors),
  };
}

export function summarizeContributors(contributors: ContributorRow[]): DashboardStats {
  const readyCount = contributors.filter((row) => row.readiness === "ready").length;
  return buildDashboardStats(contributors.length, readyCount);
}

export function computeHorizonLatencyStats(
  latencies: (number | null | undefined)[]
): HorizonLatencyStats {
  const valid = latencies.filter(
    (val): val is number => typeof val === "number" && !isNaN(val) && val >= 0
  );
  if (valid.length === 0) {
    return { averageMs: 0, p50Ms: 0, p95Ms: 0, sampleCount: 0 };
  }

  const sorted = [...valid].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, curr) => acc + curr, 0);
  const averageMs = Math.round(sum / sorted.length);

  const getPercentile = (p: number) => {
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
  };

  return {
    averageMs,
    p50Ms: getPercentile(50),
    p95Ms: getPercentile(95),
    sampleCount: sorted.length,
  };
}
