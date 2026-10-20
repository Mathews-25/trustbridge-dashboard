import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { recordAuditLog } from "@/lib/audit";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/register/export
 *
 * Self-service data export — returns the authenticated user's own registration
 * and associated account data as JSON. No CSRF token required because this is
 * a safe (GET) method.
 *
 * What is exported (and why):
 * - Registration record (Stellar address, readiness flags, timestamps)
 * - Public user fields (GitHub username, display name, avatar)
 * - Address history (previous addresses on file)
 *
 * What is NOT exported (and why):
 * - Encrypted access token — returning the ciphertext would be misleading
 *   (it's useless without the server-side key), and returning the plaintext
 *   would be a credential leak. The token is excluded entirely.
 * - Audit log entries — security-purpose logs are retained regardless of
 *   user deletion requests; exporting them here would expose other actors'
 *   actions that reference this user.
 * - Session rows — never written in JWT mode (see docs/SESSIONS.md).
 */
export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  const [user, registration, addressHistory] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        githubUsername: true,
        name: true,
        email: true,
        image: true,
        createdAt: true,
        updatedAt: true,
        banned: true,
        bannedAt: true,
        banReason: true,
        // accessToken intentionally excluded — credential, not personal data
      },
    }),
    prisma.registration.findUnique({
      where: { userId },
      select: {
        id: true,
        stellarAddress: true,
        funded: true,
        trustlineReady: true,
        trustlineAuthorized: true,
        xlmBalance: true,
        spendableXlmBalance: true,
        usdcBalance: true,
        profilePublic: true,
        showStellarAddress: true,
        deletedAt: true,
        lastCheckedAt: true,
        createdAt: true,
        updatedAt: true,
        notes: true,
        tags: true,
      },
    }),
    prisma.addressHistoryRecord.findMany({
      where: { userId },
      orderBy: { recordedAt: "desc" },
      select: {
        id: true,
        previousAddress: true,
        newAddress: true,
        changeType: true,
        recordedAt: true,
      },
    }),
  ]);

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  await recordAuditLog({
    action: "registration.export",
    actorId: userId,
    actorLogin: session.user.githubUsername ?? null,
    targetId: registration?.id ?? null,
    targetLabel: registration?.stellarAddress ?? null,
    metadata: { exportedAt: new Date().toISOString() },
  });

  return NextResponse.json({
    exportedAt: new Date().toISOString(),
    user,
    registration,
    addressHistory,
  });
}
