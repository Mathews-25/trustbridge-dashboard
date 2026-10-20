import React from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HorizonLatencyChart } from "@/components/HorizonLatencyChart";
import type { HorizonLatencyStats } from "@/lib/stats";

describe("HorizonLatencyChart Component", () => {
  describe("Empty State", () => {
    it("renders intentional empty-state UI when stats prop is undefined", () => {
      render(<HorizonLatencyChart />);

      expect(
        screen.getByRole("heading", { name: /horizon api latency/i })
      ).toBeInTheDocument();

      expect(
        screen.getByText(/across 0 registrations\./i)
      ).toBeInTheDocument();

      const emptyBanner = screen.getByTestId("horizon-latency-empty");
      expect(emptyBanner).toBeInTheDocument();
      expect(emptyBanner).toHaveTextContent(
        "No Horizon latency data recorded yet. Latency will be aggregated as contributors recheck their Stellar address readiness."
      );

      // Verify metrics grid is not present
      expect(screen.queryByTestId("horizon-latency-metrics")).not.toBeInTheDocument();
      expect(screen.queryByText("Average Latency")).not.toBeInTheDocument();
      expect(screen.queryByText("p50 (Median)")).not.toBeInTheDocument();
      expect(screen.queryByText("p95 Latency")).not.toBeInTheDocument();
    });

    it("renders empty-state UI when sampleCount is 0", () => {
      const emptyStats: HorizonLatencyStats = {
        averageMs: 0,
        p50Ms: 0,
        p95Ms: 0,
        sampleCount: 0,
      };

      render(<HorizonLatencyChart stats={emptyStats} />);

      const emptyBanner = screen.getByTestId("horizon-latency-empty");
      expect(emptyBanner).toBeInTheDocument();
      expect(emptyBanner).toHaveTextContent(
        "No Horizon latency data recorded yet. Latency will be aggregated as contributors recheck their Stellar address readiness."
      );

      expect(
        screen.getByText(/across 0 registrations\./i)
      ).toBeInTheDocument();

      expect(screen.queryByTestId("horizon-latency-metrics")).not.toBeInTheDocument();
    });
  });

  describe("Metrics-Present State", () => {
    const populatedStats: HorizonLatencyStats = {
      averageMs: 142,
      p50Ms: 120,
      p95Ms: 380,
      sampleCount: 45,
    };

    it("renders all series metrics cards and labels when data is populated", () => {
      render(<HorizonLatencyChart stats={populatedStats} />);

      // Empty state should NOT be rendered
      expect(screen.queryByTestId("horizon-latency-empty")).not.toBeInTheDocument();

      // Metrics container should be present
      const metricsContainer = screen.getByTestId("horizon-latency-metrics");
      expect(metricsContainer).toBeInTheDocument();

      // Series labels
      expect(within(metricsContainer).getByText("Average Latency")).toBeInTheDocument();
      expect(within(metricsContainer).getByText("p50 (Median)")).toBeInTheDocument();
      expect(within(metricsContainer).getByText("p95 Latency")).toBeInTheDocument();
      expect(within(metricsContainer).getByText("Samples")).toBeInTheDocument();
    });

    it("displays formatted metric values with units", () => {
      render(<HorizonLatencyChart stats={populatedStats} />);

      const metricsContainer = screen.getByTestId("horizon-latency-metrics");
      expect(within(metricsContainer).getByText("142ms")).toBeInTheDocument();
      expect(within(metricsContainer).getByText("120ms")).toBeInTheDocument();
      expect(within(metricsContainer).getByText("380ms")).toBeInTheDocument();
      expect(within(metricsContainer).getByText("45")).toBeInTheDocument();
    });

    it("updates card description with accurate registration sample count", () => {
      render(<HorizonLatencyChart stats={populatedStats} />);

      expect(
        screen.getByText(/across 45 registrations\./i)
      ).toBeInTheDocument();
    });

    it("renders correctly with single sample edge case", () => {
      const singleSampleStats: HorizonLatencyStats = {
        averageMs: 85,
        p50Ms: 85,
        p95Ms: 85,
        sampleCount: 1,
      };

      render(<HorizonLatencyChart stats={singleSampleStats} />);

      expect(
        screen.getByText(/across 1 registrations\./i)
      ).toBeInTheDocument();

      const metricsContainer = screen.getByTestId("horizon-latency-metrics");
      const msValues = within(metricsContainer).getAllByText("85ms");
      expect(msValues).toHaveLength(3); // average, p50, p95
      expect(within(metricsContainer).getByText("1")).toBeInTheDocument();
    });
  });

  describe("Layout and Visual Structure", () => {
    it("renders the Activity icon in header", () => {
      const { container } = render(<HorizonLatencyChart />);

      const svgIcon = container.querySelector("svg");
      expect(svgIcon).toBeInTheDocument();
    });

    it("contains outer card with proper testid", () => {
      render(<HorizonLatencyChart />);

      expect(screen.getByTestId("horizon-latency-card")).toBeInTheDocument();
    });
  });
});
