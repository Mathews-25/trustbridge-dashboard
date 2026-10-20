-- Preserve registration history while allowing an address to be registered again.
ALTER TABLE "Registration" ADD COLUMN "deletedAt" TIMESTAMP(3);

DROP INDEX "Registration_stellarAddress_key";

CREATE UNIQUE INDEX "Registration_stellarAddress_active_key"
  ON "Registration"("stellarAddress")
  WHERE "deletedAt" IS NULL;

CREATE INDEX "Registration_deletedAt_idx" ON "Registration"("deletedAt");