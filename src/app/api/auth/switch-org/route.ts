import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions, verifyTenantAccess } from "@/lib/auth";
import { assertSameOrigin } from "@/lib/csrf";
import { recordAuditLog } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/switch-org
 *
 * Switches the active maintainer org for the current session. The new orgId
 * must be in the user's `availableOrgs` list (baked into the JWT at sign-in).
 *
 * Body: { orgId: string }
 *
 * Returns the updated session fragment on success, 400/403 on failure.
 *
 * Note: NextAuth JWT sessions are stateless — the switch is applied to a
 * *new* session cookie issued by calling the `/api/auth/session` endpoint
 * with an `update` trigger. The UI calls `update({ maintainerOrgId })` from
 * `next-auth/react` after a successful POST here to refresh the in-memory
 * session without a full re-login.
 */
export async function POST(request: NextRequest) {
  const csrfError = assertSameOrigin(request);
  if (csrfError) return csrfError;

  const session = await getServerSession(authOptions);

  if (!session?.user?.isMaintainer) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || !("orgId" in body)) {
    return NextResponse.json(
      { error: "Missing required field: orgId" },
      { status: 400 }
    );
  }

  const { orgId } = body as { orgId: unknown };

  if (typeof orgId !== "string" || !orgId.trim()) {
    return NextResponse.json(
      { error: "orgId must be a non-empty string" },
      { status: 400 }
    );
  }

  const normalized = orgId.trim();
  const available = session.user.availableOrgs ?? [];

  // Guard: the requested org must be in the maintainer's JWT-baked list.
  // This prevents a maintainer from scoping to an org they don't belong to.
  const isAllowed = available.some((org) =>
    verifyTenantAccess(org, normalized)
  );

  if (!isAllowed) {
    await recordAuditLog({
      action: "org_switch_denied",
      actorId: session.user.id,
      actorLogin: session.user.githubUsername ?? null,
      metadata: {
        requestedOrg: normalized,
        availableOrgs: available,
      },
    });

    return NextResponse.json(
      {
        error: "Org not available for this session",
        availableOrgs: available,
      },
      { status: 403 }
    );
  }

  await recordAuditLog({
    action: "org_switched",
    actorId: session.user.id,
    actorLogin: session.user.githubUsername ?? null,
    metadata: {
      fromOrg: session.user.maintainerOrgId ?? "default",
      toOrg: normalized,
    },
  });

  return NextResponse.json({
    maintainerOrgId: normalized,
    availableOrgs: available,
  });
}

/**
 * GET /api/auth/switch-org
 *
 * Returns the current active org and all available orgs for the authenticated
 * maintainer. Used by the OrgSwitcher component on mount.
 */
export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.isMaintainer) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    maintainerOrgId: session.user.maintainerOrgId ?? "default",
    availableOrgs: session.user.availableOrgs ?? [],
  });
}
