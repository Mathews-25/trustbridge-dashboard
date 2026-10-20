/**
 * Comprehensive RBAC tests for src/lib/api-auth.ts
 *
 * Covers:
 *  - requireRole / requireOperator / requireAdmin with every role combination
 *  - Role hierarchy: viewer < operator < admin
 *  - Maintainer without explicit role defaults to "viewer"
 *  - Non-maintainer users are always denied regardless of role
 *  - isAuthorizedScheduler strict Bearer CRON_SECRET match
 *  - requireMaintainerSession
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Session } from "next-auth";

// ---------------------------------------------------------------------------
// Mocks — declared before any imports that use them
// ---------------------------------------------------------------------------

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {},
}));

vi.mock("@/lib/audit", () => ({
  recordAuditLog: vi.fn().mockResolvedValue(undefined),
}));

import { getServerSession } from "next-auth";
import { recordAuditLog } from "@/lib/audit";

import {
  requireRole,
  requireOperator,
  requireAdmin,
  requireMaintainerSession,
  isAuthorizedScheduler,
  ROLE_HIERARCHY,
} from "@/lib/api-auth";

// ---------------------------------------------------------------------------
// Session builder helpers
// ---------------------------------------------------------------------------

function makeSession(
  overrides: Partial<{ isMaintainer: boolean; role: string }>
): Session {
  return {
    user: {
      id: "user-1",
      githubUsername: "tester",
      isMaintainer: overrides.isMaintainer ?? false,
      role: overrides.role as Session["user"]["role"],
    },
    expires: "2099-01-01T00:00:00.000Z",
  } as Session;
}

/** Simulate a maintainer with an explicit role. */
function maintainerSession(role: "admin" | "operator" | "viewer"): Session {
  return makeSession({ isMaintainer: true, role });
}

/** Simulate a maintainer with NO role field (legacy / default-to-viewer path). */
function legacyMaintainerSession(): Session {
  return makeSession({ isMaintainer: true });
}

/** Simulate a non-maintainer contributor (no access to maintainer endpoints). */
function contributorSession(): Session {
  return makeSession({ isMaintainer: false });
}

// ---------------------------------------------------------------------------
// ROLE_HIERARCHY
// ---------------------------------------------------------------------------

describe("ROLE_HIERARCHY", () => {
  it("admin has the highest numeric rank", () => {
    expect(ROLE_HIERARCHY.admin).toBeGreaterThan(ROLE_HIERARCHY.operator);
    expect(ROLE_HIERARCHY.admin).toBeGreaterThan(ROLE_HIERARCHY.viewer);
  });

  it("operator ranks between admin and viewer", () => {
    expect(ROLE_HIERARCHY.operator).toBeGreaterThan(ROLE_HIERARCHY.viewer);
    expect(ROLE_HIERARCHY.operator).toBeLessThan(ROLE_HIERARCHY.admin);
  });

  it("viewer has the lowest rank", () => {
    expect(ROLE_HIERARCHY.viewer).toBeLessThan(ROLE_HIERARCHY.operator);
  });
});

// ---------------------------------------------------------------------------
// requireRole
// ---------------------------------------------------------------------------

