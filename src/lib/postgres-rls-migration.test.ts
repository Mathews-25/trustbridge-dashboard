import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "prisma/migrations/20260828000000_add_maintainer_org_rls/migration.sql",
  "utf8",
);

describe("Postgres maintainer-org RLS migration", () => {
  it("protects every Prisma model table and does not rely on a superuser bypass", () => {
    for (const table of [
      "User",
      "TokenAuditLog",
      "Registration",
      "dispute_proofs",
      "AddressHistoryRecord",
      "AuditLog",
      "Invite",
      "QueueJob",
      "Account",
      "Session",
      "VerificationToken",
    ]) {
      expect(migration).toContain(`'${table}'`);
    }

    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("FORCE ROW LEVEL SECURITY");
    expect(migration).toContain("current_setting('app.maintainer_org_id', true)");
    expect(migration).toContain("WITH CHECK");
  });
});