import "server-only";

import { prisma } from "@/lib/prisma";
import { mirrorRegistrationToSoroban } from "@/lib/soroban-register";
import { recordAuditLog } from "@/lib/audit";
import { redactString } from "@/lib/sentry";

const MAX_OUTBOX_ERROR_LENGTH = 2000;

function sanitizeOutboxError(error: string | null | undefined): string | null {
  if (!error) return null;
  const redacted = redactString(error);
  return redacted.length > MAX_OUTBOX_ERROR_LENGTH
    ? `${redacted.slice(0, MAX_OUTBOX_ERROR_LENGTH)}...[truncated]`
    : redacted;
}

export interface OutboxProcessOptions {
  batchSize?: number;
  maxAttempts?: number;
  maintainerOrgId?: string;
  entryId?: string;
}

export interface SorobanOutboxDeadLetter {
  id: string;
  action: string;
  attempts: number;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SorobanOutboxMetrics {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}

export async function listSorobanOutboxDeadLetters(
  maintainerOrgId: string,
  limit = 50
): Promise<SorobanOutboxDeadLetter[]> {
  const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 200);
  const rows = await prisma.sorobanOutbox.findMany({
    where: { maintainerOrgId, status: "FAILED" },
    select: {
      id: true,
      action: true,
      attempts: true,
      lastError: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: "desc" },
    take: safeLimit,
  });

  return rows.map((row) => ({
    ...row,
    lastError: sanitizeOutboxError(row.lastError),
  }));
}

export async function replayFailedSorobanOutboxEntry(
  id: string,
  maintainerOrgId: string
): Promise<{ id: string; action: string; previousAttempts: number } | null> {
  const failedEntry = await prisma.sorobanOutbox.findFirst({
    where: { id, maintainerOrgId, status: "FAILED" },
    select: { id: true, action: true, attempts: true },
  });
  if (!failedEntry) return null;

  const updated = await prisma.sorobanOutbox.updateMany({
    where: { id, maintainerOrgId, status: "FAILED" },
    data: {
      status: "PENDING",
      attempts: 0,
      lastError: null,
      nextAttemptAt: new Date(),
    },
  });
  if (updated.count !== 1) return null;

  return {
    id: failedEntry.id,
    action: failedEntry.action,
    previousAttempts: failedEntry.attempts,
  };
}

export async function getSorobanOutboxMetrics(
  maintainerOrgId?: string
): Promise<SorobanOutboxMetrics> {
  const whereScope = maintainerOrgId ? { maintainerOrgId } : {};
  const [total, pending, processing, completed, failed] = await Promise.all([
    prisma.sorobanOutbox.count({ where: whereScope }),
    prisma.sorobanOutbox.count({ where: { ...whereScope, status: "PENDING" } }),
    prisma.sorobanOutbox.count({ where: { ...whereScope, status: "PROCESSING" } }),
    prisma.sorobanOutbox.count({ where: { ...whereScope, status: "COMPLETED" } }),
    prisma.sorobanOutbox.count({ where: { ...whereScope, status: "FAILED" } }),
  ]);

  return { total, pending, processing, completed, failed };
}

export async function processSorobanOutbox(options: OutboxProcessOptions = {}) {
  const batchSize = options.batchSize ?? 10;
  const maxAttempts = options.maxAttempts ?? 5;

  const where: any = {
    status: "PENDING",
    nextAttemptAt: { lte: new Date() },
  };
  if (options.entryId) {
    where.id = options.entryId;
  }
  if (options.maintainerOrgId) {
    where.maintainerOrgId = options.maintainerOrgId;
  }

  const pending = await prisma.sorobanOutbox.findMany({
    where,
    take: batchSize,
    orderBy: { createdAt: "asc" },
  });

  let processedCount = 0;
  let successCount = 0;
  let failedCount = 0;

  for (const item of pending) {
    const claim = await prisma.sorobanOutbox.updateMany({
      where: { id: item.id, status: "PENDING" },
      data: { status: "PROCESSING" },
    });
    if (claim.count !== 1) continue;
    processedCount++;

    const payload = item.payload as { stellarAddress: string; githubUsername: string; registrationId: string };

    let result;
    try {
      result = await mirrorRegistrationToSoroban(
        {
          id: payload.registrationId,
          stellarAddress: payload.stellarAddress,
          userId: payload.githubUsername,
        } as any,
        payload.githubUsername
      );
    } catch (error) {
      result = {
        success: false,
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }

    if (result.success) {
      successCount++;
      await prisma.sorobanOutbox.update({
        where: { id: item.id },
        data: {
          status: "COMPLETED",
          updatedAt: new Date(),
        },
      });
    } else {
      const nextAttempts = item.attempts + 1;
      const isFinalFailure = nextAttempts >= maxAttempts;
      const lastError = sanitizeOutboxError(result.errors.join("; ")) ?? "Unknown error";

      if (isFinalFailure) {
        failedCount++;
        await prisma.sorobanOutbox.update({
          where: { id: item.id },
          data: {
            status: "FAILED",
            attempts: nextAttempts,
            lastError,
            updatedAt: new Date(),
          },
        });

        await recordAuditLog({
          action: "soroban_outbox_exhausted",
          actorId: item.maintainerOrgId,
          targetId: item.id,
          metadata: { action: item.action, attempts: nextAttempts, error: lastError },
        });
      } else {
        // Exponential backoff retry: 5s, 25s, 125s...
        const backoffMs = Math.pow(5, nextAttempts) * 1000;
        const nextAttemptAt = new Date(Date.now() + backoffMs);

        await prisma.sorobanOutbox.update({
          where: { id: item.id },
          data: {
            status: "PENDING",
            attempts: nextAttempts,
            lastError,
            nextAttemptAt,
            updatedAt: new Date(),
          },
        });
      }
    }
  }

  return {
    processedCount,
    successCount,
    failedCount,
  };
}
