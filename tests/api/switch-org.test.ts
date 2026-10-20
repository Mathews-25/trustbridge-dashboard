/**
 * Tests for POST /api/auth/switch-org and GET /api/auth/switch-org.
 *
 * Covers:
 * - Happy path: valid org switch is accepted, audit log is written
 * - Failure: requested org not in availableOrgs → 403 with audit log
 * - Auth guard: non-maintainer session → 403
 * - Validation: missing/empty orgId → 400
 * - CSRF: cross-origin POST → 403 before any business logic
 * - GET: returns current org and available orgs for maintainer
 * - GET: returns 403 for non-maintainer
 */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  recordAuditLog: vi.fn(),
}));

// Import after mocks are registered
import { getServerSession } from "next-auth";
import { recordAuditLog } from "@/lib/audit";
import { GET, POST } from "@/app/api/auth/switch-org/route";

const AVAILABLE_ORGS = ["org-alpha", "org-beta", "org-gamma"];

function buildMaintainerSession(
  activeOrg = "org-alpha",
  availableOrgs = AVAILABLE_ORGS
) {
  return {
    user: {
      id: "maintainer-1",
      githubUsername: "octocat",
      isMaintainer: true,
      maintainerOrgId: activeOrg,
      availableOrgs,
    },
  };
}

function buildContributorSession() {
  return {
    user: {
      id: "contributor-1",
      githubUsername: "contributor",
      isMaintainer: false,
      availableOrgs: [],
    },
  };
}

function makePostRequest(
  body: unknown,
  origin = "http://localhost:3000"
): NextRequest {
  return new NextRequest("http://localhost:3000/api/auth/switch-org", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      Host: "localhost:3000",
    },
    body: JSON.stringify(body),
  });
}

function makeGetRequest(): NextRequest {
  return new NextRequest("http://localhost:3000/api/auth/switch-org", {
    method: "GET",
  });
}

describe("POST /api/auth/switch-org", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 for unauthenticated requests", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);

    const req = makePostRequest({ orgId: "org-beta" });
    const res = await POST(req);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("Forbidden");
    expect(recordAuditLog).not.toHaveBeenCalled();
  });

  it("returns 403 for non-maintainer sessions", async () => {
    vi.mocked(getServerSession).mockResolvedValue(buildContributorSession() as any);

    const req = makePostRequest({ orgId: "org-beta" });
    const res = await POST(req);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("Forbidden");
  });

  it("returns 403 for cross-origin requests (CSRF guard)", async () => {
    vi.mocked(getServerSession).mockResolvedValue(buildMaintainerSession() as any);

    const req = new NextRequest("http://localhost:3000/api/auth/switch-org", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://evil.example.com",
        Host: "localhost:3000",
      },
      body: JSON.stringify({ orgId: "org-beta" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("Invalid request origin");
    // CSRF rejects before session check — audit log is NOT called
    expect(recordAuditLog).not.toHaveBeenCalled();
  });

  it("returns 400 when orgId is missing from the body", async () => {
    vi.mocked(getServerSession).mockResolvedValue(buildMaintainerSession() as any);

    const req = makePostRequest({});
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("orgId");
  });

  it("returns 400 when orgId is an empty string", async () => {
    vi.mocked(getServerSession).mockResolvedValue(buildMaintainerSession() as any);

    const req = makePostRequest({ orgId: "" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("non-empty");
  });

  it("returns 400 when the body is malformed JSON", async () => {
    vi.mocked(getServerSession).mockResolvedValue(buildMaintainerSession() as any);

    const req = new NextRequest("http://localhost:3000/api/auth/switch-org", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:3000",
        Host: "localhost:3000",
      },
      body: "not-json",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Invalid JSON body");
  });

  it("returns 403 and writes an audit log when the org is not in availableOrgs", async () => {
    vi.mocked(getServerSession).mockResolvedValue(buildMaintainerSession() as any);

    const req = makePostRequest({ orgId: "unknown-org" });
    const res = await POST(req);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("Org not available for this session");
    expect(json.availableOrgs).toEqual(AVAILABLE_ORGS);

    expect(recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "org_switch_denied",
        actorId: "maintainer-1",
        actorLogin: "octocat",
        metadata: expect.objectContaining({
          requestedOrg: "unknown-org",
          availableOrgs: AVAILABLE_ORGS,
        }),
      })
    );
  });

  it("accepts a valid org switch and writes an audit log", async () => {
    vi.mocked(getServerSession).mockResolvedValue(buildMaintainerSession() as any);
    vi.mocked(recordAuditLog).mockResolvedValue(undefined as any);

    const req = makePostRequest({ orgId: "org-beta" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.maintainerOrgId).toBe("org-beta");
    expect(json.availableOrgs).toEqual(AVAILABLE_ORGS);

    expect(recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "org_switched",
        actorId: "maintainer-1",
        actorLogin: "octocat",
        metadata: expect.objectContaining({
          fromOrg: "org-alpha",
          toOrg: "org-beta",
        }),
      })
    );
  });

  it("is case-insensitive: org-BETA matches org-beta in availableOrgs", async () => {
    vi.mocked(getServerSession).mockResolvedValue(
      buildMaintainerSession("org-alpha", ["org-alpha", "org-beta"]) as any
    );
    vi.mocked(recordAuditLog).mockResolvedValue(undefined as any);

    const req = makePostRequest({ orgId: "org-BETA" });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it("does not allow orgId that only partially matches an available org", async () => {
    vi.mocked(getServerSession).mockResolvedValue(buildMaintainerSession() as any);

    const req = makePostRequest({ orgId: "org-alph" }); // prefix match, not exact
    const res = await POST(req);
    expect(res.status).toBe(403);
  });
});

describe("GET /api/auth/switch-org", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 for non-maintainers", async () => {
    vi.mocked(getServerSession).mockResolvedValue(buildContributorSession() as any);

    const req = makeGetRequest();
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns 403 when unauthenticated", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);

    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns the current org and available orgs for a maintainer", async () => {
    vi.mocked(getServerSession).mockResolvedValue(
      buildMaintainerSession("org-beta", ["org-alpha", "org-beta"]) as any
    );

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.maintainerOrgId).toBe("org-beta");
    expect(json.availableOrgs).toEqual(["org-alpha", "org-beta"]);
  });

  it("falls back to 'default' when maintainerOrgId is absent from session", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: {
        id: "m-1",
        isMaintainer: true,
        // maintainerOrgId intentionally absent
      },
    } as any);

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.maintainerOrgId).toBe("default");
    expect(json.availableOrgs).toEqual([]);
  });
});
