import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { assertSameOrigin } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";
import type { OnboardingChecklistState } from "@/types";
import { captureException } from "@/lib/sentry";
import { type OnboardingChecklistState, parseChecklistState } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Known checklist keys — used server-side to strip unknown fields from PATCH
 * payloads before persisting, keeping client and API state aligned.
 */
const KNOWN_CHECKLIST_KEYS: Array<keyof OnboardingChecklistState> = [
  "stellarAccountCreated",
  "usdcTrustlineAdded",
  "addressRegistered",
  "readinessConfirmed",
];

/** GET /api/register/checklist — return the user's persisted checklist state. */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const registration = await prisma.registration.findUnique({
    where: { userId: session.user.id },
    select: { checklistCompleted: true },
  });

  const checklistCompleted =
    (registration?.checklistCompleted as OnboardingChecklistState | null) ?? {};

  return NextResponse.json({ checklistCompleted });
}

/**
 * PATCH /api/register/checklist — merge partial checklist updates.
 * Completed steps are never cleared; unknown keys are stripped to prevent
 * drift between the client model and the persisted record.
const VALID_STEP_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;
const MAX_STEPS_ALLOWED = 50;

/**
 * Validate incoming checklist update payload.
 * Prevents PII injection and ensures only valid boolean state is stored.
 */
function validateChecklistPayload(body: unknown): {
  valid: boolean;
  updates: OnboardingChecklistState;
  error?: string;
} {
  if (!body || typeof body !== "object") {
    return { valid: false, updates: {}, error: "Invalid request payload" };
  }

  const payload = body as Record<string, unknown>;
  const updates: OnboardingChecklistState = {};

  // Case 1: Single step toggle { stepId: string, completed: boolean }
  if ("stepId" in payload) {
    const stepId = payload.stepId;
    const completed = payload.completed;

    if (typeof stepId !== "string" || !VALID_STEP_REGEX.test(stepId)) {
      return { valid: false, updates: {}, error: "Invalid stepId format" };
    }
    if (typeof completed !== "boolean") {
      return { valid: false, updates: {}, error: "completed must be a boolean" };
    }

    updates[stepId] = completed;
    return { valid: true, updates };
  }

  // Case 2: Multi-step update { steps: Record<string, boolean> } or { checklistCompleted: Record<string, boolean> }
  const stepsCandidate = (payload.steps ?? payload.checklistCompleted ?? payload) as Record<
    string,
    unknown
  >;

  if (typeof stepsCandidate !== "object" || stepsCandidate === null) {
    return { valid: false, updates: {}, error: "Checklist steps must be an object" };
  }

  const entries = Object.entries(stepsCandidate);
  if (entries.length > MAX_STEPS_ALLOWED) {
    return { valid: false, updates: {}, error: "Too many checklist steps" };
  }

  for (const [key, val] of entries) {
    if (!VALID_STEP_REGEX.test(key)) {
      return { valid: false, updates: {}, error: `Invalid step key: ${key}` };
    }
    if (typeof val !== "boolean") {
      return { valid: false, updates: {}, error: `Value for ${key} must be a boolean` };
    }
    updates[key] = val;
  }

  return { valid: true, updates };
}

/**
 * PATCH /api/register/checklist
 *
 * Persists onboarding checklist step completion for the signed-in user.
 * Merges updates with existing state to prevent multi-tab stomp.
 */
export async function PATCH(request: NextRequest) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as Record<string, unknown>;

  // Strip unknown keys — only merge recognised checklist fields.
  const incoming: OnboardingChecklistState = {};
  for (const key of KNOWN_CHECKLIST_KEYS) {
    if (typeof body[key] === "boolean") {
      incoming[key] = body[key] as boolean;
    }
  }

  const registration = await prisma.registration.findUnique({
    where: { userId: session.user.id },
    select: { checklistCompleted: true },
  });

  if (!registration) {
    return NextResponse.json(
      { error: "No registration found for this user" },
      { status: 404 }
    );
  }

  const existing =
    (registration.checklistCompleted as OnboardingChecklistState | null) ?? {};

  // Merge: completed steps from `existing` are preserved; `incoming` can only
  // set steps to true, never revert them to false.
  const merged: OnboardingChecklistState = { ...existing };
  for (const key of KNOWN_CHECKLIST_KEYS) {
    if (incoming[key] === true) {
      merged[key] = true;
    }
  }

  await prisma.registration.update({
    where: { userId: session.user.id },
    data: { checklistCompleted: merged },
  });

  return NextResponse.json({ checklistCompleted: merged });
  try {
    const rawBody = (await request.json().catch(() => null)) as unknown;
    const { valid, updates, error } = validateChecklistPayload(rawBody);

    if (!valid) {
      return NextResponse.json({ error: error ?? "Invalid payload" }, { status: 400 });
    }

    const userId = session.user.id;

    // Fetch existing checklist from user and/or registration
    const [user, registration] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { checklistCompleted: true },
      }),
      prisma.registration.findUnique({
        where: { userId },
        select: { id: true, deletedAt: true, checklistCompleted: true },
      }),
    ]);

    const existingUserChecklist = parseChecklistState(user?.checklistCompleted);
    const existingRegChecklist = parseChecklistState(registration?.checklistCompleted);

    const mergedChecklist: OnboardingChecklistState = {
      ...existingUserChecklist,
      ...existingRegChecklist,
      ...updates,
    };

    // Atomically persist to User and active Registration
    const dbOperations: Array<Promise<unknown>> = [
      prisma.user.update({
        where: { id: userId },
        data: { checklistCompleted: mergedChecklist },
      }),
    ];

    if (registration && !registration.deletedAt) {
      dbOperations.push(
        prisma.registration.update({
          where: { id: registration.id },
          data: { checklistCompleted: mergedChecklist },
        })
      );
    }

    await Promise.all(dbOperations);

    return NextResponse.json({
      success: true,
      checklistCompleted: mergedChecklist,
    });
  } catch (err) {
    captureException(err, {
      route: "/api/register/checklist",
      method: "PATCH",
      userId: session.user.id,
    });

    return NextResponse.json(
      { error: "Failed to update checklist" },
      { status: 500 }
    );
  }
}
