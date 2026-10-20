import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

import { recordAuditLog } from "@/lib/audit";
import { authOptions } from "@/lib/auth";
import { assertSameOrigin } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/register/delete
 *
 * Self-service registration deletion — permanently anonymises the user's own
 * registration and deletes their stored tokens. The user must confirm by
 * sending `{ "confirm": true }` in the request body.
 *
 * ### What is deleted / anonymised
 * - `Registration` row: soft-deleted (`deletedAt` set) so the Stellar address
 *   can be reclaimed by another contributor in the future. The `stellarAddress`
 *   field is cleared from the active-registration uniqueness constraint via the
 *   partial index (`deletedAt IS NULL`), meaning the same address may be
 *   re-registered immediately.
 * - `Account.access_token` / `Account.refresh_token`: cleared from the
 *   database. The in-memory JWT session naturally expires per the token's `exp`
 *   claim; nothing can revoke it earlier (see docs/SESSIONS.md).
 * - The User record is retained to preserve foreign-key integrity with the
 *   immutable audit log (see privacy policy in docs/CONTRIBUTING.md).
 *
 * ### What is NOT deleted
 * - `AuditLog` entries — security records that exist to investigate fraud,
 *   abuse, and disputes; they are retained regardless of deletion requests.
 * - `AddressHistoryRecord` rows — retained for dispute resolution; no PII
 *   beyond the G-address which is already public on the Stellar network.
 *
 * ### CSRF
 * Uses `assertSameOrigin` (same pattern as all other mutating routes).
 */
export async function POST(request: NextRequest) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  // Require explicit confirmation to prevent accidental deletions
  let body: { confirm?: boolean } = {};
  try {
    body = (await request.json()) as { confirm?: boolean };
  } catch {
    return NextResponse.json(
      { error: "Request body must be JSON" },
      { status: 400 }
    );
  }

  if (body.confirm !== true) {
    return NextResponse.json(
      {
        error: "Deletion requires explicit confirmation",
        hint: 'Send { "confirm": true } to proceed',
      },
      { status: 400 }
    );
  }

  const registration = await prisma.registration.findUnique({
    where: { userId },
    select: { id: true, stellarAddress: true, deletedAt: true },
  });

  if (!registration || registration.deletedAt) {
    return NextResponse.json(
      { error: "No active registration found" },
      { status: 404 }
    );
  }

  // Perform all mutations atomically
  await prisma.$transaction([
    // Soft-delete the registration; the partial unique index on
    // (stellarAddress) WHERE deletedAt IS NULL means the address is freed.
    prisma.registration.update({
      where: { id: registration.id },
      data: { deletedAt: new Date() },
    }),
    // Clear OAuth tokens from the Account rows so the stored credentials
    // cannot be used after the user deletes their data.
    prisma.account.updateMany({
      where: { userId },
      data: {
        access_token: null,
        refresh_token: null,
      },
    }),
  ]);

  // Audit log is written outside the transaction intentionally: a logging
  // failure must never roll back the deletion itself.
  await recordAuditLog({
    action: "registration.delete",
    actorId: userId,
    actorLogin: session.user.githubUsername ?? null,
    targetId: registration.id,
    targetLabel: registration.stellarAddress,
    metadata: {
      selfService: true,
      deletedAt: new Date().toISOString(),
    },
  });

  return NextResponse.json({
    success: true,
    message:
      "Your registration has been deleted. Your Stellar address may be re-registered by yourself or another contributor.",
  });
}
