import { describe, expect, it } from "vitest";

import {
  validateIncrementalStats,
  createStatsSnapshot,
  hasStatsChanged,
  getReadyPercentage,
  type StatsSnapshot,
} from "@/lib/stats-validation";

describe("Stats Validation", () => {
  describe("validateIncrementalStats", () => {
    it("validates correct stats (success path)", () => {
      const snapshot = createStatsSnapshot(100, 75);

      const result = validateIncrementalStats(null, snapshot);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("detects inconsistent totals (failure path)", () => {
      const snapshot: StatsSnapshot = {
        timestamp: new Date(),
        totalContributors: 100,
        readyCount: 50,
        lowReserveCount: 30,
        notReadyCount: 15, // 50 + 30 + 15 = 95, not 100
      };

      const result = validateIncrementalStats(null, snapshot);

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes("does not equal sum"))).toBe(true);
    });

    it("detects negative contributor counts", () => {
      const snapshot: StatsSnapshot = {
        timestamp: new Date(),
        totalContributors: -5,
        readyCount: 0,
        lowReserveCount: 0,
        notReadyCount: 0,
      };

      const result = validateIncrementalStats(null, snapshot);

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes("cannot be negative"))).toBe(true);
    });

    it("warns when total contributors decrease", () => {
      const previous = createStatsSnapshot(100, 75);
      const current = createStatsSnapshot(90, 70);

      const result = validateIncrementalStats(previous, current);

      expect(result.warnings.some((w) => w.includes("decreased"))).toBe(true);
    });

    it("warns about timestamp inconsistencies", () => {
      const now = new Date();
      const earlier = new Date(now.getTime() - 60000);

      const previous: StatsSnapshot = {
        timestamp: now,
        totalContributors: 100,
        readyCount: 75,
        lowReserveCount: 25,
        notReadyCount: 0,
      };

      const current: StatsSnapshot = {
        timestamp: earlier,
        totalContributors: 105,
        readyCount: 80,
        lowReserveCount: 25,
        notReadyCount: 0,
      };

      const result = validateIncrementalStats(previous, current);

      expect(result.warnings.some((w) => w.includes("timestamp"))).toBe(true);
    });

    it("allows total contributors to stay the same", () => {
      const timestamp = new Date();
      const previous: StatsSnapshot = {
        timestamp,
        totalContributors: 100,
        readyCount: 75,
        lowReserveCount: 25,
        notReadyCount: 0,
      };

      const current: StatsSnapshot = {
        timestamp: new Date(timestamp.getTime() + 1000),
        totalContributors: 100,
        readyCount: 78,
        lowReserveCount: 22,
        notReadyCount: 0,
      };

      const result = validateIncrementalStats(previous, current);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("includes previous snapshot in result", () => {
      const previous = createStatsSnapshot(100, 75);
      const current = createStatsSnapshot(105, 80);

      const result = validateIncrementalStats(previous, current);

      expect(result.previousSnapshot).toEqual(previous);
      expect(result.currentSnapshot).toEqual(current);
    });
  });

  describe("createStatsSnapshot", () => {
    it("creates valid stats snapshot", () => {
      const snapshot = createStatsSnapshot(100, 75);

      expect(snapshot.totalContributors).toBe(100);
      expect(snapshot.readyCount).toBe(75);
      expect(snapshot.lowReserveCount).toBe(25);
      expect(snapshot.timestamp).toBeInstanceOf(Date);
    });

    it("allows custom timestamp", () => {
      const customDate = new Date("2025-02-01T12:00:00Z");
      const snapshot = createStatsSnapshot(100, 75, customDate);

      expect(snapshot.timestamp).toEqual(customDate);
    });

    it("handles zero contributors", () => {
      const snapshot = createStatsSnapshot(0, 0);

      expect(snapshot.totalContributors).toBe(0);
      expect(snapshot.readyCount).toBe(0);
      expect(snapshot.lowReserveCount).toBe(0);
    });
  });

  describe("hasStatsChanged", () => {
    it("detects changes in ready count", () => {
      const previous = createStatsSnapshot(100, 75);
      const current = createStatsSnapshot(100, 80);

      expect(hasStatsChanged(previous, current)).toBe(true);
    });

    it("detects changes in total contributors", () => {
      const previous = createStatsSnapshot(100, 75);
      const current = createStatsSnapshot(105, 75);

      expect(hasStatsChanged(previous, current)).toBe(true);
    });

    it("returns false when stats are unchanged", () => {
      const snapshot1 = createStatsSnapshot(100, 75);
      const snapshot2 = createStatsSnapshot(100, 75);

      expect(hasStatsChanged(snapshot1, snapshot2)).toBe(false);
    });

    it("detects changes in low reserve count", () => {
      const previous = createStatsSnapshot(100, 75);
      const current: StatsSnapshot = {
        timestamp: new Date(),
        totalContributors: 100,
        readyCount: 75,
        lowReserveCount: 20,
        notReadyCount: 5,
      };

      expect(hasStatsChanged(previous, current)).toBe(true);
    });
  });

  describe("getReadyPercentage", () => {
    it("calculates ready percentage correctly", () => {
      const snapshot = createStatsSnapshot(100, 75);

      expect(getReadyPercentage(snapshot)).toBe(75);
    });

    it("returns 0 for zero contributors", () => {
      const snapshot = createStatsSnapshot(0, 0);

      expect(getReadyPercentage(snapshot)).toBe(0);
    });

    it("handles decimal percentages", () => {
      const snapshot = createStatsSnapshot(3, 1);

      expect(getReadyPercentage(snapshot)).toBeCloseTo(33.33, 1);
    });

    it("calculates 100% for all ready", () => {
      const snapshot = createStatsSnapshot(50, 50);

      expect(getReadyPercentage(snapshot)).toBe(100);
    });
  });
});
