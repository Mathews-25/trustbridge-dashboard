import "server-only";

/**
 * Statistics snapshot for validation
 */
export interface StatsSnapshot {
  timestamp: Date;
  totalContributors: number;
  readyCount: number;
  lowReserveCount: number;
  notReadyCount: number;
}

/**
 * Validation result for incremental stats
 */
export interface StatsValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  previousSnapshot?: StatsSnapshot;
  currentSnapshot: StatsSnapshot;
}

/**
 * Validates that current stats represent valid incremental changes
 * from a previous snapshot
 */
export function validateIncrementalStats(
  previous: StatsSnapshot | null,
  current: StatsSnapshot
): StatsValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate current snapshot consistency
  const sum = current.readyCount + current.lowReserveCount + current.notReadyCount;
  if (sum !== current.totalContributors) {
    errors.push(
      `Total contributors (${current.totalContributors}) does not equal sum of statuses (${sum})`
    );
  }

  // Validate counts are non-negative
  if (current.totalContributors < 0) {
    errors.push("Total contributors cannot be negative");
  }
  if (current.readyCount < 0) {
    errors.push("Ready count cannot be negative");
  }
  if (current.lowReserveCount < 0) {
    errors.push("Low reserve count cannot be negative");
  }
  if (current.notReadyCount < 0) {
    errors.push("Not ready count cannot be negative");
  }

  // If we have a previous snapshot, validate incremental changes
  if (previous) {
    // Total contributors should only increase or stay the same
    if (current.totalContributors < previous.totalContributors) {
      warnings.push(
        `Total contributors decreased from ${previous.totalContributors} to ${current.totalContributors}`
      );
    }

    // Individual counts should not go negative
    if (current.readyCount < 0 || current.lowReserveCount < 0 || current.notReadyCount < 0) {
      errors.push("Status counts cannot be negative");
    }

    // Check for logical time progression
    if (current.timestamp <= previous.timestamp) {
      warnings.push("Current timestamp should be later than previous timestamp");
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    previousSnapshot: previous || undefined,
    currentSnapshot: current,
  };
}

/**
 * Creates a stats snapshot from contributor counts
 */
export function createStatsSnapshot(
  totalContributors: number,
  readyCount: number,
  timestamp: Date = new Date()
): StatsSnapshot {
  const lowReserveCount = Math.max(0, totalContributors - readyCount);
  const notReadyCount = 0; // In most cases, this is calculated as total - ready

  return {
    timestamp,
    totalContributors,
    readyCount,
    lowReserveCount,
    notReadyCount,
  };
}

/**
 * Checks if stats have been updated since a given timestamp
 */
export function hasStatsChanged(
  previous: StatsSnapshot,
  current: StatsSnapshot
): boolean {
  return (
    previous.totalContributors !== current.totalContributors ||
    previous.readyCount !== current.readyCount ||
    previous.lowReserveCount !== current.lowReserveCount ||
    previous.notReadyCount !== current.notReadyCount
  );
}

/**
 * Calculates the percentage of ready contributors
 */
export function getReadyPercentage(snapshot: StatsSnapshot): number {
  if (snapshot.totalContributors === 0) return 0;
  return (snapshot.readyCount / snapshot.totalContributors) * 100;
}
