import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { assertSameOrigin } from "@/lib/csrf";
import {
  getNotificationsForUser,
  markNotificationsAsRead,
} from "@/lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const markReadSchema = z.object({
  notificationIds: z.array(z.string()).optional(),
  all: z.boolean().optional(),
});

/**
 * GET /api/notifications
 * Returns notifications and unread count for the authenticated user.
 */
export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const isMaintainer = Boolean(session.user.isMaintainer);
  const maintainerOrgId = session.user.maintainerOrgId ?? "default";

  const { notifications, unreadCount } = await getNotificationsForUser(
    userId,
    isMaintainer,
    { limit: 30, maintainerOrgId }
  );

  return NextResponse.json(
    { notifications, unreadCount },
    { headers: { "Cache-Control": "no-store" } }
  );
}

/**
 * PATCH /api/notifications
 * Marks specific notification IDs or all notifications as read.
 */
export async function PATCH(request: NextRequest) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // Empty body marks all as read
  }

  const parsed = markReadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const userId = session.user.id;
  const isMaintainer = Boolean(session.user.isMaintainer);
  const maintainerOrgId = session.user.maintainerOrgId ?? "default";

  const { notificationIds, all } = parsed.data;

  const { unreadCount } = await markNotificationsAsRead(
    userId,
    isMaintainer,
    all ? undefined : notificationIds,
    maintainerOrgId
  );

  return NextResponse.json(
    { success: true, unreadCount },
    { headers: { "Cache-Control": "no-store" } }
  );
}
