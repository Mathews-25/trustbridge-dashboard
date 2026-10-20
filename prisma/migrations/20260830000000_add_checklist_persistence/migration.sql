-- AlterTable
ALTER TABLE "User" ADD COLUMN "checklistCompleted" JSONB DEFAULT '{}';

-- AlterTable
ALTER TABLE "Registration" ADD COLUMN "checklistCompleted" JSONB DEFAULT '{}';
