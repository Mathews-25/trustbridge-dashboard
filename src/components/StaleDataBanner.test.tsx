import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import {
  StaleDataBanner,
  buildStalenessSummaryClient,
  type StalenessSummary,
} from "@/components/StaleDataBanner";
import type { ContributorRow } from "@/types";

function makeRow(partial: Partial<ContributorRow> = {}): ContributorRow {
  return {
    id: "test-id",
    githubUsername: "test-user",
    stellarAddress: "GTEST123",
    readiness: "ready",
    funded: true,
    trustlineReady: true,
    trustlineAuthorized: true,
    verified: true,
    xlmBalance: "5.0000000",
    spendableXlmBalance: "3.5000000",
    usdcBalance: "0.0000000",
    lastCheckedAt: new Date().toISOString(),
    horizonLatencyMs: 100,
    ...partial,
  };
}

describe("buildStalenessSummaryClient", () => {
  it("returns non-stale summary when all rows are recent", () => {
    const rows = [
      makeRow({ lastCheckedAt: new Date().toISOString() }),
      makeRow({ lastCheckedAt: new Date(Date.now() - 60_000).toISOString() }),
    ];
    const s = buildStalenessSummaryClient(rows);
    expect(s.stale).toBe(false);
    expect(s.staleCount).toBe(0);
    expect(s.neverCheckedCount).toBe(0);
    expect(s.allowExport).toBe(true);
    expect(s.warning).toBe("");
  });

  it("counts rows older than the 24h threshold as stale", () => {
    const twoDaysAgo = Date.now() - 2 * 86_400_000;
    const rows = [
      makeRow({ lastCheckedAt: new Date().toISOString() }),
      makeRow({ lastCheckedAt: new Date(twoDaysAgo).toISOString() }),
      makeRow({ lastCheckedAt: new Date(twoDaysAgo).toISOString() }),
    ];
    const s = buildStalenessSummaryClient(rows);
    expect(s.stale).toBe(true);
    expect(s.staleCount).toBe(2);
    expect(s.totalCount).toBe(3);
    expect(s.stalePercent).toBe(67);
    expect(s.allowExport).toBe(false);
    expect(s.warning).toContain("2 of 3");
    expect(s.warning).toContain("24 hour");
  });

  it("treats lastCheckedAt null as never-checked AND stale", () => {
    const rows = [
      makeRow({ lastCheckedAt: null }),
      makeRow({ lastCheckedAt: null }),
      makeRow({ lastCheckedAt: new Date().toISOString() }),
    ];
    const s = buildStalenessSummaryClient(rows);
    expect(s.stale).toBe(true);
    expect(s.staleCount).toBe(2);
    expect(s.neverCheckedCount).toBe(2);
    expect(s.warning).toContain("have never been verified");
  });

  it("records the oldest lastCheckedAt timestamp", () => {
    const oldest = new Date(Date.now() - 10 * 86_400_000);
    const rows = [
      makeRow({ lastCheckedAt: oldest.toISOString() }),
      makeRow({ lastCheckedAt: new Date().toISOString() }),
    ];
    const s = buildStalenessSummaryClient(rows);
    expect(s.oldestCheckedAt).toBe(oldest.toISOString());
  });

  it("returns oldestCheckedAt null when no rows have ever been checked", () => {
    const rows = [makeRow({ lastCheckedAt: null })];
    const s = buildStalenessSummaryClient(rows);
    expect(s.oldestCheckedAt).toBeNull();
  });

  it("handles empty contributor list gracefully", () => {
    const s = buildStalenessSummaryClient([]);
    expect(s.stale).toBe(false);
    expect(s.staleCount).toBe(0);
    expect(s.stalePercent).toBe(0);
    expect(s.totalCount).toBe(0);
  });

  it("honors custom maxAgeMs", () => {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const rows = [makeRow({ lastCheckedAt: new Date(oneHourAgo).toISOString() })];
    const with30mThreshold = buildStalenessSummaryClient(rows, 30 * 60 * 1000);
    const with2hThreshold = buildStalenessSummaryClient(rows, 2 * 60 * 60 * 1000);
    expect(with30mThreshold.stale).toBe(true);
    expect(with2hThreshold.stale).toBe(false);
  });
});

describe("StaleDataBanner", () => {
  const nonStale: StalenessSummary = {
    stale: false,
    staleCount: 0,
    totalCount: 5,
    stalePercent: 0,
    warning: "",
    allowExport: true,
    neverCheckedCount: 0,
    oldestCheckedAt: new Date().toISOString(),
    thresholdHours: 24,
  };

  const warningStale: StalenessSummary = {
    stale: true,
    staleCount: 3,
    totalCount: 20,
    stalePercent: 15,
    warning: "3 of 20 (15%) have not been verified in the last 24 hours.",
    allowExport: false,
    neverCheckedCount: 0,
    oldestCheckedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    thresholdHours: 24,
  };

  const criticalStale: StalenessSummary = {
    stale: true,
    staleCount: 18,
    totalCount: 20,
    stalePercent: 90,
    warning:
      "18 of 20 (90%) have not been verified in the last 24 hours (5 have never been verified). Stale data may cause payout failures.",
    allowExport: false,
    neverCheckedCount: 5,
    oldestCheckedAt: new Date(Date.now() - 7 * 86_400_000).toISOString(),
    thresholdHours: 24,
  };

  it("renders nothing when staleness.stale is false", () => {
    const { container } = render(
      <StaleDataBanner staleness={nonStale} />
    );
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId("stale-data-banner")).not.toBeInTheDocument();
  });

  it("renders with role=alert and correct warning styling for 15% stale", () => {
    render(<StaleDataBanner staleness={warningStale} />);
    const banner = screen.getByTestId("stale-data-banner");
    expect(banner).toHaveAttribute("role", "alert");
    expect(banner).toHaveClass(/border-amber-/);
    expect(screen.getByText(/stale data/i)).toBeInTheDocument();
    expect(screen.getByText(/3 of 20/)).toBeInTheDocument();
  });

  it("renders critical styling when stalePercent is >= 50% or never-checked rows exist", () => {
    render(<StaleDataBanner staleness={criticalStale} />);
    const banner = screen.getByTestId("stale-data-banner");
    expect(banner).toHaveClass(/border-red-/);
    expect(screen.getByText(/stale data.*critical/i)).toBeInTheDocument();
    expect(screen.getByText(/have never been verified/)).toBeInTheDocument();
  });

  it("shows oldest last-checked entry time", () => {
    render(<StaleDataBanner staleness={warningStale} />);
    expect(screen.getByText(/oldest last-checked entry/i)).toBeInTheDocument();
  });

  it("invokes onRecheckAll when the Re-check button is clicked", () => {
    const onRecheck = vi.fn();
    render(<StaleDataBanner staleness={warningStale} onRecheckAll={onRecheck} />);
    const btn = screen.getByTestId("stale-banner-recheck");
    fireEvent.click(btn);
    expect(onRecheck).toHaveBeenCalledTimes(1);
  });

  it("disables the recheck button while isRecheckRunning is true", () => {
    render(
      <StaleDataBanner
        staleness={warningStale}
        onRecheckAll={vi.fn()}
        isRecheckRunning
      />
    );
    expect(screen.getByTestId("stale-banner-recheck")).toBeDisabled();
    expect(screen.getByText(/refreshing…/i)).toBeInTheDocument();
  });

  it("hides recheck action when onRecheckAll is not provided", () => {
    render(<StaleDataBanner staleness={warningStale} />);
    expect(screen.queryByTestId("stale-banner-recheck")).not.toBeInTheDocument();
  });
});
