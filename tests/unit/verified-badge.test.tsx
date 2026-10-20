import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { VerifiedBadge } from "@/components/VerifiedBadge";

describe("VerifiedBadge", () => {
  describe("Verified state", () => {
    it("renders verified badge when verified=true", () => {
      const { container } = render(<VerifiedBadge verified={true} />);

      expect(screen.getByText("Verified")).toBeInTheDocument();
      expect(container.firstChild?.className).toContain("emerald");
    });

    it("shows correct title for verified state", () => {
      const { container } = render(<VerifiedBadge verified={true} />);

      const badge = container.querySelector("[title]");
      expect(badge?.getAttribute("title")).toContain(
        "On-chain verified: funded with an authorized trustline"
      );
    });

    it("renders BadgeCheck icon when verified", () => {
      const { container } = render(<VerifiedBadge verified={true} />);

      const icon = container.querySelector("svg");
      expect(icon).toBeInTheDocument();
    });
  });

  describe("Unverified state", () => {
    it("renders unverified badge when verified=false", () => {
      render(<VerifiedBadge verified={false} />);

      const badge = screen.getByText("Unverified");
      expect(badge).toBeInTheDocument();
    });

    it("shows correct title for unverified state", () => {
      const { container } = render(<VerifiedBadge verified={false} />);

      const badge = container.querySelector("[title]");
      expect(badge?.getAttribute("title")).toContain("Not yet verified on-chain");
    });

    it("uses outline variant for unverified", () => {
      const { container } = render(<VerifiedBadge verified={false} />);

      const badge = container.querySelector('[class*="outline"]');
      expect(badge).toBeInTheDocument();
    });
  });

  describe("Compact mode", () => {
    it("renders compact badge without visible text", () => {
      render(<VerifiedBadge verified={true} compact={true} />);

      expect(screen.queryByText("Verified")).not.toBeInTheDocument();
    });

    it("renders icon only (visually) in compact mode", () => {
      const { container } = render(<VerifiedBadge verified={true} compact={true} />);

      const icon = container.querySelector("svg");
      expect(icon).toBeInTheDocument();
    });

    it("exposes accessible name via aria-label when compact and verified", () => {
      const { container } = render(<VerifiedBadge verified={true} compact={true} />);

      const badge = container.firstChild as HTMLElement;
      expect(badge.getAttribute("aria-label")).toContain("On-chain verified");
    });

    it("exposes accessible name via aria-label when compact and unverified", () => {
      const { container } = render(<VerifiedBadge verified={false} compact={true} />);

      const badge = container.firstChild as HTMLElement;
      expect(badge.getAttribute("aria-label")).toContain("Not yet verified");
    });

    it("includes visually-hidden sr-only text when compact and verified", () => {
      render(<VerifiedBadge verified={true} compact={true} />);

      const srText = screen.getByText("On-chain verified: funded with an authorized trustline");
      expect(srText).toHaveClass("sr-only");
    });

    it("includes visually-hidden sr-only text when compact and unverified", () => {
      render(<VerifiedBadge verified={false} compact={true} />);

      const srText = screen.getByText("Not yet verified on-chain");
      expect(srText).toHaveClass("sr-only");
    });
  });

  describe("Styling", () => {
    it("applies custom className", () => {
      const { container } = render(
        <VerifiedBadge verified={true} className="custom-class" />
      );

      const badge = container.firstChild;
      expect(badge?.className).toContain("custom-class");
    });

    it("has accessible aria-hidden on icon", () => {
      const { container } = render(<VerifiedBadge verified={true} />);

      const icon = container.querySelector("svg");
      expect(icon?.getAttribute("aria-hidden")).toBe("true");
    });
  });

  describe("Icon rendering", () => {
    it("renders icon before text", () => {
      const { container } = render(<VerifiedBadge verified={true} />);

      const badge = container.firstChild;
      const children = Array.from(badge?.childNodes || []);

      expect(children.length).toBeGreaterThan(1);
    });

    it("uses correct icon size", () => {
      const { container } = render(<VerifiedBadge verified={true} />);

      const icon = container.querySelector("svg");
      expect(icon?.classList.contains("h-3.5")).toBe(true);
      expect(icon?.classList.contains("w-3.5")).toBe(true);
    });
  });

  describe("Accessibility", () => {
    it("provides title for screen readers", () => {
      const { container } = render(<VerifiedBadge verified={true} />);

      const badge = container.querySelector("[title]");
      expect(badge?.getAttribute("title")).toBeTruthy();
    });

    it("has decorative aria-hidden on icon", () => {
      const { container } = render(<VerifiedBadge verified={true} />);

      const icon = container.querySelector("[aria-hidden='true']");
      expect(icon).toBeInTheDocument();
    });
  });
});
