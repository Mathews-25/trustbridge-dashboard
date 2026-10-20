import { describe, expect, it } from "vitest";

import {
  describeAuditAction,
  summarizeAuditLog,
  toAuditLogEntry,
} from "@/lib/audit-format";
import type { AuditLogEntry } from "@/types";

describe("describeAuditAction", () => {
  it("returns a friendly label for known actions", () => {
    expect(describeAuditAction("recheck.single")).toBe(
      "Re-checked a contributor"
    );
    expect(describeAuditAction("export.cron")).toBe(
      "Automated nightly treasury CSV export"
    );
  });

  it("falls back to the raw action for unknown ones", () => {
    expect(describeAuditAction("mystery.action")).toBe("mystery.action");
  });
});

describe("toAuditLogEntry", () => {
  const base = {
    id: "log_1",
    actorId: "user_1",
    actorLogin: "octocat",
    action: "recheck.single",
    targetId: "reg_1",
    targetLabel: "octocat",
  };

  it("serializes a Date createdAt to ISO", () => {
    const entry = toAuditLogEntry({
      ...base,
      metadata: { readiness: "ready" },
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    expect(entry.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(entry.metadata).toEqual({ readiness: "ready" });
  });

  it("normalizes non-object metadata to null", () => {
    const entry = toAuditLogEntry({
      ...base,
      metadata: "not-json",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(entry.metadata).toBeNull();
  });
});

describe("summarizeAuditLog", () => {
  it("counts entries by action", () => {
    const entries: AuditLogEntry[] = [
      makeEntry("recheck.single"),
      makeEntry("recheck.single"),
      makeEntry("recheck.batch"),
    ];
    expect(summarizeAuditLog(entries)).toEqual({
      total: 3,
      byAction: { "recheck.single": 2, "recheck.batch": 1 },
    });
  });
});

function makeEntry(action: string): AuditLogEntry {
  return {
    id: `log_${action}`,
    actorId: null,
    actorLogin: null,
    action,
    targetId: null,
    targetLabel: null,
    metadata: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}
