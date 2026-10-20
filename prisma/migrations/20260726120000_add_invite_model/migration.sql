-- CreateTable
CREATE TABLE "Invite" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "batchLabel" TEXT,
    "expiresAt" TIMESTAMP(3),
    "used" BOOLEAN NOT NULL DEFAULT false,
    "generatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "Invite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Invite_codeHash_key" ON "Invite"("codeHash");

-- CreateIndex
CREATE INDEX "Invite_codeHash_idx" ON "Invite"("codeHash");

-- CreateIndex
CREATE INDEX "Invite_generatedById_idx" ON "Invite"("generatedById");

-- CreateIndex
CREATE INDEX "Invite_createdAt_idx" ON "Invite"("createdAt");

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;