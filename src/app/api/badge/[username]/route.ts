import { NextRequest, NextResponse } from "next/server";

import { verifyBadgeSignature } from "@/lib/badge-signing";
import { renderBadgeSvg } from "@/lib/badge-svg";
import { prisma } from "@/lib/prisma";
import { computeReadiness } from "@/lib/readiness";
import { checkRateLimit, extractClientIp, buildRateLimitHeaders } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BADGE_RATE_LIMIT = { windowMs: 60_000, maxRequests: 30 };

/**
 * GET /api/badge/[username]?sig=...&exp=...
 *
 * Serves an SVG readiness badge for GitHub READMEs.
 * Requires a valid HMAC signature to prevent hotlink spoofing/faking.
 *
 * Privacy & Authz:
 * Accessible ONLY if the contributor's registration exists, is active (not deleted),
 * and has profilePublic=true.
 * Returns 404 for missing, private, or deleted profiles to prevent user enumeration.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { username: string } }
) {
  const ip = extractClientIp(request);
  const rl = checkRateLimit(`badge:${ip}`, BADGE_RATE_LIMIT);
  const rlHeaders = buildRateLimitHeaders(rl, BADGE_RATE_LIMIT.maxRequests);

  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: rlHeaders }
    );
  }

  const { username } = params;

  // Validate username format to avoid unnecessary database lookups
  if (!username || !/^[a-zA-Z0-9_-]{1,39}$/.test(username)) {
    return NextResponse.json(
      { error: "Not found" },
      { status: 404, headers: rlHeaders }
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const sig = searchParams.get("sig");
  const expRaw = searchParams.get("exp");
  const exp = expRaw ? parseInt(expRaw, 10) : undefined;

  // Verify HMAC signature & optional expiration
  if (!verifyBadgeSignature(username, sig, exp)) {
    return NextResponse.json(
      { error: "Invalid badge signature" },
      { status: 403, headers: rlHeaders }
    );
  }

  // Fetch user registration from DB
  const user = await prisma.user.findUnique({
    where: { githubUsername: username },
    select: {
      githubUsername: true,
      registration: {
        select: {
          profilePublic: true,
          funded: true,
          trustlineReady: true,
          trustlineAuthorized: true,
          xlmBalance: true,
          spendableXlmBalance: true,
          deletedAt: true,
        },
      },
    },
  });

  const reg = user?.registration;

  // Return 404 for missing user, no registration, soft-deleted, or private profile —
  // identical 404 prevents username enumeration.
  if (!user || !reg || reg.deletedAt || !reg.profilePublic) {
    return NextResponse.json(
      { error: "Not found" },
      { status: 404, headers: rlHeaders }
    );
  }

  // Compute readiness status
  const readiness = computeReadiness(
    reg.funded,
    reg.trustlineReady,
    reg.xlmBalance,
    {
      authorized: reg.trustlineAuthorized,
      spendableBalance: reg.spendableXlmBalance,
    }
  );

  const svg = renderBadgeSvg(readiness);

  return new NextResponse(svg, {
    status: 200,
    headers: {
      ...rlHeaders,
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=600",
      "X-Content-Type-Options": "nosniff",
      Vary: "Accept-Encoding",
    },
  });
}
