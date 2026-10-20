/**
 * Issue #143 — skip links and document landmarks.
 *
 * A skip link is only useful if three things hold: it is the first thing a
 * keyboard user reaches, it becomes visible when focused, and its target can
 * actually receive focus. Testing the markup rather than the rendered CSS is
 * the trade-off jsdom forces — the class names are asserted instead of the
 * computed styles, so the visibility rule is checked by name.
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

/**
 * The skip link and `main` live in `layout.tsx` and `Providers.tsx`, which are
 * Next.js server/provider shells that drag in SessionProvider, react-query and
 * next-themes. This mirrors their markup so the contract can be asserted
 * without standing up the whole provider tree; `layout.test` guards the real
 * files staying in step.
 */
function DocumentShell({ children }: { children?: React.ReactNode }) {
  return (
    <>
      <a
        href="#main-content"
        data-testid="skip-to-main"
        className="sr-only z-[100] rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        Skip to main content
      </a>
      <header>
        <nav aria-label="Main">
          <a href="/">Home</a>
        </nav>
      </header>
      <main id="main-content" tabIndex={-1} className="outline-none">
        {children}
      </main>
    </>
  );
}

describe("skip link", () => {
  it("is the first focusable element in the document", async () => {
    const user = userEvent.setup();
    render(
      <DocumentShell>
        <button type="button">In page</button>
      </DocumentShell>
    );

    await user.tab();

    expect(screen.getByTestId("skip-to-main")).toHaveFocus();
  });

  it("names its destination", () => {
    render(<DocumentShell />);

    expect(
      screen.getByRole("link", { name: "Skip to main content" })
    ).toBeInTheDocument();
  });

  it("points at the main landmark", () => {
    render(<DocumentShell />);

    const link = screen.getByTestId("skip-to-main");
    expect(link).toHaveAttribute("href", "#main-content");
    expect(document.getElementById("main-content")).not.toBeNull();
  });

  it("is hidden until focused, then visible", () => {
    render(<DocumentShell />);

    const link = screen.getByTestId("skip-to-main");
    // `sr-only` hides it; `focus:not-sr-only` is what brings it back. A link
    // that stays invisible while focused leaves the user with no idea where
    // they are.
    expect(link.className).toContain("sr-only");
    expect(link.className).toContain("focus:not-sr-only");
  });

  it("keeps a visible focus ring when revealed", () => {
    render(<DocumentShell />);

    expect(screen.getByTestId("skip-to-main").className).toContain(
      "focus:ring-2"
    );
  });
});

describe("document landmarks", () => {
  it("exposes exactly one main landmark", () => {
    render(<DocumentShell />);

    expect(screen.getAllByRole("main")).toHaveLength(1);
  });

  it("makes main focusable without adding it to the tab order", async () => {
    const user = userEvent.setup();
    render(
      <DocumentShell>
        <button type="button">In page</button>
      </DocumentShell>
    );

    const main = screen.getByRole("main");
    // Safari and Firefox move the viewport but not focus unless the target is
    // programmatically focusable.
    expect(main).toHaveAttribute("tabindex", "-1");

    await user.tab();
    await user.tab();
    // Tabbing past the skip link reaches the nav link, never `main` itself.
    expect(main).not.toHaveFocus();
  });

  it("names the navigation landmark", () => {
    render(<DocumentShell />);

    expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument();
  });

  it("exposes a banner landmark", () => {
    render(<DocumentShell />);

    expect(screen.getByRole("banner")).toBeInTheDocument();
  });
});
