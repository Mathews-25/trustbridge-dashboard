import { NextRequest, NextResponse } from "next/server";
import { recordAuditLog } from "@/lib/audit";
import { isFeatureEnabled } from "@/lib/feature-flags";

export interface FreezeWindowStatus {
  active: boolean;
  reason?: string;
  start?: Date;
  end?: Date;
}

/**
 * Checks if the wave freeze window is currently active based on environment variables
 * or settings. During an active freeze window, mutating operations (rechecks, address changes)
 * are disabled while read operations stay available.
 */
export function isFreezeWindowActive(now = new Date()): FreezeWindowStatus {
  const enabledStr = process.env.FREEZE_WINDOW_ENABLED?.trim().toLowerCase();
  const startStr = process.env.FREEZE_WINDOW_START?.trim();
  const endStr = process.env.FREEZE_WINDOW_END?.trim();

  // Explicitly disabled
  if (enabledStr === "false") {
    return { active: false };
  }

  if (!startStr || !endStr) {
    return { active: false };
  }

  const start = new Date(startStr);
  const end = new Date(endStr);

  if (
    isNaN(start.getTime()) ||
    isNaN(end.getTime()) ||
    start.getTime() > end.getTime()
  ) {
    return { active: false };
  }

  const nowTime = now.getTime();
  const active = nowTime >= start.getTime() && nowTime <= end.getTime();
  if (active) {
    return {
      active: true,
      reason: "Wave roster payout freeze window in effect",
      start,
      end,
    };
  }

  return { active: false, start, end };
}

/**
 * Evaluates whether a request should be blocked by an active freeze window.
 * Maintainers can supply header `x-freeze-override: true` or query param `overrideFreeze=true`
 * to bypass the freeze window, which gets audited.
 */
export async function enforceFreezeWindowGuard({
  request,
  isMaintainer = false,
  userId = null,
  userLogin = null,
  actionLabel = "recheck",
}: {
  request: NextRequest;
  isMaintainer?: boolean;
  userId?: string | null;
  userLogin?: string | null;
  actionLabel?: string;
}): Promise<{ blocked: boolean; response?: NextResponse; isOverride: boolean }> {
  const flagEnabled = await isFeatureEnabled("freeze_window");
  if (!flagEnabled) {
    return { blocked: false, isOverride: false };
  }

  const status = isFreezeWindowActive();
  if (!status.active) {
    return { blocked: false, isOverride: false };
  }

  const headerOverride = request.headers.get("x-freeze-override")?.toLowerCase() === "true";
  const url = new URL(request.url);
  const queryOverride = url.searchParams.get("overrideFreeze")?.toLowerCase() === "true";
  const hasOverrideRequested = headerOverride || queryOverride;

  if (hasOverrideRequested && isMaintainer) {
    // Record maintainer override audit event
    await recordAuditLog({
      action: `${actionLabel}.freeze_override`,
      actorId: userId ?? "system",
      actorLogin: userLogin ?? null,
      metadata: {
        reason: "Maintainer override during active wave freeze window",
        freezeStart: status.start?.toISOString(),
        freezeEnd: status.end?.toISOString(),
      },
    });
    return { blocked: false, isOverride: true };
  }

  // Audit blocked attempt
  await recordAuditLog({
    action: `${actionLabel}.freeze_blocked`,
    actorId: userId ?? "anonymous",
    actorLogin: userLogin ?? null,
    metadata: {
      reason: status.reason,
      freezeStart: status.start?.toISOString(),
      freezeEnd: status.end?.toISOString(),
      overrideAttempted: hasOverrideRequested,
    },
  });

  return {
    blocked: true,
    isOverride: false,
    response: NextResponse.json(
      {
        error:
          "Roster is currently frozen for wave payout. Address changes and rechecks are temporarily disabled.",
        code: "WAVE_FREEZE_ACTIVE",
        freezeWindow: {
          active: true,
          reason: status.reason,
          start: status.start?.toISOString(),
          end: status.end?.toISOString(),
        },
      },
      { status: 423 }
    ),
  };
}
