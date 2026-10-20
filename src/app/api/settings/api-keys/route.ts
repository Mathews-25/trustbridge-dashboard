import { createHash, randomBytes } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { requireMaintainerSession } from "@/lib/api-auth";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireOperator } from "@/lib/api-auth";
import { generateApiKey, hashApiKey } from "@/lib/api-key-crypto";
import { API_KEY_SCOPES, API_KEY_SCOPE_VALUES } from "@/lib/api-key-scopes";
import { recordAuditLog } from "@/lib/audit";
import { assertSameOrigin } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** All recognised scope values. */
export const VALID_SCOPES = [
  "treasury:read",
  "treasury:export",
  "contributors:read",
  "contributors:write",
] as const;

export type ApiKeyScope = (typeof VALID_SCOPES)[number];

function hashKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

/**
 * GET /api/settings/api-keys
 * Returns all API keys (without the raw key — it is shown only once at
 * creation time).
 */
export async function GET(): Promise<NextResponse> {
  const session = await requireMaintainerSession();
  if (!session) {
    return NextResponse.json(
      { error: "Forbidden: maintainer access required" },
      { status: 403 }
    );
  }

  const keys = await prisma.apiKey.findMany({
// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const CreateApiKeySchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(80, "Name must be 80 characters or fewer")
    .trim(),
  scopes: z
    .array(z.enum(API_KEY_SCOPE_VALUES))
    .min(1, "At least one scope is required")
    .max(API_KEY_SCOPES.length, "Too many scopes"),
  expiresAt: z
    .string()
    .datetime({ message: "expiresAt must be an ISO-8601 datetime" })
    .optional(),
});

// ---------------------------------------------------------------------------
// GET  /api/settings/api-keys  — list active keys for the current maintainer
// ---------------------------------------------------------------------------

export async function GET() {
  const session = await requireOperator("api_key.list");
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const keys = await prisma.apiKey.findMany({
    where: {
      createdById: session.user.id,
      revokedAt: null,
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      scopes: true,
      createdAt: true,
      revokedAt: true,
      expiresAt: true,
      lastUsedAt: true,
    },
  });

  return NextResponse.json({ keys });
}

/**
 * POST /api/settings/api-keys
 * Create a new API key.  The raw key is returned exactly once in the
 * `rawKey` field — it is never stored and cannot be recovered afterwards.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  const session = await requireMaintainerSession();
  if (!session) {
    return NextResponse.json(
      { error: "Forbidden: maintainer access required" },
      { status: 403 }
    );
  }

  const body = (await request.json()) as { name?: string; scopes?: string[] };

  // Validate name
  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json(
      { error: "API key name is required" },
      { status: 400 }
    );
  }

  // Validate scopes
  const requestedScopes: string[] = Array.isArray(body.scopes)
    ? body.scopes
    : [];
  const invalidScopes = requestedScopes.filter(
    (s) => !(VALID_SCOPES as readonly string[]).includes(s)
  );
  if (invalidScopes.length > 0) {
    return NextResponse.json(
      { error: `Invalid scopes: ${invalidScopes.join(", ")}` },
      { status: 400 }
    );
  }

  // Generate raw key — shown exactly once, never persisted.
  const rawKey = `tb_${randomBytes(32).toString("base64url")}`;
  const keyHash = hashKey(rawKey);

  const apiKey = await prisma.apiKey.create({
    data: {
      name,
      keyHash,
      scopes: requestedScopes as ApiKeyScope[],
// ---------------------------------------------------------------------------
// POST  /api/settings/api-keys  — create a new key; raw secret returned once
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  // CSRF: must be a same-origin browser request or a request without an
  // Origin header (server-to-server is fine for this management endpoint).
  const csrfError = assertSameOrigin(request);
  if (csrfError) {
    return NextResponse.json({ error: "CSRF check failed" }, { status: 403 });
  }

  const session = await requireOperator("api_key.create");
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = CreateApiKeySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 422 }
    );
  }

  const { name, scopes, expiresAt } = parsed.data;

  // Enforce a maximum of 10 active (non-revoked) keys per user to limit
  // credential sprawl without being overly restrictive.
  const activeCount = await prisma.apiKey.count({
    where: { createdById: session.user.id, revokedAt: null },
  });
  if (activeCount >= 10) {
    return NextResponse.json(
      { error: "Maximum of 10 active API keys reached. Revoke an existing key first." },
      { status: 422 }
    );
  }

  // Generate key — raw value returned once; only the hash is stored.
  const raw = generateApiKey();
  const keyHash = hashApiKey(raw);

  const created = await prisma.apiKey.create({
    data: {
      keyHash,
      name,
      scopes,
      createdById: session.user.id,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    },
    select: {
      id: true,
      name: true,
      scopes: true,
      createdAt: true,
      revokedAt: true,
    },
  });

  return NextResponse.json(
    {
      apiKey,
      // The raw key is returned exactly once here. The client must store it.
      rawKey,
      expiresAt: true,
    },
  });

  await recordAuditLog({
    action: "api_key.created",
    actorId: session.user.id,
    actorLogin: session.user.githubUsername ?? null,
    targetId: created.id,
    targetLabel: name,
    metadata: { scopes, expiresAt: expiresAt ?? null },
  });

  // Return the raw key IN THIS RESPONSE ONLY.
  return NextResponse.json(
    {
      key: { ...created, secret: raw },
      warning: "Store this secret now — it will not be shown again.",
    },
    { status: 201 }
  );
}
