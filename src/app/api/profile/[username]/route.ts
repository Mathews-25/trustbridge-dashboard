import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { computeReadiness } from "@/lib/readiness";
import { checkRateLimit, extractClientIp, buildRateLimitHeaders } from "@/lib/rate-limit";
import type { PublicProfile } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROFILE_RATE_LIMIT = { windowMs: 60_000, maxRequests: 30 };

/**
 * GET /api/profile/[username]
 *
 * Public, unauthenticated. Returns a contributor's opt-in public profile.
 * Returns 404 when:
 *   - No user found with that username
 *   - User has no active registration
 *   - Registration exists but profilePublic=false
 *
 * Intentionally returns identical 404 for all cases to prevent user enumeration.
 * Stellar address is only included when showStellarAddress=true.
 *
 * Rate-limited: 30 req/min per IP (separate from /api/check limit).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { username: string } }
) {
  const ip = extractClientIp(request);
  const rl = checkRateLimit(`profile:${ip}`, PROFILE_RATE_LIMIT);
  const rlHeaders = buildRateLimitHeaders(rl, PROFILE_RATE_LIMIT.maxRequests);

  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: rlHeaders }
    );
  }

  // Validate username format to avoid pointless DB queries
  const { username } = params;
  if (!username || !/^[a-zA-Z0-9_-]{1,39}$/.test(username)) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: rlHeaders });
  }

  const user = await prisma.user.findUnique({
    where: { githubUsername: username },
    select: {
      githubUsername: true,
      registration: {
        select: {
          profilePublic: true,
          showStellarAddress: true,
          stellarAddress: true,
          funded: true,
          trustlineReady: true,
          trustlineAuthorized: true,
          xlmBalance: true,
          spendableXlmBalance: true,
          lastCheckedAt: true,
          deletedAt: true,
        },
      },
    },
  });

  // Return 404 for missing user, no registration, soft-deleted, or private —
  // identical response prevents username enumeration.
  const reg = user?.registration;
  if (!user || !reg || reg.deletedAt || !reg.profilePublic) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: rlHeaders });
  }

  const readiness = computeReadiness(
    reg.funded,
    reg.trustlineReady,
    reg.xlmBalance,
    { authorized: reg.trustlineAuthorized, spendableBalance: reg.spendableXlmBalance }
  );

  const profile: PublicProfile = {
    githubUsername: user.githubUsername,
    readiness,
    stellarAddress: reg.showStellarAddress ? reg.stellarAddress : null,
    lastCheckedAt: reg.lastCheckedAt?.toISOString() ?? null,
  };

  return NextResponse.json(
    { profile },
    {
      headers: {
        ...rlHeaders,
        // Short public cache — stale after 60s, revalidate in background
        "Cache-Control": "public, max-age=60, stale-while-revalidate=120",
      },
    }
  );
}
