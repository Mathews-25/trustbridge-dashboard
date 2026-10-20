import { NextRequest } from "next/server";

import { GET as cronGET, POST as cronPOST } from "@/app/api/cron/export/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return cronPOST(request);
}

export async function GET() {
  return cronGET();
}