describe("requireRole", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── null session (unauthenticated) ────────────────────────────────────────

  it("returns null when there is no session", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    expect(await requireRole("viewer")).toBeNull();
    expect(await requireRole("operator")).toBeNull();
    expect(await requireRole("admin")).toBeNull();
  });

  // ── non-maintainer ────────────────────────────────────────────────────────

  it("returns null for a non-maintainer even when role is set", async () => {
    // A contributor with isMaintainer=false should never get through,
    // regardless of what they claim in the role field.
    vi.mocked(getServerSession).mockResolvedValue(
      makeSession({ isMaintainer: false, role: "admin" })
    );
    expect(await requireRole("viewer")).toBeNull();
    expect(await requireRole("admin")).toBeNull();
  });

  // ── maintainer without explicit role defaults to viewer ───────────────────

  it("grants viewer access to a maintainer without an explicit role", async () => {
    vi.mocked(getServerSession).mockResolvedValue(legacyMaintainerSession());
    const session = await requireRole("viewer");
    expect(session).not.toBeNull();
  });

  it("denies operator access to a maintainer without an explicit role", async () => {
    vi.mocked(getServerSession).mockResolvedValue(legacyMaintainerSession());
    const session = await requireRole("operator");
    expect(session).toBeNull();
  });

  it("denies admin access to a maintainer without an explicit role", async () => {
    vi.mocked(getServerSession).mockResolvedValue(legacyMaintainerSession());
    const session = await requireRole("admin");
    expect(session).toBeNull();
  });

  // ── viewer role ───────────────────────────────────────────────────────────

  it("grants viewer access to a viewer-role maintainer", async () => {
    vi.mocked(getServerSession).mockResolvedValue(maintainerSession("viewer"));
    expect(await requireRole("viewer")).not.toBeNull();
  });

  it("denies operator access to a viewer-role maintainer", async () => {
    vi.mocked(getServerSession).mockResolvedValue(maintainerSession("viewer"));
    expect(await requireRole("operator")).toBeNull();
  });

  it("denies admin access to a viewer-role maintainer", async () => {
    vi.mocked(getServerSession).mockResolvedValue(maintainerSession("viewer"));
    expect(await requireRole("admin")).toBeNull();
  });

  // ── operator role ─────────────────────────────────────────────────────────

  it("grants viewer access to an operator-role maintainer (hierarchy)", async () => {
    vi.mocked(getServerSession).mockResolvedValue(maintainerSession("operator"));
    expect(await requireRole("viewer")).not.toBeNull();
  });

  it("grants operator access to an operator-role maintainer", async () => {
    vi.mocked(getServerSession).mockResolvedValue(maintainerSession("operator"));
    expect(await requireRole("operator")).not.toBeNull();
  });

  it("denies admin access to an operator-role maintainer", async () => {
    vi.mocked(getServerSession).mockResolvedValue(maintainerSession("operator"));
    expect(await requireRole("admin")).toBeNull();
  });

  // ── admin role ────────────────────────────────────────────────────────────

  it("grants viewer access to an admin-role maintainer (hierarchy)", async () => {
    vi.mocked(getServerSession).mockResolvedValue(maintainerSession("admin"));
    expect(await requireRole("viewer")).not.toBeNull();
  });

  it("grants operator access to an admin-role maintainer (hierarchy)", async () => {
    vi.mocked(getServerSession).mockResolvedValue(maintainerSession("admin"));
    expect(await requireRole("operator")).not.toBeNull();
  });

  it("grants admin access to an admin-role maintainer", async () => {
    vi.mocked(getServerSession).mockResolvedValue(maintainerSession("admin"));
    expect(await requireRole("admin")).not.toBeNull();
  });

  // ── audit log on denial ───────────────────────────────────────────────────

  it("records an audit log entry when access is denied for an authenticated maintainer", async () => {
    vi.mocked(getServerSession).mockResolvedValue(maintainerSession("viewer"));
    await requireRole("admin", "test.action");
    expect(recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "rbac_access_denied",
        actorId: "user-1",
        metadata: expect.objectContaining({
          requiredRole: "admin",
          actualRole: "viewer",
          action: "test.action",
        }),
      })
    );
  });

  it("does NOT record an audit log when no session exists", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    await requireRole("admin");
    expect(recordAuditLog).not.toHaveBeenCalled();
  });

  it("records 'unknown' action when no action label is passed", async () => {
    vi.mocked(getServerSession).mockResolvedValue(maintainerSession("viewer"));
    await requireRole("admin");
    expect(recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ action: "unknown" }),
      })
    );
  });

  // ── returned session shape ────────────────────────────────────────────────

  it("returns the full session when access is granted", async () => {
    const expected = maintainerSession("admin");
    vi.mocked(getServerSession).mockResolvedValue(expected);
    const result = await requireRole("admin");
    expect(result).toEqual(expected);
  });
});

// ---------------------------------------------------------------------------
// requireOperator
// ---------------------------------------------------------------------------

