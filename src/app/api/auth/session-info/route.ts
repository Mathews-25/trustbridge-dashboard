import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";

import { buildSessionInfo, SESSION_MAX_AGE_SECONDS } from "@/lib/session-info";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Facts about the caller's own session — issue #148.
 *
 * Reads `iat`/`exp` straight off the verified JWT. Returns nothing that is not
 * already implied by holding the cookie: no access token (encrypted or not),
 * no IP, no user agent. Scoped to the caller by construction — there is no
 * user id parameter, so one user cannot ask about another.
 */
export async function GET(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const info = buildSessionInfo(
    { iat: token.iat, exp: token.exp },
    new Date(),
    SESSION_MAX_AGE_SECONDS
  );

  return NextResponse.json(
    { session: info },
    // Never cached: it is per-user and time-sensitive by definition.
    { headers: { "Cache-Control": "no-store" } }
  );
}
