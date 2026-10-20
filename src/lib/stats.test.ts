import { describe, it, expect } from "vitest";
import {
  buildDashboardStats,
  summarizeContributors,
  computeHorizonLatencyStats,
} from "./stats";
import type { ContributorRow } from "@/types";

describe("stats helpers", () => {
  it("buildDashboardStats calculates correct percentages", () => {
    const stats = buildDashboardStats(10, 8);
    expect(stats.totalContributors).toBe(10);
    expect(stats.readyCount).toBe(8);
    expect(stats.readyPercent).toBe(80);
  });

  it("summarizeContributors counts ready contributors", () => {
    const mockContributors = [
      { readiness: "ready" },
      { readiness: "ready" },
      { readiness: "not_ready" },
      { readiness: "low_reserve" },
    ] as ContributorRow[];

    const stats = summarizeContributors(mockContributors);
    expect(stats.totalContributors).toBe(4);
    expect(stats.readyCount).toBe(2);
    expect(stats.readyPercent).toBe(50);
  });

  describe("computeHorizonLatencyStats", () => {
    it("handles empty or null latency array gracefully", () => {
      const stats = computeHorizonLatencyStats([]);
      expect(stats).toEqual({ averageMs: 0, p50Ms: 0, p95Ms: 0, sampleCount: 0 });

      const nullStats = computeHorizonLatencyStats([null, undefined, NaN]);
      expect(nullStats).toEqual({ averageMs: 0, p50Ms: 0, p95Ms: 0, sampleCount: 0 });
    });

    it("calculates average, p50, and p95 latency accurately", () => {
      const latencies = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
      const stats = computeHorizonLatencyStats(latencies);

      expect(stats.sampleCount).toBe(10);
      expect(stats.averageMs).toBe(550);
      expect(stats.p50Ms).toBe(500);
      expect(stats.p95Ms).toBe(1000);
    });

    it("filters out negative or invalid values", () => {
      const latencies = [150, -50, null, 250, 350];
      const stats = computeHorizonLatencyStats(latencies);

      expect(stats.sampleCount).toBe(3);
      expect(stats.averageMs).toBe(250);
    });
  });
});
