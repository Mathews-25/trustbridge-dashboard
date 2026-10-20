import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { assertSameOrigin } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";
import { recordAuditLog } from "@/lib/audit";
import type { ProfilePrivacySettings } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const privacySchema = z.object({
  profilePublic: z.boolean(),
  showStellarAddress: z.boolean(),
});

/**
 * GET /api/profile — authenticated user's own privacy settings.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const registration = await prisma.registration.findUnique({
    where: { userId: session.user.id },
    select: { profilePublic: true, showStellarAddress: true, deletedAt: true },
  });

  if (!registration || registration.deletedAt) {
    return NextResponse.json(
      { settings: { profilePublic: false, showStellarAddress: false } satisfies ProfilePrivacySettings },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const settings: ProfilePrivacySettings = {
    profilePublic: registration.profilePublic,
    showStellarAddress: registration.showStellarAddress,
  };

  return NextResponse.json(
    { settings },
    { headers: { "Cache-Control": "no-store" } }
  );
}

/**
 * PATCH /api/profile — update authenticated user's privacy settings.
 *
 * Body: { profilePublic: boolean, showStellarAddress: boolean }
 *
 * Enforces: showStellarAddress can only be true when profilePublic is also true.
 * If profilePublic is set to false, showStellarAddress is coerced to false too.
 */
export async function PATCH(request: NextRequest) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = privacySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { profilePublic } = parsed.data;
  // If profile is private, address visibility is forced off
  const showStellarAddress = profilePublic ? parsed.data.showStellarAddress : false;

  const registration = await prisma.registration.findUnique({
    where: { userId: session.user.id },
    select: { id: true, deletedAt: true },
  });

  if (!registration || registration.deletedAt) {
    return NextResponse.json(
      { error: "No active registration found" },
      { status: 404 }
    );
  }

  await prisma.registration.update({
    where: { userId: session.user.id },
    data: { profilePublic, showStellarAddress },
  });

  await recordAuditLog({
    action: "profile.privacy_updated",
    actorId: session.user.id,
    actorLogin: session.user.githubUsername ?? null,
    targetId: registration.id,
    metadata: { profilePublic, showStellarAddress },
  });

  const settings: ProfilePrivacySettings = { profilePublic, showStellarAddress };
  return NextResponse.json({ settings }, { headers: { "Cache-Control": "no-store" } });
}
