import { NextResponse } from "next/server";

import { requireMaintainerSession } from "@/lib/api-auth";
import { backgroundQueue } from "@/lib/queue-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await requireMaintainerSession())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const metrics = await backgroundQueue.getMetrics();
  return NextResponse.json({ queue: metrics });
}