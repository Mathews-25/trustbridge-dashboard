import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * Records an initial address registration for a user.
 * Called when a user first registers a Stellar address.
 */
export async function recordInitialAddress(
  userId: string,
  stellarAddress: string
): Promise<void> {
  const registration = await prisma.registration.findUnique({
    where: { userId },
  });

  if (!registration || registration.deletedAt) return;

  await prisma.addressHistoryRecord.create({
    data: {
      userId,
      previousAddress: null,
      newAddress: stellarAddress,
      changeType: "initial",
    },
  });
}

/**
 * Records an address change for a user.
 * Called when a user updates their registered Stellar address.
 */
export async function recordAddressChange(
  userId: string,
  previousAddress: string | null,
  newAddress: string
): Promise<void> {
  await prisma.addressHistoryRecord.create({
    data: {
      userId,
      previousAddress,
      newAddress,
      changeType: "updated",
    },
  });
}

/**
 * Retrieves the complete address history for a user.
 */
export async function getAddressHistory(
  userId: string
): Promise<
  {
    stellarAddress: string;
    changeType: string;
    recordedAt: Date;
  }[]
> {
  const history = await prisma.addressHistoryRecord.findMany({
    where: { userId },
    select: {
      newAddress: true,
      changeType: true,
      recordedAt: true,
    },
    orderBy: { recordedAt: "desc" },
  });

  return history.map((record) => ({
    stellarAddress: record.newAddress,
    changeType: record.changeType,
    recordedAt: record.recordedAt,
  }));
}

/**
 * Gets the most recent address registration for a user.
 */
export async function getLatestAddress(userId: string): Promise<string | null> {
  const latest = await prisma.addressHistoryRecord.findFirst({
    where: { userId },
    select: { newAddress: true },
    orderBy: { recordedAt: "desc" },
  });

  return latest?.newAddress ?? null;
}
