import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {},
}));

vi.mock("@/lib/audit", () => ({
  recordAuditLog: vi.fn(),
}));

import { getServerSession } from "next-auth";
import {
  requireMaintainerSession,
  requireRole,
  requireOperator,
  requireAdmin,
  hasMinimumRole,
  ROLE_HIERARCHY,
} from "@/lib/api-auth";
import type { AppRole } from "@/types";

function mockSession(role?: AppRole, isMaintainer = true) {
  return {
    user: {
      id: "user-1",
      githubUsername: "testuser",
      isMaintainer,
      role,
    },
    expires: "2099-01-01T00:00:00.000Z",
  };
}

describe("RBAC role hierarchy", () => {
  it("admin > operator > viewer", () => {
    expect(ROLE_HIERARCHY.admin).toBeGreaterThan(ROLE_HIERARCHY.operator);
    expect(ROLE_HIERARCHY.operator).toBeGreaterThan(ROLE_HIERARCHY.viewer);
  });

  it("hasMinimumRole returns true when role meets requirement", () => {
    expect(hasMinimumRole("admin", "admin")).toBe(true);
    expect(hasMinimumRole("admin", "operator")).toBe(true);
    expect(hasMinimumRole("admin", "viewer")).toBe(true);
    expect(hasMinimumRole("operator", "operator")).toBe(true);
    expect(hasMinimumRole("operator", "viewer")).toBe(true);
    expect(hasMinimumRole("viewer", "viewer")).toBe(true);
  });

  it("hasMinimumRole returns false when role is below requirement", () => {
    expect(hasMinimumRole("viewer", "operator")).toBe(false);
    expect(hasMinimumRole("viewer", "admin")).toBe(false);
    expect(hasMinimumRole("operator", "admin")).toBe(false);
  });

  it("hasMinimumRole returns false for undefined role", () => {
    expect(hasMinimumRole(undefined, "viewer")).toBe(false);
  });
});

describe("requireRole", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns session when role meets requirement", async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession("admin"));

    const session = await requireRole("operator");
    expect(session).not.toBeNull();
    expect(session?.user.role).toBe("admin");
  });

  it("returns null when not a maintainer", async () => {
    vi.mocked(getServerSession).mockResolvedValue(
      mockSession("admin", false) as never
    );

    const session = await requireRole("viewer");
    expect(session).toBeNull();
  });

  it("returns null when role is insufficient and records audit", async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession("viewer"));

    const session = await requireRole("admin", "test_action");
    expect(session).toBeNull();
  });

  it("defaults to viewer for maintainers without explicit role", async () => {
    vi.mocked(getServerSession).mockResolvedValue(
      mockSession(undefined) as never
    );

    const session = await requireRole("viewer");
    expect(session).not.toBeNull();
  });
});

describe("requireOperator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns session for operators", async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession("operator"));
    const session = await requireOperator();
    expect(session).not.toBeNull();
  });

  it("returns session for admins", async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession("admin"));
    const session = await requireOperator();
    expect(session).not.toBeNull();
  });

  it("returns null for viewers", async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession("viewer"));
    const session = await requireOperator();
    expect(session).toBeNull();
  });
});

describe("requireAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns session for admins", async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession("admin"));
    const session = await requireAdmin();
    expect(session).not.toBeNull();
  });

  it("returns null for operators", async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession("operator"));
    const session = await requireAdmin();
    expect(session).toBeNull();
  });

  it("returns null for viewers", async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession("viewer"));
    const session = await requireAdmin();
    expect(session).toBeNull();
  });
});

describe("requireMaintainerSession (backwards compatibility)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns session for maintainers", async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession("viewer"));
    const session = await requireMaintainerSession();
    expect(session).not.toBeNull();
  });

  it("returns null for non-maintainers", async () => {
    vi.mocked(getServerSession).mockResolvedValue(
      mockSession(undefined, false) as never
    );
    const session = await requireMaintainerSession();
    expect(session).toBeNull();
  });
});