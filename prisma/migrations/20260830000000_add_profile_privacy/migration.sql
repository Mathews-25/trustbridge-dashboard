-- Add opt-in public profile flags to Registration
-- Default: private (profilePublic = false, showStellarAddress = false)

ALTER TABLE "Registration" ADD COLUMN IF NOT EXISTS "profilePublic" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Registration" ADD COLUMN IF NOT EXISTS "showStellarAddress" BOOLEAN NOT NULL DEFAULT false;

-- Index for public profile lookups by username (via User join)
-- We index profilePublic on Registration to speed up the public profile API
CREATE INDEX IF NOT EXISTS "Registration_profilePublic_idx" ON "Registration"("profilePublic");
