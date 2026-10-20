import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { AddressAnomalyBanner } from "@/components/AddressAnomalyBanner";
import type { AnomalyStatus } from "@/lib/address-anomaly";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAnomaly(overrides: Partial<AnomalyStatus> = {}): AnomalyStatus {
  return {
    isAnomaly: true,
    count: 8,
    threshold: 5,
    windowMinutes: 60,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// No-anomaly state — banner must be hidden
// ---------------------------------------------------------------------------

describe("AddressAnomalyBanner — no anomaly", () => {
  it("renders nothing when status is undefined", () => {
    const { container } = render(<AddressAnomalyBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when isAnomaly is false", () => {
    const { container } = render(
      <AddressAnomalyBanner
        status={{ isAnomaly: false, count: 2, threshold: 5, windowMinutes: 60 }}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("does not render the alert element when no anomaly", () => {
    render(
      <AddressAnomalyBanner
        status={{ isAnomaly: false, count: 0, threshold: 5, windowMinutes: 60 }}
      />
    );
    expect(
      screen.queryByTestId("address-anomaly-banner")
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Anomaly-present state — banner must be visible
// ---------------------------------------------------------------------------

describe("AddressAnomalyBanner — anomaly present", () => {
  it("renders the alert banner when isAnomaly is true", () => {
    render(<AddressAnomalyBanner status={makeAnomaly()} />);
    expect(screen.getByTestId("address-anomaly-banner")).toBeInTheDocument();
  });

  it("has role='alert' for accessible announcement", () => {
    render(<AddressAnomalyBanner status={makeAnomaly()} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("contains the heading 'Security Alert'", () => {
    render(<AddressAnomalyBanner status={makeAnomaly()} />);
    expect(
      screen.getByText(/Security Alert/i)
    ).toBeInTheDocument();
  });

  it("displays the anomaly count", () => {
    render(<AddressAnomalyBanner status={makeAnomaly({ count: 12 })} />);
    expect(screen.getByText(/12 address changes/i)).toBeInTheDocument();
  });

  it("displays the window duration in minutes", () => {
    render(
      <AddressAnomalyBanner status={makeAnomaly({ windowMinutes: 30 })} />
    );
    expect(screen.getByText(/30 minutes/i)).toBeInTheDocument();
  });

  it("displays the configured threshold", () => {
    render(
      <AddressAnomalyBanner status={makeAnomaly({ threshold: 10 })} />
    );
    // threshold appears in the body text as e.g. "(threshold: 10)"
    expect(screen.getByText(/threshold.*10/i)).toBeInTheDocument();
  });

  it("includes copy directing maintainers to review audit logs", () => {
    render(<AddressAnomalyBanner status={makeAnomaly()} />);
    expect(screen.getByText(/audit logs/i)).toBeInTheDocument();
  });

  it("mentions maintainer session activity", () => {
    render(<AddressAnomalyBanner status={makeAnomaly()} />);
    expect(screen.getByText(/session activity/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("AddressAnomalyBanner — edge cases", () => {
  it("renders correctly with count equal to threshold (boundary)", () => {
    render(
      <AddressAnomalyBanner
        status={makeAnomaly({ count: 5, threshold: 5 })}
      />
    );
    expect(screen.getByTestId("address-anomaly-banner")).toBeInTheDocument();
    expect(screen.getByText(/5 address changes/i)).toBeInTheDocument();
  });

  it("renders correctly with a large count", () => {
    render(
      <AddressAnomalyBanner status={makeAnomaly({ count: 999 })} />
    );
    expect(screen.getByText(/999 address changes/i)).toBeInTheDocument();
  });

  it("renders correctly with count of 1", () => {
    render(
      <AddressAnomalyBanner status={makeAnomaly({ count: 1 })} />
    );
    expect(screen.getByText(/1 address changes/i)).toBeInTheDocument();
  });
});
