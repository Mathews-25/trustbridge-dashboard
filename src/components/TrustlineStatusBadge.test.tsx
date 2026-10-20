import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { TrustlineStatusBadge } from "@/components/TrustlineStatusBadge";
import { READINESS_CONFIG } from "@/lib/readiness";
import type { ReadinessStatus } from "@/types";

/**
 * Trustline states as maintainers see them in the contributor table:
 * - known + healthy       → "ready"
 * - known + low XLM       → "low_reserve"
 * - missing / unknown     → "not_ready" (no trustline, unfunded, or unauthorized)
 */
const CASES: Array<{
  status: ReadinessStatus;
  scenario: string;
  label: string;
  icon: string;
  colorClass: string;
}> = [
  {
    status: "ready",
    scenario: "trustline known and healthy",
    label: "Ready",
    icon: "✅",
    colorClass: "emerald",
  },
  {
    status: "low_reserve",
    scenario: "trustline known but XLM reserve is low",
    label: "Low balance",
    icon: "⚠️",
    colorClass: "amber",
  },
  {
    status: "not_ready",
    scenario: "trustline missing or unknown",
    label: "Not ready yet",
    icon: "❌",
    colorClass: "red",
  },
];

describe("TrustlineStatusBadge", () => {
  describe.each(CASES)("$status ($scenario)", ({ status, label, icon, colorClass }) => {
    it("renders the expected label text", () => {
      render(<TrustlineStatusBadge status={status} />);

      const badge = screen.getByTestId(`readiness-badge-${status}`);
      expect(badge).toHaveTextContent(label);
      expect(label).toBe(READINESS_CONFIG[status].label);
    });

    it("conveys the status through text, not color alone", () => {
      render(<TrustlineStatusBadge status={status} />);

      const badge = screen.getByTestId(`readiness-badge-${status}`);
      // The icon is decorative; the visible label must carry the meaning.
      const iconEl = badge.querySelector("[aria-hidden='true']");
      expect(iconEl).toHaveTextContent(icon);
      expect(badge.textContent?.replace(icon, "").trim()).toBe(label);
      expect(screen.getByText(label)).toBeVisible();
    });

    it("exposes the plain-language description as a tooltip", () => {
      render(<TrustlineStatusBadge status={status} />);

      expect(screen.getByTestId(`readiness-badge-${status}`)).toHaveAttribute(
        "title",
        READINESS_CONFIG[status].description
      );
    });

    it("applies the matching color variant", () => {
      render(<TrustlineStatusBadge status={status} />);

      expect(screen.getByTestId(`readiness-badge-${status}`).className).toContain(
        colorClass
      );
    });

    it("renders description and next step when showDescription is set", () => {
      render(<TrustlineStatusBadge status={status} showDescription />);

      expect(screen.getByTestId("readiness-description")).toHaveTextContent(
        READINESS_CONFIG[status].description
      );
      expect(screen.getByTestId("readiness-next-step")).toHaveTextContent(
        `What to do next: ${READINESS_CONFIG[status].nextStep}`
      );
    });
  });

  it("renders distinct labels for every status", () => {
    const labels = CASES.map(({ status }) => {
      const { unmount } = render(<TrustlineStatusBadge status={status} />);
      const text = screen.getByTestId(`readiness-badge-${status}`).textContent;
      unmount();
      return text;
    });

    expect(new Set(labels).size).toBe(CASES.length);
  });

  it("omits description and next step by default (dense table contexts)", () => {
    render(<TrustlineStatusBadge status="not_ready" />);

    expect(screen.queryByTestId("readiness-description")).not.toBeInTheDocument();
    expect(screen.queryByTestId("readiness-next-step")).not.toBeInTheDocument();
  });

  it("applies className to the badge when rendered alone", () => {
    render(<TrustlineStatusBadge status="ready" className="custom-class" />);

    expect(screen.getByTestId("readiness-badge-ready").className).toContain(
      "custom-class"
    );
  });

  it("applies className to the wrapper when showDescription is set", () => {
    const { container } = render(
      <TrustlineStatusBadge status="ready" className="custom-class" showDescription />
    );

    expect((container.firstChild as HTMLElement).className).toContain("custom-class");
    expect(screen.getByTestId("readiness-badge-ready").className).not.toContain(
      "custom-class"
    );
  });
});
