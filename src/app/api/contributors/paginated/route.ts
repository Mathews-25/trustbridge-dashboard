import { NextRequest, NextResponse } from "next/server";
import { requireMaintainerSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { getRegistryMode } from "@/lib/registry-mode";
import { getContributorsPaginated } from "@/lib/registrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Paginated contributors endpoint for infinite scroll.
 * Supports cursor-based pagination to efficiently handle large datasets.
 *
 * Query params:
 * - limit: number of items per page (default: 25, max: 100)
 * - cursor: cursor from previous page's response
 *
 * Delegates to `getContributorsPaginated` (src/lib/registrations.ts) — the
 * same cursor-pagination logic already used and tested elsewhere — rather
 * than re-implementing cursor handling against Prisma directly here.
 */
export async function GET(request: NextRequest) {
  const session = await requireMaintainerSession();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const searchParams = request.nextUrl.searchParams;
  const limitParam = searchParams.get("limit");
  const cursor = searchParams.get("cursor") ?? undefined;

  let limit = 25;
  if (limitParam) {
    const parsed = parseInt(limitParam, 10);
    if (!isNaN(parsed) && parsed > 0 && parsed <= 100) {
      limit = parsed;
    }
  }

  const [{ contributors, nextCursor, hasMore }, total] = await Promise.all([
    getContributorsPaginated(cursor, limit),
    prisma.registration.count({ where: { deletedAt: null } }),
  ]);

  return NextResponse.json({
    contributors,
    total,
    hasMore,
    nextCursor: nextCursor ?? undefined,
    registryMode: getRegistryMode(),
  });
}
