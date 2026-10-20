-- CreateTable
CREATE TABLE "RegistrationConflict" (
    "id" TEXT NOT NULL,
    "maintainerOrgId" TEXT NOT NULL DEFAULT 'default',
    "attemptedAddress" TEXT NOT NULL,
    "attemptedUserId" TEXT NOT NULL,
    "existingUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegistrationConflict_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Registration" ADD COLUMN "notes" TEXT,
ADD COLUMN "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndexes
CREATE INDEX "User_githubUsername_idx" ON "User"("githubUsername");
CREATE INDEX "Registration_stellarAddress_idx" ON "Registration"("stellarAddress");
CREATE INDEX "Registration_updatedAt_idx" ON "Registration"("updatedAt");
CREATE INDEX "RegistrationConflict_attemptedAddress_idx" ON "RegistrationConflict"("attemptedAddress");
CREATE INDEX "RegistrationConflict_createdAt_idx" ON "RegistrationConflict"("createdAt");
