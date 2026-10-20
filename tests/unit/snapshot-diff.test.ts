import { describe, it, expect } from "vitest";
import {
  parseCsvLine,
  validateAndParseSnapshotCsv,
  diffSnapshots,
  buildDiffCsv,
  SnapshotParseError,
  MAX_FILE_SIZE_BYTES,
  type SnapshotRow,
  type DiffResult,
} from "@/lib/snapshot-diff";

describe("snapshot-diff", () => {
  describe("parseCsvLine", () => {
    it("parses simple comma-separated values", () => {
      const line = "alice,GDXNXL25GDM3N5LAR5FALA3VSGHFET3EOKLXRP3ITPPMR3PISTQSKSFS";
      const result = parseCsvLine(line);
      expect(result).toEqual([
        "alice",
        "GDXNXL25GDM3N5LAR5FALA3VSGHFET3EOKLXRP3ITPPMR3PISTQSKSFS",
      ]);
    });

    it("handles quoted fields with embedded commas", () => {
      const line = 'alice,"G123,456",ready';
      const result = parseCsvLine(line);
      expect(result).toEqual(["alice", "G123,456", "ready"]);
    });

    it("unescapes escaped quotes in quoted fields", () => {
      const line = 'alice,"He said ""hello""",ready';
      const result = parseCsvLine(line);
      expect(result).toEqual(["alice", 'He said "hello"', "ready"]);
    });

    it("trims whitespace from fields", () => {
      const line = "  alice  ,  GDXNXL25GDM3N5LAR5FALA3VSGHFET3EOKLXRP3ITPPMR3PISTQSKSFS  ";
      const result = parseCsvLine(line);
      expect(result).toEqual([
        "alice",
        "GDXNXL25GDM3N5LAR5FALA3VSGHFET3EOKLXRP3ITPPMR3PISTQSKSFS",
      ]);
    });

    it("handles empty fields", () => {
      const line = "alice,,ready";
      const result = parseCsvLine(line);
      expect(result).toEqual(["alice", "", "ready"]);
    });

    it("handles quoted empty fields", () => {
      const line = 'alice,"",ready';
      const result = parseCsvLine(line);
      expect(result).toEqual(["alice", "", "ready"]);
    });

    it("handles consecutive escaped quotes", () => {
      const line = 'name,"""quoted""",status';
      const result = parseCsvLine(line);
      expect(result).toEqual(["name", '"quoted"', "status"]);
    });
  });

  describe("validateAndParseSnapshotCsv", () => {
    it("throws error for empty CSV", () => {
      expect(() => validateAndParseSnapshotCsv("")).toThrow(SnapshotParseError);
      expect(() => validateAndParseSnapshotCsv("   ")).toThrow(SnapshotParseError);
    });

    it("throws error for CSV exceeding size limit", () => {
      const largeContent = "a".repeat(MAX_FILE_SIZE_BYTES + 1);
      expect(() => validateAndParseSnapshotCsv(largeContent)).toThrow(
        SnapshotParseError
      );
    });

    it("throws error for missing required columns", () => {
      const csv = "username,address\nalice,G123";
      expect(() => validateAndParseSnapshotCsv(csv)).toThrow(
        SnapshotParseError
      );
    });

    it("parses CSV with required columns in any order", () => {
      const csv =
        "stellarAddress,githubUsername\nGDXNXL25GDM3N5LAR5FALA3VSGHFET3EOKLXRP3ITPPMR3PISTQSKSFS,alice";
      const result = validateAndParseSnapshotCsv(csv);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        githubUsername: "alice",
        stellarAddress: "GDXNXL25GDM3N5LAR5FALA3VSGHFET3EOKLXRP3ITPPMR3PISTQSKSFS",
        readiness: null,
      });
    });

    it("parses CSV with optional readiness column", () => {
      const csv =
        "githubUsername,stellarAddress,readiness\nalice,GDXNXL25GDM3N5LAR5FALA3VSGHFET3EOKLXRP3ITPPMR3PISTQSKSFS,ready";
      const result = validateAndParseSnapshotCsv(csv);
      expect(result[0].readiness).toBe("ready");
    });

    it("handles readiness column case-insensitively in header", () => {
      const csv =
        "GithubUsername,StellarAddress,READINESS\nalice,GDXNXL25GDM3N5LAR5FALA3VSGHFET3EOKLXRP3ITPPMR3PISTQSKSFS,ready";
      const result = validateAndParseSnapshotCsv(csv);
      expect(result[0].readiness).toBe("ready");
    });

    it("treats empty readiness field as null", () => {
      const csv =
        "githubUsername,stellarAddress,readiness\nalice,GDXNXL25GDM3N5LAR5FALA3VSGHFET3EOKLXRP3ITPPMR3PISTQSKSFS,";
      const result = validateAndParseSnapshotCsv(csv);
      expect(result[0].readiness).toBeNull();
    });

    it("throws error for empty githubUsername", () => {
      const csv =
        "githubUsername,stellarAddress\n,GDXNXL25GDM3N5LAR5FALA3VSGHFET3EOKLXRP3ITPPMR3PISTQSKSFS";
      expect(() => validateAndParseSnapshotCsv(csv)).toThrow(
        SnapshotParseError
      );
    });

    it("throws error for empty stellarAddress", () => {
      const csv = "githubUsername,stellarAddress\nalice,";
      expect(() => validateAndParseSnapshotCsv(csv)).toThrow(
        SnapshotParseError
      );
    });

    it("throws error for duplicate githubUsername (case-insensitive)", () => {
      const csv =
        "githubUsername,stellarAddress\nalice,GDXNXL25GDM3N5LAR5FALA3VSGHFET3EOKLXRP3ITPPMR3PISTQSKSFS\nAlice,GBSX7U7ARH74ENSCCX7FYTA5FS2YQXZHY737IBSZEOF72ULMITMZNKQ";
      expect(() => validateAndParseSnapshotCsv(csv)).toThrow(
        SnapshotParseError
      );
    });

    it("ignores completely empty rows", () => {
      const csv =
        "githubUsername,stellarAddress\nalice,GDXNXL25GDM3N5LAR5FALA3VSGHFET3EOKLXRP3ITPPMR3PISTQSKSFS\n\nbob,GBSX7U7ARH74ENSCCX7FYTA5FS2YQXZHY737IBSZEOF72ULMITMZNKQ";
      const result = validateAndParseSnapshotCsv(csv);
      expect(result).toHaveLength(2);
      expect(result[0].githubUsername).toBe("alice");
      expect(result[1].githubUsername).toBe("bob");
    });

    it("handles Windows and Unix line endings", () => {
      const csvWindows =
        "githubUsername,stellarAddress\r\nalice,GDXNXL25GDM3N5LAR5FALA3VSGHFET3EOKLXRP3ITPPMR3PISTQSKSFS\r\nbob,GBSX7U7ARH74ENSCCX7FYTA5FS2YQXZHY737IBSZEOF72ULMITMZNKQ";
      const result = validateAndParseSnapshotCsv(csvWindows);
      expect(result).toHaveLength(2);
    });

    it("handles quoted commas in username and address fields", () => {
      const csv =
        'githubUsername,stellarAddress\n"alice,smith","GDXNXL,25GDM3N5LAR5FALA3VSGHFET3EOKLXRP3ITPPMR3PISTQSKSFS"';
      const result = validateAndParseSnapshotCsv(csv);
      expect(result[0].githubUsername).toBe("alice,smith");
    });
  });

  describe("diffSnapshots", () => {
    const oldAddressAlice = "GDXNXL25GDM3N5LAR5FALA3VSGHFET3EOKLXRP3ITPPMR3PISTQSKSFS";
    const newAddressAlice = "GBSX7U7ARH74ENSCCX7FYTA5FS2YQXZHY737IBSZEOF72ULMITMZNKQ";
    const addressBob = "GDZST3XVCDTUJ76ZAV2HA72KYAZXR54YQPWPAHDHQG2YSIGWVB2ZXYXX";

    it("identifies added entries", () => {
      const old: SnapshotRow[] = [];
      const new_: SnapshotRow[] = [
        { githubUsername: "alice", stellarAddress: oldAddressAlice },
      ];

      const diff = diffSnapshots(old, new_);

      expect(diff.added).toHaveLength(1);
      expect(diff.added[0]).toMatchObject({
        githubUsername: "alice",
        change: "added",
        oldAddress: null,
        newAddress: oldAddressAlice,
      });
      expect(diff.summary.addedCount).toBe(1);
      expect(diff.summary.netChange).toBe(1);
    });

    it("identifies removed entries", () => {
      const old: SnapshotRow[] = [
        { githubUsername: "alice", stellarAddress: oldAddressAlice },
      ];
      const new_: SnapshotRow[] = [];

      const diff = diffSnapshots(old, new_);

      expect(diff.removed).toHaveLength(1);
      expect(diff.removed[0]).toMatchObject({
        githubUsername: "alice",
        change: "removed",
        oldAddress: oldAddressAlice,
        newAddress: null,
      });
      expect(diff.summary.removedCount).toBe(1);
      expect(diff.summary.netChange).toBe(-1);
    });

    it("identifies address changes", () => {
      const old: SnapshotRow[] = [
        { githubUsername: "alice", stellarAddress: oldAddressAlice },
      ];
      const new_: SnapshotRow[] = [
        { githubUsername: "alice", stellarAddress: newAddressAlice },
      ];

      const diff = diffSnapshots(old, new_);

      expect(diff.addressChanged).toHaveLength(1);
      expect(diff.addressChanged[0]).toMatchObject({
        githubUsername: "alice",
        change: "address_changed",
        oldAddress: oldAddressAlice,
        newAddress: newAddressAlice,
      });
      expect(diff.summary.addressChangedCount).toBe(1);
    });

    it("identifies unchanged entries", () => {
      const old: SnapshotRow[] = [
        { githubUsername: "alice", stellarAddress: oldAddressAlice },
      ];
      const new_: SnapshotRow[] = [
        { githubUsername: "alice", stellarAddress: oldAddressAlice },
      ];

      const diff = diffSnapshots(old, new_);

      expect(diff.unchanged).toHaveLength(1);
      expect(diff.unchanged[0]).toMatchObject({
        githubUsername: "alice",
        change: "unchanged",
        oldAddress: oldAddressAlice,
        newAddress: oldAddressAlice,
      });
      expect(diff.summary.unchangedCount).toBe(1);
    });

    it("handles mixed changes", () => {
      const old: SnapshotRow[] = [
        { githubUsername: "alice", stellarAddress: oldAddressAlice },
        { githubUsername: "bob", stellarAddress: addressBob },
        { githubUsername: "charlie", stellarAddress: "GAAAA" },
      ];
      const new_: SnapshotRow[] = [
        { githubUsername: "alice", stellarAddress: newAddressAlice },
        { githubUsername: "bob", stellarAddress: addressBob },
        { githubUsername: "diana", stellarAddress: "GDDDD" },
      ];

      const diff = diffSnapshots(old, new_);

      expect(diff.added).toHaveLength(1);
      expect(diff.added[0].githubUsername).toBe("diana");
      expect(diff.removed).toHaveLength(1);
      expect(diff.removed[0].githubUsername).toBe("charlie");
      expect(diff.addressChanged).toHaveLength(1);
      expect(diff.addressChanged[0].githubUsername).toBe("alice");
      expect(diff.unchanged).toHaveLength(1);
      expect(diff.unchanged[0].githubUsername).toBe("bob");
      expect(diff.summary.netChange).toBe(0);
    });

    it("tracks readiness changes across snapshots", () => {
      const old: SnapshotRow[] = [
        {
          githubUsername: "alice",
          stellarAddress: oldAddressAlice,
          readiness: "pending",
        },
      ];
      const new_: SnapshotRow[] = [
        {
          githubUsername: "alice",
          stellarAddress: oldAddressAlice,
          readiness: "ready",
        },
      ];

      const diff = diffSnapshots(old, new_);

      expect(diff.unchanged).toHaveLength(1);
      expect(diff.unchanged[0].oldReadiness).toBe("pending");
      expect(diff.unchanged[0].newReadiness).toBe("ready");
    });

    it("sorts entries alphabetically by githubUsername", () => {
      const old: SnapshotRow[] = [];
      const new_: SnapshotRow[] = [
        { githubUsername: "zoe", stellarAddress: "GZZZZ" },
        { githubUsername: "alice", stellarAddress: "GAAAA" },
        { githubUsername: "bob", stellarAddress: "GBBBB" },
      ];

      const diff = diffSnapshots(old, new_);

      expect(diff.added).toHaveLength(3);
      expect(diff.added[0].githubUsername).toBe("alice");
      expect(diff.added[1].githubUsername).toBe("bob");
      expect(diff.added[2].githubUsername).toBe("zoe");
    });

    it("handles case-insensitive username matching", () => {
      const old: SnapshotRow[] = [
        { githubUsername: "Alice", stellarAddress: oldAddressAlice },
      ];
      const new_: SnapshotRow[] = [
        { githubUsername: "alice", stellarAddress: newAddressAlice },
      ];

      const diff = diffSnapshots(old, new_);

      expect(diff.addressChanged).toHaveLength(1);
      expect(diff.added).toHaveLength(0);
      expect(diff.removed).toHaveLength(0);
    });

    it("calculates correct summary totals", () => {
      const old: SnapshotRow[] = [
        { githubUsername: "alice", stellarAddress: oldAddressAlice },
        { githubUsername: "bob", stellarAddress: addressBob },
      ];
      const new_: SnapshotRow[] = [
        { githubUsername: "alice", stellarAddress: newAddressAlice },
        { githubUsername: "bob", stellarAddress: addressBob },
        { githubUsername: "charlie", stellarAddress: "GCCCC" },
      ];

      const diff = diffSnapshots(old, new_);

      expect(diff.summary.totalOld).toBe(2);
      expect(diff.summary.totalNew).toBe(3);
      expect(diff.summary.addedCount).toBe(1);
      expect(diff.summary.removedCount).toBe(0);
      expect(diff.summary.addressChangedCount).toBe(1);
      expect(diff.summary.unchangedCount).toBe(1);
      expect(diff.summary.netChange).toBe(1);
    });
  });

  describe("buildDiffCsv", () => {
    const sampleDiff: DiffResult = {
      added: [
        {
          githubUsername: "alice",
          change: "added",
          oldAddress: null,
          newAddress: "GAAAA",
          oldReadiness: null,
          newReadiness: "ready",
        },
      ],
      removed: [
        {
          githubUsername: "bob",
          change: "removed",
          oldAddress: "GBBBB",
          newAddress: null,
          oldReadiness: "pending",
          newReadiness: null,
        },
      ],
      addressChanged: [
        {
          githubUsername: "charlie",
          change: "address_changed",
          oldAddress: "GCCCC",
          newAddress: "GCCCC2",
          oldReadiness: "ready",
          newReadiness: "ready",
        },
      ],
      unchanged: [
        {
          githubUsername: "diana",
          change: "unchanged",
          oldAddress: "GDDDD",
          newAddress: "GDDDD",
          oldReadiness: "ready",
          newReadiness: "ready",
        },
      ],
      summary: {
        totalOld: 3,
        totalNew: 3,
        addedCount: 1,
        removedCount: 1,
        addressChangedCount: 1,
        unchangedCount: 1,
        netChange: 0,
      },
    };

    it("builds CSV with proper headers", () => {
      const csv = buildDiffCsv(sampleDiff);
      const lines = csv.split("\n");
      expect(lines[0]).toContain("change");
      expect(lines[0]).toContain("githubUsername");
      expect(lines[0]).toContain("oldStellarAddress");
      expect(lines[0]).toContain("newStellarAddress");
    });

    it("includes added entries in CSV", () => {
      const csv = buildDiffCsv(sampleDiff);
      expect(csv).toContain("added");
      expect(csv).toContain("alice");
      expect(csv).toContain("GAAAA");
    });

    it("includes removed entries in CSV", () => {
      const csv = buildDiffCsv(sampleDiff);
      expect(csv).toContain("removed");
      expect(csv).toContain("bob");
      expect(csv).toContain("GBBBB");
    });

    it("includes address_changed entries in CSV", () => {
      const csv = buildDiffCsv(sampleDiff);
      expect(csv).toContain("address_changed");
      expect(csv).toContain("charlie");
    });

    it("excludes unchanged entries by default", () => {
      const csv = buildDiffCsv(sampleDiff, { includeUnchanged: false });
      const lines = csv.split("\n");
      // Should have header + 3 data rows (added, removed, address_changed)
      expect(lines.length).toBeLessThan(6);
      expect(csv).not.toContain("diana");
    });

    it("includes unchanged entries when option is true", () => {
      const csv = buildDiffCsv(sampleDiff, { includeUnchanged: true });
      expect(csv).toContain("unchanged");
      expect(csv).toContain("diana");
    });

    it("properly escapes special characters", () => {
      const diffWithSpecialChars: DiffResult = {
        added: [
          {
            githubUsername: "alice,smith",
            change: "added",
            oldAddress: null,
            newAddress: 'G"AAAA"',
            oldReadiness: null,
            newReadiness: 'ready=true',
          },
        ],
        removed: [],
        addressChanged: [],
        unchanged: [],
        summary: {
          totalOld: 0,
          totalNew: 1,
          addedCount: 1,
          removedCount: 0,
          addressChangedCount: 0,
          unchangedCount: 0,
          netChange: 1,
        },
      };

      const csv = buildDiffCsv(diffWithSpecialChars);
      // Fields with commas, quotes, or other special chars should be quoted and escaped
      expect(csv).toContain('"alice,smith"');
      expect(csv).toContain('"G""AAAA"""');
    });

    it("handles round-trip CSV parsing", () => {
      const csv = buildDiffCsv(sampleDiff, { includeUnchanged: true });
      const lines = csv.split("\n").filter((l) => l.trim());

      // Header + 4 data rows
      expect(lines).toHaveLength(5);

      // Verify structure
      expect(lines[0]).toMatch(/change.*githubUsername/);
      expect(lines[1]).toContain("added");
      expect(lines[2]).toContain("removed");
      expect(lines[3]).toContain("address_changed");
      expect(lines[4]).toContain("unchanged");
    });

    it("ends with newline", () => {
      const csv = buildDiffCsv(sampleDiff);
      expect(csv.endsWith("\n")).toBe(true);
    });

    it("handles empty diff", () => {
      const emptyDiff: DiffResult = {
        added: [],
        removed: [],
        addressChanged: [],
        unchanged: [],
        summary: {
          totalOld: 0,
          totalNew: 0,
          addedCount: 0,
          removedCount: 0,
          addressChangedCount: 0,
          unchangedCount: 0,
          netChange: 0,
        },
      };

      const csv = buildDiffCsv(emptyDiff);
      const lines = csv.split("\n").filter((l) => l.trim());
      // Should have just the header
      expect(lines).toHaveLength(1);
    });

    it("escapes Stellar addresses that could be interpreted as formulas", () => {
      const diffWithFormula: DiffResult = {
        added: [
          {
            githubUsername: "alice",
            change: "added",
            oldAddress: null,
            newAddress: "=IMPORTXML(GDXXXX)",
            oldReadiness: null,
            newReadiness: null,
          },
        ],
        removed: [],
        addressChanged: [],
        unchanged: [],
        summary: {
          totalOld: 0,
          totalNew: 1,
          addedCount: 1,
          removedCount: 0,
          addressChangedCount: 0,
          unchangedCount: 0,
          netChange: 1,
        },
      };

      const csv = buildDiffCsv(diffWithFormula);
      // Formula-like strings should be quoted
      expect(csv).toContain('"=IMPORTXML(GDXXXX)"');
    });
  });
});
