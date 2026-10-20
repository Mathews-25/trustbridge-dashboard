import { NextRequest, NextResponse } from "next/server";

import { requireMaintainerSession } from "@/lib/api-auth";
import { assertSameOrigin } from "@/lib/csrf";
import {
  processGithubOrgMembershipEvent,
  type GithubOrgMembershipPayload,
} from "@/lib/github-org-membership-webhook";
import { requireAdmin } from "@/lib/api-auth";
import {
  processGithubOrgMembershipEvent,
  verifyWebhookSignature,
  type GitHubMembershipEvent,
} from "@/app/api/webhooks/github-org-membership/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/github-org-membership/replay
 *
 * Maintainer-only endpoint to replay a stored webhook payload without
 * re-verifying the HMAC signature (the payload has already been verified and
 * persisted).  Useful for re-processing after a bug fix.
 *
 * Imports helpers from @/lib — never from the sibling route — so there are no
 * cross-route dependencies and Next.js bundling stays clean.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  const session = await requireMaintainerSession();
export async function POST(request: NextRequest) {
  const session = await requireAdmin("webhook.github_org_membership_replay");
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let payload: GithubOrgMembershipPayload;
  try {
    payload = (await request.json()) as GithubOrgMembershipPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const result = await processGithubOrgMembershipEvent(payload);

  return NextResponse.json({ ok: true, replayed: true, ...result });
  try {
    const body = await request.text();
    const payload = Buffer.from(body, "utf-8");

    const signature = request.headers.get("X-Hub-Signature-256") || undefined;
    const secret = process.env.GITHUB_WEBHOOK_SECRET?.trim();
    if (secret && !verifyWebhookSignature(payload, signature)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const event = JSON.parse(body) as GitHubMembershipEvent;
    const result = await processGithubOrgMembershipEvent(event, request.headers);

    return NextResponse.json(
      {
        status: result.status,
        event: result.event,
      },
      { status: 200 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Replay failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
