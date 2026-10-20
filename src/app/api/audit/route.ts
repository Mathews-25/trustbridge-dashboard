import { NextRequest, NextResponse } from "next/server";

import { requireOperator } from "@/lib/api-auth";
import { getRecentAuditLog } from "@/lib/audit";
import { summarizeAuditLog } from "@/lib/audit-format";
import { captureException } from "@/lib/sentry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Operator-only view of recent maintainer actions. */
export async function GET(request: NextRequest) {
  if (!(await requireOperator("audit.read"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const limitParam = Number(request.nextUrl.searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : 50;

  try {
    const entries = await getRecentAuditLog(limit);
    return NextResponse.json({
      entries,
      summary: summarizeAuditLog(entries),
    });
  } catch (error) {
    captureException(error);
    return NextResponse.json(
      { error: "Failed to load audit log" },
      { status: 500 },
    );
  }
}
