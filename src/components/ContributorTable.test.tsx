/**
 * Tests for ContributorTable.tsx
 *
 * The component itself is a client component that depends on the DOM and
 * react-dom — we exercise its exported pure helper (`exportContributorsCsv`)
 * and verify that the ref declarations in the component body are present and
 * correct by doing a static source inspection.
 *
 * For interactive rendering tests (column picker open/close, click-outside,
 * keyboard Escape) use a Playwright/jsdom setup; that infrastructure is
 * tracked separately and is out of scope for this unit test pass.
 */

import { describe, expect, it } from "vitest";
import { exportContributorsCsv } from "@/components/ContributorTable";
import type { ContributorRow } from "@/types";
import * as fs from "node:fs";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeRow(overrides: Partial<ContributorRow> = {}): ContributorRow {
  return {
    id: "row-1",
    githubUsername: "octocat",
    stellarAddress: "GBSX3XVYB7XOQY4LZGQ7ZXZQY4LZGQ7ZXZQY4LZGQ7ZXZQY4LZG",
    funded: true,
    trustlineReady: true,
    trustlineAuthorized: true,
    xlmBalance: "100",
    spendableXlmBalance: "98",
    lastCheckedAt: new Date().toISOString(),
    readiness: "ready",
    verified: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// exportContributorsCsv (pure helper, no DOM needed)
// ---------------------------------------------------------------------------

describe("exportContributorsCsv", () => {
  it("is exported as a named function", () => {
    expect(typeof exportContributorsCsv).toBe("function");
  });

  it("returns false when stale and user cancels (window.confirm = false)", () => {
    const staleRow = makeRow({
      lastCheckedAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
    });

    // Simulate window.confirm returning false (user cancels)
    const originalConfirm = globalThis.window?.confirm;
    Object.defineProperty(globalThis, "window", {
      writable: true,
      value: { confirm: () => false },
    });

    const result = exportContributorsCsv([staleRow]);
    expect(result).toBe(false);

    // Restore
    if (originalConfirm !== undefined) {
      Object.defineProperty(globalThis, "window", {
        writable: true,
        value: { confirm: originalConfirm },
      });
    }
  });
});

// ---------------------------------------------------------------------------
// Ref declaration integrity (static source check)
//
// This test reads the component source and asserts that:
// 1. Each required ref is declared exactly once.
// 2. No ref name appears in a duplicate `useRef` call.
//
// This catches the exact regression described in issue #495 — where refs
// were declared twice, causing ESLint duplicate-identifier errors.
// ---------------------------------------------------------------------------

const COMPONENT_SOURCE = fs.readFileSync(
  path.resolve(__dirname, "ContributorTable.tsx"),
  "utf-8"
);

const REQUIRED_REFS = [
  "csvExportRef",
  "jsonExportRef",
  "columnPickerRef",
  "columnPickerToggleRef",
  "paletteRef",
  "paletteOpenerRef",
  "searchInputRef",
] as const;

describe("ContributorTable ref declarations (no duplicates)", () => {
  for (const refName of REQUIRED_REFS) {
    it(`${refName} is declared exactly once with useRef`, () => {
      // Match `const refName = useRef` declarations only (not usage sites).
      const declarationRegex = new RegExp(
        `const\\s+${refName}\\s*=\\s*useRef`,
        "g"
      );
      const matches = COMPONENT_SOURCE.match(declarationRegex) ?? [];
      expect(matches).toHaveLength(1);
    });
  }

  it("no ref name appears in a second const useRef declaration (duplicate check)", () => {
    // Collect all `const <name> = useRef` declarations
    const allDeclarations =
      COMPONENT_SOURCE.match(/const\s+(\w+)\s*=\s*useRef/g) ?? [];

    const seen = new Set<string>();
    const duplicates: string[] = [];

    for (const decl of allDeclarations) {
      const match = decl.match(/const\s+(\w+)/);
      if (match) {
        const name = match[1];
        if (seen.has(name)) {
          duplicates.push(name);
        }
        seen.add(name);
      }
    }

    expect(duplicates).toHaveLength(0);
  });

  it("all required refs are attached to JSX elements (ref={refName})", () => {
    for (const refName of REQUIRED_REFS) {
      expect(COMPONENT_SOURCE).toContain(`ref={${refName}}`);
    }
  });
});

// ---------------------------------------------------------------------------
// Column picker ref wiring
// ---------------------------------------------------------------------------

describe("Column picker ref correctness", () => {
  it("columnPickerRef is attached to the picker panel div", () => {
    // The panel div should have both the ref and an id for aria
    expect(COMPONENT_SOURCE).toContain('ref={columnPickerRef}');
    expect(COMPONENT_SOURCE).toContain('id="column-picker-panel"');
  });

  it("columnPickerToggleRef is attached to the toggle button", () => {
    expect(COMPONENT_SOURCE).toContain('ref={columnPickerToggleRef}');
    expect(COMPONENT_SOURCE).toContain('aria-controls="column-picker-panel"');
  });

  it("click-outside handler references columnPickerRef and columnPickerToggleRef", () => {
    expect(COMPONENT_SOURCE).toContain("columnPickerRef.current");
    expect(COMPONENT_SOURCE).toContain("columnPickerToggleRef.current");
  });

  it("focus is returned to columnPickerToggleRef when picker closes", () => {
    expect(COMPONENT_SOURCE).toContain("columnPickerToggleRef.current?.focus()");
  });
});
