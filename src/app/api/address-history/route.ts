import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { getAddressHistory } from "@/lib/address-history";
import { validateCsrfToken } from "@/lib/csrf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/address-history — a contributor's own AddressHistoryRecord timeline.
 *
 * Self-only by default: the session user's own history is always returned.
 * Maintainers may pass `?userId=<id>` to look up another user's history (for
 * future maintainer tooling); non-maintainers passing that param are silently
 * ignored and always get their own history back — never another user's
 * (IDOR prevention).
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const csrfToken =
    request.headers.get("x-csrf-token") ??
    request.nextUrl.searchParams.get("csrfToken");
  if (!csrfToken || !validateCsrfToken(session.user.id, csrfToken)) {
    return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
  }

  const requestedUserId = request.nextUrl.searchParams.get("userId");
  const targetUserId =
    session.user.isMaintainer && requestedUserId
      ? requestedUserId
      : session.user.id;

  const history = await getAddressHistory(targetUserId);

  return NextResponse.json({ history });
}
