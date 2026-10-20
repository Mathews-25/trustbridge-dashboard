import { NextResponse } from "next/server";
import { NextRequest } from "next/server";

import { requireMaintainerSession } from "@/lib/api-auth";
import { assertSameOrigin } from "@/lib/csrf";
import { recordAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  const session = await requireMaintainerSession();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const registration = await prisma.registration.findFirst({
    where: { id: params.id, deletedAt: null },
  });
  if (!registration) {
    return NextResponse.json({ error: "Registration not found" }, { status: 404 });
  }

  const deleted = await prisma.registration.update({
    where: { id: params.id },
    data: { deletedAt: new Date() },
  });

  await recordAuditLog({
    action: "registration.delete",
    actorId: session.user.id,
    actorLogin: session.user.githubUsername ?? null,
    targetId: deleted.id,
    targetLabel: deleted.stellarAddress,
    metadata: { deletedAt: deleted.deletedAt?.toISOString() ?? null },
  });

  return NextResponse.json({ success: true, registration: deleted });
}