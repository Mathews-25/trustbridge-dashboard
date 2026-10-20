/**
 * Component tests for MaintenanceBanner (issue #296).
 *
 * Acceptance criteria:
 *   - Renders nothing when disabled
 *   - When enabled, exposes role=status / aria-live and message text
 */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { MaintenanceBanner } from "@/components/MaintenanceBanner";

describe("MaintenanceBanner", () => {
  it("renders nothing when enabled is false", () => {
    const { container } = render(
      <MaintenanceBanner enabled={false} message="Down for maintenance" />
    );
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId("maintenance-banner")).not.toBeInTheDocument();
  });

  it("renders nothing when enabled is false even with a message", () => {
    render(
      <MaintenanceBanner
        enabled={false}
        message="TrustBridge is in maintenance mode."
      />
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("renders the banner when enabled is true", () => {
    render(
      <MaintenanceBanner enabled message="TrustBridge is in maintenance mode." />
    );
    expect(screen.getByTestId("maintenance-banner")).toBeInTheDocument();
  });

  it("exposes role=status", () => {
    render(
      <MaintenanceBanner enabled message="Under maintenance." />
    );
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("exposes aria-live=polite for screen-reader announcements", () => {
    render(
      <MaintenanceBanner enabled message="Under maintenance." />
    );
    const banner = screen.getByTestId("maintenance-banner");
    expect(banner).toHaveAttribute("aria-live", "polite");
  });

  it("displays the message text", () => {
    const msg =
      "TrustBridge is in maintenance mode. Reads are available; changes are temporarily disabled.";
    render(<MaintenanceBanner enabled message={msg} />);
    expect(screen.getByText(msg)).toBeInTheDocument();
  });

  it("displays a custom message when provided", () => {
    render(
      <MaintenanceBanner enabled message="Back online at 15:00 UTC." />
    );
    expect(screen.getByText("Back online at 15:00 UTC.")).toBeInTheDocument();
  });

  it("does not render the banner on subsequent renders if enabled goes false", () => {
    const { rerender } = render(
      <MaintenanceBanner enabled message="Maintenance on." />
    );
    expect(screen.getByTestId("maintenance-banner")).toBeInTheDocument();

    rerender(<MaintenanceBanner enabled={false} message="Maintenance on." />);
    expect(screen.queryByTestId("maintenance-banner")).not.toBeInTheDocument();
  });

  it("shows updated message when message prop changes while enabled", () => {
    const { rerender } = render(
      <MaintenanceBanner enabled message="First message." />
    );
    expect(screen.getByText("First message.")).toBeInTheDocument();

    rerender(<MaintenanceBanner enabled message="Updated message." />);
    expect(screen.getByText("Updated message.")).toBeInTheDocument();
    expect(screen.queryByText("First message.")).not.toBeInTheDocument();
  });
});
