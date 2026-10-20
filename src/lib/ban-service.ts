import { prisma } from "@/lib/prisma";
import { recordAuditLog } from "@/lib/audit";

export interface BanStatus {
  banned: boolean;
  reason?: string;
  bannedAt?: Date;
}

/**
 * Case-insensitive check if a contributor or GitHub handle is banned.
 */
export async function isUserBanned(
  userId?: string | null,
  githubUsername?: string | null
): Promise<BanStatus> {
  if (!userId && !githubUsername) {
    return { banned: false };
  }

  try {
    // Check by user ID if provided
    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { banned: true, banReason: true, bannedAt: true, githubUsername: true },
      });
      if (user?.banned) {
        return {
          banned: true,
          reason: user.banReason ?? "Account is suspended",
          bannedAt: user.bannedAt ?? undefined,
        };
      }
      if (!githubUsername && user?.githubUsername) {
        githubUsername = user.githubUsername;
      }
    }

    // Case-insensitive check on BannedContributor table
    if (githubUsername) {
      const lowerUsername = githubUsername.trim().toLowerCase();
      const bannedRecord = await prisma.bannedContributor.findFirst({
        where: {
          githubUsername: {
            equals: lowerUsername,
            mode: "insensitive",
          },
        },
      });

      if (bannedRecord) {
        return {
          banned: true,
          reason: bannedRecord.reason,
          bannedAt: bannedRecord.createdAt,
        };
      }
    }

    return { banned: false };
  } catch (error) {
    console.error("Failed to check user ban status:", error);
    // Fail open or closed depending on security requirement - fail safe by allowing if DB error, but logging
    return { banned: false };
  }
}

/**
 * Bans a contributor by GitHub handle with a mandatory reason.
 */
export async function banContributor({
  githubUsername,
  reason,
  actorId,
  actorLogin,
}: {
  githubUsername: string;
  reason: string;
  actorId: string;
  actorLogin?: string | null;
}) {
  const normalizedUsername = githubUsername.trim().toLowerCase();
  const trimmedReason = reason.trim();

  if (!trimmedReason) {
    throw new Error("A reason is required to ban a contributor.");
  }

  // Update existing user if present
  const user = await prisma.user.findFirst({
    where: {
      githubUsername: {
        equals: normalizedUsername,
        mode: "insensitive",
      },
    },
  });

  if (user) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        banned: true,
        bannedAt: new Date(),
        banReason: trimmedReason,
        bannedById: actorId,
      },
    });
  }

  // Upsert into BannedContributor table for persistent ban across re-registrations
  await prisma.bannedContributor.upsert({
    where: { githubUsername: normalizedUsername },
    create: {
      githubUsername: normalizedUsername,
      reason: trimmedReason,
      bannedById: actorId,
    },
    update: {
      reason: trimmedReason,
      bannedById: actorId,
    },
  });

  // Log audit event
  await recordAuditLog({
    action: "contributor.banned",
    actorId,
    actorLogin: actorLogin ?? null,
    targetId: user?.id ?? null,
    targetLabel: normalizedUsername,
    metadata: {
      reason: trimmedReason,
      githubUsername: normalizedUsername,
    },
  });

  return { success: true, githubUsername: normalizedUsername, reason: trimmedReason };
}

/**
 * Unbans a contributor by GitHub handle.
 */
export async function unbanContributor({
  githubUsername,
  actorId,
  actorLogin,
  reason,
}: {
  githubUsername: string;
  actorId: string;
  actorLogin?: string | null;
  reason?: string;
}) {
  const normalizedUsername = githubUsername.trim().toLowerCase();

  const user = await prisma.user.findFirst({
    where: {
      githubUsername: {
        equals: normalizedUsername,
        mode: "insensitive",
      },
    },
  });

  if (user) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        banned: false,
        bannedAt: null,
        banReason: null,
        bannedById: null,
      },
    });
  }

  await prisma.bannedContributor.deleteMany({
    where: {
      githubUsername: {
        equals: normalizedUsername,
        mode: "insensitive",
      },
    },
  });

  await recordAuditLog({
    action: "contributor.unbanned",
    actorId,
    actorLogin: actorLogin ?? null,
    targetId: user?.id ?? null,
    targetLabel: normalizedUsername,
    metadata: {
      reason: reason ?? "Maintainer lifted ban",
      githubUsername: normalizedUsername,
    },
  });

  return { success: true, githubUsername: normalizedUsername };
}