describe("requireOperator", () => {
  beforeEach(() => vi.clearAllMocks());

  it("grants access to an operator-role maintainer", async () => {
    vi.mocked(getServerSession).mockResolvedValue(maintainerSession("operator"));
    expect(await requireOperator()).not.toBeNull();
  });

  it("grants access to an admin-role maintainer (hierarchy)", async () => {
    vi.mocked(getServerSession).mockResolvedValue(maintainerSession("admin"));
    expect(await requireOperator()).not.toBeNull();
  });

  it("denies access to a viewer-role maintainer", async () => {
    vi.mocked(getServerSession).mockResolvedValue(maintainerSession("viewer"));
    expect(await requireOperator()).toBeNull();
  });

  it("denies access to a legacy maintainer (defaults to viewer)", async () => {
    vi.mocked(getServerSession).mockResolvedValue(legacyMaintainerSession());
    expect(await requireOperator()).toBeNull();
  });

  it("denies access to a non-maintainer", async () => {
    vi.mocked(getServerSession).mockResolvedValue(contributorSession());
    expect(await requireOperator()).toBeNull();
  });

  it("denies access with no session", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    expect(await requireOperator()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// requireAdmin
// ---------------------------------------------------------------------------

describe("requireAdmin", () => {
  beforeEach(() => vi.clearAllMocks());

  it("grants access to an admin-role maintainer", async () => {
    vi.mocked(getServerSession).mockResolvedValue(maintainerSession("admin"));
    expect(await requireAdmin()).not.toBeNull();
  });

  it("denies access to an operator-role maintainer", async () => {
    vi.mocked(getServerSession).mockResolvedValue(maintainerSession("operator"));
    expect(await requireAdmin()).toBeNull();
  });

  it("denies access to a viewer-role maintainer", async () => {
    vi.mocked(getServerSession).mockResolvedValue(maintainerSession("viewer"));
    expect(await requireAdmin()).toBeNull();
  });

  it("denies access to a legacy maintainer (defaults to viewer)", async () => {
    vi.mocked(getServerSession).mockResolvedValue(legacyMaintainerSession());
    expect(await requireAdmin()).toBeNull();
  });

  it("denies access to a non-maintainer contributor", async () => {
    vi.mocked(getServerSession).mockResolvedValue(contributorSession());
    expect(await requireAdmin()).toBeNull();
  });

  it("denies access with no session", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    expect(await requireAdmin()).toBeNull();
  });

  it("records audit log on denial for an authenticated but under-privileged maintainer", async () => {
    vi.mocked(getServerSession).mockResolvedValue(maintainerSession("operator"));
    await requireAdmin("invites.generate");
    expect(recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "rbac_access_denied",
        metadata: expect.objectContaining({
          requiredRole: "admin",
          actualRole: "operator",
          action: "invites.generate",
        }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// requireMaintainerSession
// ---------------------------------------------------------------------------

describe("requireMaintainerSession", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the session for a maintainer", async () => {
    const s = maintainerSession("viewer");
    vi.mocked(getServerSession).mockResolvedValue(s);
    expect(await requireMaintainerSession()).toEqual(s);
  });

  it("returns null for a non-maintainer", async () => {
    vi.mocked(getServerSession).mockResolvedValue(contributorSession());
    expect(await requireMaintainerSession()).toBeNull();
  });

  it("returns null for no session", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    expect(await requireMaintainerSession()).toBeNull();
  });

  it("does not care about role — any maintainer is allowed", async () => {
    for (const role of ["viewer", "operator", "admin"] as const) {
      vi.mocked(getServerSession).mockResolvedValue(maintainerSession(role));
      expect(await requireMaintainerSession()).not.toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// isAuthorizedScheduler
// ---------------------------------------------------------------------------

describe("isAuthorizedScheduler", () => {
  const SECRET = "super-secret-cron-value";

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  function makeRequest(authHeader: string | null): {
    headers: { get(name: string): string | null };
  } {
    return {
      headers: {
        get: (name: string) =>
          name.toLowerCase() === "authorization" ? authHeader : null,
      },
    };
  }

  it("returns false when CRON_SECRET is not configured", () => {
    delete process.env.CRON_SECRET;
    const req = makeRequest(`Bearer ${SECRET}`);
    expect(isAuthorizedScheduler(req)).toBe(false);
  });

  it("returns false when CRON_SECRET is an empty string", () => {
    process.env.CRON_SECRET = "   "; // whitespace-only
    const req = makeRequest(`Bearer ${SECRET}`);
    expect(isAuthorizedScheduler(req)).toBe(false);
  });

  it("returns true when Bearer token exactly matches CRON_SECRET", () => {
    process.env.CRON_SECRET = SECRET;
    const req = makeRequest(`Bearer ${SECRET}`);
    expect(isAuthorizedScheduler(req)).toBe(true);
  });

  it("returns false when Bearer token does NOT match CRON_SECRET", () => {
    process.env.CRON_SECRET = SECRET;
    const req = makeRequest("Bearer wrong-token");
    expect(isAuthorizedScheduler(req)).toBe(false);
  });

  it("returns false when Authorization header is absent", () => {
    process.env.CRON_SECRET = SECRET;
    const req = makeRequest(null);
    expect(isAuthorizedScheduler(req)).toBe(false);
  });

  it("returns false for a token without the Bearer prefix", () => {
    process.env.CRON_SECRET = SECRET;
    const req = makeRequest(SECRET); // no "Bearer " prefix
    expect(isAuthorizedScheduler(req)).toBe(false);
  });

  it("returns false for Basic auth instead of Bearer", () => {
    process.env.CRON_SECRET = SECRET;
    const req = makeRequest(`Basic ${SECRET}`);
    expect(isAuthorizedScheduler(req)).toBe(false);
  });

  it("is case-sensitive — 'bearer' prefix does not match 'Bearer'", () => {
    process.env.CRON_SECRET = SECRET;
    const req = makeRequest(`bearer ${SECRET}`);
    expect(isAuthorizedScheduler(req)).toBe(false);
  });

  it("also works with a native Headers object", () => {
    process.env.CRON_SECRET = SECRET;
    const headers = new Headers({ authorization: `Bearer ${SECRET}` });
    expect(isAuthorizedScheduler({ headers })).toBe(true);
  });
});
