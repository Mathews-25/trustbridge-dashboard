import { describe, it, expect } from "vitest";

import {
  CONTRIBUTOR_COLUMNS,
  compareContributors,
  countReadyContributors,
  defaultVisibleColumns,
  filterContributors,
  searchContributors,
  sortContributors,
} from "@/lib/contributors";
import type { ContributorRow } from "@/types";

// ── Fixtures ──────────────────────────────────────────────────────────────

function makeRow(
  overrides: Partial<ContributorRow> & { id: string }
): ContributorRow {
  return {
    githubUsername: overrides.id,
    stellarAddress: `GADDR_${overrides.id}`,
    trustlineReady: true,
    trustlineAuthorized: true,
    verified: true,
    funded: true,
    xlmBalance: "5",
    spendableXlmBalance: "3",
    lastCheckedAt: new Date("2026-01-01T00:00:00Z").toISOString(),
    readiness: "ready",
    ...overrides,
  };
}

const rowReady        = makeRow({ id: "alice",   readiness: "ready"      });
const rowLowReserve   = makeRow({ id: "bob",     readiness: "low_reserve", xlmBalance: "1.5" });
const rowNotReady     = makeRow({ id: "charlie", readiness: "not_ready", funded: false });
const rowAlice2       = makeRow({ id: "dave",    readiness: "ready"      });

const allRows: ContributorRow[] = [rowReady, rowLowReserve, rowNotReady, rowAlice2];

// ── filterContributors ────────────────────────────────────────────────────

describe("filterContributors", () => {
  it("returns all rows for the 'all' filter", () => {
    expect(filterContributors(allRows, "all")).toHaveLength(4);
  });

  it("returns only 'ready' rows", () => {
    const result = filterContributors(allRows, "ready");
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.readiness === "ready")).toBe(true);
  });

  it("returns only 'low_reserve' rows", () => {
    const result = filterContributors(allRows, "low_reserve");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(rowLowReserve.id);
  });

  it("returns 'needs_attention' rows (low_reserve + not_ready)", () => {
    const result = filterContributors(allRows, "needs_attention");
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.readiness !== "ready")).toBe(true);
  });

  it("returns an empty array when no rows match", () => {
    const onlyReady = [rowReady];
    expect(filterContributors(onlyReady, "needs_attention")).toHaveLength(0);
  });
});

// ── searchContributors ────────────────────────────────────────────────────

describe("searchContributors", () => {
  it("returns all contributors when query is empty", () => {
    expect(searchContributors(allRows, "")).toHaveLength(4);
    expect(searchContributors(allRows, "   ")).toHaveLength(4);
  });

  it("matches by GitHub username (case-insensitive)", () => {
    const result = searchContributors(allRows, "ALICE");
    expect(result).toHaveLength(1);
    expect(result[0].githubUsername).toBe("alice");
  });

  it("matches by Stellar address prefix (case-insensitive)", () => {
    const result = searchContributors(allRows, "GADDR_BOB");
    expect(result).toHaveLength(1);
    expect(result[0].githubUsername).toBe("bob");
  });

  it("matches small typos in GitHub usernames and addresses", () => {
    expect(searchContributors(allRows, "alce")).toHaveLength(1);
    expect(searchContributors(allRows, "gaddr_charl")).toHaveLength(1);
    expect(searchContributors(allRows, "gaddr_chaarlie")).toHaveLength(1);
  });

  it("returns empty array when nothing matches", () => {
    expect(searchContributors(allRows, "zzz_no_match")).toHaveLength(0);
  });

  it("partial match works across multiple rows", () => {
    // all rows have stellar addresses starting with "gaddr_"
    const result = searchContributors(allRows, "gaddr_");
    expect(result).toHaveLength(4);
  });
});

// ── compareContributors / sortContributors ────────────────────────────────

describe("sortContributors", () => {
  it("sorts by githubUsername ascending", () => {
    const sorted = sortContributors(allRows, "githubUsername", true);
    const names = sorted.map((r) => r.githubUsername);
    expect(names).toEqual([...names].sort());
  });

  it("sorts by githubUsername descending", () => {
    const sorted = sortContributors(allRows, "githubUsername", false);
    const names = sorted.map((r) => r.githubUsername);
    expect(names).toEqual([...names].sort().reverse());
  });

  it("sorts by xlmBalance ascending", () => {
    const sorted = sortContributors(allRows, "xlmBalance", true);
    for (let i = 0; i < sorted.length - 1; i++) {
      expect(Number(sorted[i].xlmBalance)).toBeLessThanOrEqual(
        Number(sorted[i + 1].xlmBalance)
      );
    }
  });

  it("sorts by readiness: ready first, not_ready last", () => {
    const sorted = sortContributors(allRows, "readiness", true);
    const statuses = sorted.map((r) => r.readiness);
    // ready rows come before low_reserve before not_ready
    const readyIdx     = statuses.indexOf("ready");
    const lowIdx       = statuses.indexOf("low_reserve");
    const notReadyIdx  = statuses.indexOf("not_ready");
    expect(readyIdx).toBeLessThan(lowIdx);
    expect(lowIdx).toBeLessThan(notReadyIdx);
  });

  it("sorts by lastCheckedAt ascending", () => {
    const earlier = makeRow({ id: "early", lastCheckedAt: "2025-01-01T00:00:00Z" });
    const later   = makeRow({ id: "late",  lastCheckedAt: "2026-06-01T00:00:00Z" });
    const sorted  = sortContributors([later, earlier], "lastCheckedAt", true);
    expect(sorted[0].githubUsername).toBe("early");
  });

  it("does not mutate the original array", () => {
    const original = [...allRows];
    sortContributors(allRows, "githubUsername", true);
    expect(allRows).toEqual(original);
  });
});

// ── countReadyContributors ────────────────────────────────────────────────

describe("countReadyContributors", () => {
  it("counts only ready rows", () => {
    expect(countReadyContributors(allRows)).toBe(2);
  });

  it("returns 0 for an empty array", () => {
    expect(countReadyContributors([])).toBe(0);
  });
});

// ── Column definitions ────────────────────────────────────────────────────

describe("CONTRIBUTOR_COLUMNS / defaultVisibleColumns", () => {
  it("exports a non-empty columns array", () => {
    expect(CONTRIBUTOR_COLUMNS.length).toBeGreaterThan(0);
  });

  it("defaultVisibleColumns includes core columns", () => {
    const visible = defaultVisibleColumns();
    expect(visible.has("githubUsername")).toBe(true);
    expect(visible.has("readiness")).toBe(true);
    expect(visible.has("lastCheckedAt")).toBe(true);
  });

  it("spendableXlmBalance is hidden by default", () => {
    expect(defaultVisibleColumns().has("spendableXlmBalance")).toBe(false);
  });

  it("every CONTRIBUTOR_COLUMNS entry has a key and label", () => {
    for (const col of CONTRIBUTOR_COLUMNS) {
      expect(col.key).toBeTruthy();
      expect(col.label).toBeTruthy();
    }
  });
});
