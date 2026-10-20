import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

import { recordAuditLog } from "@/lib/audit";
import { authOptions } from "@/lib/auth";
import { assertSameOrigin } from "@/lib/csrf";
import {
  buildNotReadyEmailBody,
  sendEmailNotification,
} from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { computeReadiness } from "@/lib/readiness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type NudgeReason = "unfunded" | "no_trustline" | "low_reserve";

function resolveNudgeReason(registration: {
  funded: boolean;
  trustlineReady: boolean;
  trustlineAuthorized: boolean;
  xlmBalance: string;
  spendableXlmBalance: string;
}): NudgeReason | null {
  const readiness = computeReadiness(
    registration.funded,
    registration.trustlineReady,
    registration.xlmBalance,
    {
      authorized: registration.trustlineAuthorized,
      spendableBalance: registration.spendableXlmBalance,
    }
  );

  if (readiness === "ready") return null;
  if (readiness === "low_reserve") return "low_reserve";
  if (!registration.funded) return "unfunded";
  return "no_trustline";
}

async function loadNotReadyContributors() {
  const registrations = await prisma.registration.findMany({
    where: { deletedAt: null },
    include: {
      user: {
        select: {
          githubUsername: true,
          email: true,
        },
      },
    },
  });

  return registrations.flatMap((registration) => {
    const reason = resolveNudgeReason(registration);
    if (!reason) return [];
    return [
      {
        id: registration.id,
        userId: registration.userId,
        githubUsername: registration.user.githubUsername,
        email: registration.user.email,
        reason,
      },
    ];
  });
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isMaintainer) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const notReady = await loadNotReadyContributors();

  return NextResponse.json({
    notReady: notReady.map(({ id, userId, githubUsername, email, reason }) => ({
      id,
      userId,
      githubUsername,
      email,
      reason,
    })),
    total: notReady.length,
  });
}

export async function POST(request: NextRequest) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  const session = await getServerSession(authOptions);
  if (!session?.user?.isMaintainer) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const maintainerEmail = session.user.email?.trim();
  if (!maintainerEmail) {
    return NextResponse.json(
      { error: "Maintainer email not configured" },
      { status: 400 }
    );
  }

  const notReady = await loadNotReadyContributors();
  let sentCount = 0;

  for (const contributor of notReady) {
    const body = buildNotReadyEmailBody(
      contributor.githubUsername ?? "unknown",
      contributor.reason
    );

    const sent = await sendEmailNotification({
      to: maintainerEmail,
      subject: `Not ready: ${contributor.githubUsername ?? contributor.id}`,
      body,
      recipientName: session.user.name ?? undefined,
    });

    if (sent) sentCount += 1;
  }

  await recordAuditLog({
    action: "notifications.email_nudge",
    actorId: session.user.id,
    actorLogin: session.user.githubUsername ?? null,
    metadata: {
      sentCount,
      totalNotReady: notReady.length,
    },
  });

  return NextResponse.json({
    sentCount,
    totalNotReady: notReady.length,
  });
}
