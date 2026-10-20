/**
 * FreezeWindowBanner component tests — issue #518
 *
 * Validates:
 *   - Active freeze renders reason text and heading
 *   - role="alert" accessible attribute is present when rendered
 *   - data-testid is present for integration queries
 *   - Start / end labels appear when dates are supplied
 *   - Missing end date still renders start and reason (and vice versa)
 *   - No props: banner still mounts (parent controls mounting)
 *   - Default reason rendered when reason prop is absent
 *   - Long reason strings render without crashing
 *   - Invalid ISO date falls back to the raw string
 *   - Formatted date strings are not raw ISO (toLocaleString used)
 *   - Date formatting consistent with freeze-window.ts toISOString output
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FreezeWindowBanner } from "@/components/FreezeWindowBanner";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const ISO_START = "2026-09-24T18:00:00.000Z";
const ISO_END   = "2026-09-25T06:00:00.000Z";
const REASON    = "Wave roster payout freeze window in effect";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("FreezeWindowBanner", () => {
  // ── Active freeze — full props ────────────────────────────────────────────

  it("renders reason text when all props are provided", () => {
    render(<FreezeWindowBanner start={ISO_START} end={ISO_END} reason={REASON} />);
    expect(screen.getByText(REASON)).toBeInTheDocument();
  });

  it("renders the heading 'Wave Freeze Window Active'", () => {
    render(<FreezeWindowBanner start={ISO_START} end={ISO_END} reason={REASON} />);
    expect(
      screen.getByRole("heading", { name: /wave freeze window active/i })
    ).toBeInTheDocument();
  });

  it("has role=alert for screen readers", () => {
    render(<FreezeWindowBanner start={ISO_START} end={ISO_END} reason={REASON} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("has data-testid=freeze-window-banner for integration queries", () => {
    render(<FreezeWindowBanner start={ISO_START} end={ISO_END} reason={REASON} />);
    expect(screen.getByTestId("freeze-window-banner")).toBeInTheDocument();
  });

  it("renders 'Starts:' and 'Ends:' labels when both dates are present", () => {
    render(<FreezeWindowBanner start={ISO_START} end={ISO_END} reason={REASON} />);
    expect(screen.getByText("Starts:")).toBeInTheDocument();
    expect(screen.getByText("Ends:")).toBeInTheDocument();
  });

  // ── Date formatting ────────────────────────────────────────────────────────

  it("does not render raw ISO strings — toLocaleString is applied", () => {
    render(<FreezeWindowBanner start={ISO_START} end={ISO_END} reason={REASON} />);
    const banner = screen.getByTestId("freeze-window-banner");
    expect(banner.textContent).not.toContain("2026-09-24T18:00:00.000Z");
    expect(banner.textContent).not.toContain("2026-09-25T06:00:00.000Z");
  });

  it("renders a date string containing the year 2026", () => {
    render(<FreezeWindowBanner start={ISO_START} end={ISO_END} reason={REASON} />);
    const banner = screen.getByTestId("freeze-window-banner");
    expect(banner.textContent).toContain("2026");
  });

  // ── Missing end date ──────────────────────────────────────────────────────

  it("renders start and reason when end is not provided", () => {
    render(<FreezeWindowBanner start={ISO_START} reason={REASON} />);
    expect(screen.getByText(REASON)).toBeInTheDocument();
    expect(screen.getByText("Starts:")).toBeInTheDocument();
    expect(screen.queryByText("Ends:")).not.toBeInTheDocument();
  });

  // ── Missing start date ────────────────────────────────────────────────────

  it("renders end and reason when start is not provided", () => {
    render(<FreezeWindowBanner end={ISO_END} reason={REASON} />);
    expect(screen.getByText(REASON)).toBeInTheDocument();
    expect(screen.getByText("Ends:")).toBeInTheDocument();
    expect(screen.queryByText("Starts:")).not.toBeInTheDocument();
  });

  // ── Default reason ────────────────────────────────────────────────────────

  it("renders default reason text when reason prop is absent", () => {
    render(<FreezeWindowBanner start={ISO_START} end={ISO_END} />);
    // The component falls back to a description containing "frozen" / "payout"
    expect(
      screen.getByText(/frozen.*wave payout|wave payout.*frozen/i)
    ).toBeInTheDocument();
  });

  // ── No props — minimal render ─────────────────────────────────────────────

  it("renders the banner element even with no props (parent decides whether to mount)", () => {
    render(<FreezeWindowBanner />);
    expect(screen.getByTestId("freeze-window-banner")).toBeInTheDocument();
    expect(screen.queryByText("Starts:")).not.toBeInTheDocument();
    expect(screen.queryByText("Ends:")).not.toBeInTheDocument();
  });

  // ── Long reason string ────────────────────────────────────────────────────

  it("renders very long reason strings without crashing", () => {
    const longReason = "A".repeat(1000);
    render(<FreezeWindowBanner start={ISO_START} end={ISO_END} reason={longReason} />);
    expect(screen.getByText(longReason)).toBeInTheDocument();
  });

  // ── Invalid ISO string ────────────────────────────────────────────────────

  it("falls back to raw string when an invalid ISO date is supplied", () => {
    render(<FreezeWindowBanner start="not-a-date" end={ISO_END} reason={REASON} />);
    const banner = screen.getByTestId("freeze-window-banner");
    expect(banner.textContent).toContain("not-a-date");
  });

  // ── Freeze-window date formatting parity ──────────────────────────────────

  it("formats dates consistently with freeze-window.ts toISOString output", () => {
    // freeze-window.ts returns Date objects; callers pass .toISOString() to the component.
    const start = new Date("2026-09-24T18:00:00.000Z").toISOString();
    const end   = new Date("2026-09-25T06:00:00.000Z").toISOString();

    render(<FreezeWindowBanner start={start} end={end} reason={REASON} />);
    expect(screen.getByText(REASON)).toBeInTheDocument();
    expect(screen.getByText("Starts:")).toBeInTheDocument();
    expect(screen.getByText("Ends:")).toBeInTheDocument();
  });

  // ── Accessibility ─────────────────────────────────────────────────────────

  it("heading is nested within the alert region", () => {
    render(<FreezeWindowBanner start={ISO_START} end={ISO_END} reason={REASON} />);
    const alert = screen.getByRole("alert");
    const heading = screen.getByRole("heading", { name: /wave freeze window active/i });
    expect(alert).toContainElement(heading);
  });
});
