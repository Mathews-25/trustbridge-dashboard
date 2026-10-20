import { describe, expect, it } from "vitest";

import { escapeXml, renderBadgeSvg } from "./badge-svg";

describe("badge-svg", () => {
  describe("escapeXml", () => {
    it("escapes special XML characters", () => {
      expect(escapeXml('<script>alert("xss") & \'foo\'</script>')).toBe(
        "&lt;script&gt;alert(&quot;xss&quot;) &amp; &apos;foo&apos;&lt;/script&gt;"
      );
    });
  });

  describe("renderBadgeSvg", () => {
    it("renders ready state with green color", () => {
      const svg = renderBadgeSvg("ready");
      expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
      expect(svg).toContain("ready");
      expect(svg).toContain("#2ea44f"); // green color
    });

    it("renders low_reserve state with amber color", () => {
      const svg = renderBadgeSvg("low_reserve");
      expect(svg).toContain("low balance");
      expect(svg).toContain("#d97706"); // amber color
    });

    it("renders not_ready state with red color", () => {
      const svg = renderBadgeSvg("not_ready");
      expect(svg).toContain("not ready");
      expect(svg).toContain("#dc2626"); // red color
    });

    it("renders unknown state for unhandled status", () => {
      const svg = renderBadgeSvg("something_else");
      expect(svg).toContain("unknown");
      expect(svg).toContain("#6e7681"); // gray color
    });

    it("uses custom label when provided", () => {
      const svg = renderBadgeSvg("ready", { label: "trustline" });
      expect(svg).toContain("trustline");
    });

    it("does not contain any PII or Stellar address patterns", () => {
      const svg = renderBadgeSvg("ready");
      // Check for Stellar address format G[A-Z0-9]{55}
      expect(svg).not.toMatch(/G[A-Z0-9]{55}/);
      // Check for email patterns
      expect(svg).not.toMatch(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    });

    it("escapes malicious user-supplied labels", () => {
      const svg = renderBadgeSvg("ready", { label: '<image src=x onerror=alert(1)>' });
      expect(svg).not.toContain('<image src=x');
      expect(svg).toContain('&lt;image src=x');
    });
  });
});
