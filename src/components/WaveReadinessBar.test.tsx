import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { WaveReadinessBar } from "@/components/WaveReadinessBar";

describe("WaveReadinessBar component", () => {
  it("renders ready/total counts and computed percent", () => {
    render(<WaveReadinessBar readyCount={3} totalCount={4} />);

    expect(screen.getByText("Wave payout readiness")).toBeInTheDocument();
    expect(screen.getByText("3/4 ready (75%)")).toBeInTheDocument();
  });

  it("sets the fill bar width to the computed percent", () => {
    render(<WaveReadinessBar readyCount={1} totalCount={2} />);

    const fill = screen.getByTestId("wave-readiness-fill");
    expect(fill).toHaveStyle({ width: "50%" });
  });

  it("renders zero width when there are no contributors", () => {
    render(<WaveReadinessBar readyCount={0} totalCount={0} />);

    expect(screen.getByText("0/0 ready (0%)")).toBeInTheDocument();
    const fill = screen.getByTestId("wave-readiness-fill");
    expect(fill).toHaveStyle({ width: "0%" });
  });

  it("honors prefers-reduced-motion via the motion-reduce transition-none class", () => {
    render(<WaveReadinessBar readyCount={2} totalCount={5} />);

    const fill = screen.getByTestId("wave-readiness-fill");
    // Base transition is preserved for users without the preference...
    expect(fill).toHaveClass("transition-all");
    expect(fill).toHaveClass("duration-500");
    // ...but is disabled sitewide under prefers-reduced-motion via this variant.
    expect(fill).toHaveClass("motion-reduce:transition-none");
  });

  it("does not remove the readiness bar itself", () => {
    const { container } = render(
      <WaveReadinessBar readyCount={2} totalCount={5} />
    );

    // The track/bar wrapper should still be present, motion is the only thing gated.
    expect(container.querySelector(".rounded-full.bg-muted")).toBeTruthy();
  });
});
