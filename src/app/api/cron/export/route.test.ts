import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-auth", () => ({
  requireMaintainerSession: vi.fn(),
  isAuthorizedScheduler: vi.fn((req: NextRequest) => {
    const secret = process.env.CRON_SECRET?.trim();
    if (!secret) return false;
    return req.headers.get("authorization") === `Bearer ${secret}`;
  }),
}));

vi.mock("@/lib/cron-export", () => ({
  runCronExport: vi.fn(),
  getLastCronExportHealth: vi.fn(),
}));

import { requireMaintainerSession } from "@/lib/api-auth";
import {
  getLastCronExportHealth,
  runCronExport,
} from "@/lib/cron-export";
import { GET, POST } from "@/app/api/cron/export/route";

function post(headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost:3000/api/cron/export", {
    method: "POST",
    headers: { host: "localhost:3000", ...headers },
  });
}

function get(headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost:3000/api/cron/export", {
    method: "GET",
    headers: { host: "localhost:3000", ...headers },
  });
}

describe("POST /api/cron/export", () => {
  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.CRON_SECRET;
  });

  it("returns 403 when unauthenticated and no CRON_SECRET provided", async () => {
    vi.mocked(requireMaintainerSession).mockResolvedValue(null);

    const res = await POST(post());

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("Forbidden");
    expect(runCronExport).not.toHaveBeenCalled();
  });

  it("allows a request bearing a valid CRON_SECRET even without a session", async () => {
    process.env.CRON_SECRET = "cron-token-123";
    vi.mocked(requireMaintainerSession).mockResolvedValue(null);
    vi.mocked(runCronExport).mockResolvedValue({
      status: "ok",
      startedAt: new Date().toISOString(),
      durationMs: 12,
      filename: "contributors-2026-08-30.csv",
      totalContributors: 5,
      readyCount: 4,
      staleCount: 0,
      destination: "treasury@example.com",
      emailSent: true,
    });

    const res = await POST(post({ authorization: "Bearer cron-token-123" }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("ok");
    expect(json.totalContributors).toBe(5);
    expect(runCronExport).toHaveBeenCalledWith({
      actorId: null,
      actorLogin: "scheduler:cron",
    });
  });

  it("rejects an invalid CRON_SECRET", async () => {
    process.env.CRON_SECRET = "cron-token-123";
    vi.mocked(requireMaintainerSession).mockResolvedValue(null);

    const res = await POST(post({ authorization: "Bearer invalid-token" }));

    expect(res.status).toBe(403);
    expect(runCronExport).not.toHaveBeenCalled();
  });

  it("allows maintainer session without CRON_SECRET", async () => {
    vi.mocked(requireMaintainerSession).mockResolvedValue({
      user: { id: "m1", githubUsername: "maintainer-alice", isMaintainer: true },
    } as never);
    vi.mocked(runCronExport).mockResolvedValue({
      status: "ok",
      startedAt: new Date().toISOString(),
      durationMs: 10,
      totalContributors: 1,
    });

    const res = await POST(post());

    expect(res.status).toBe(200);
    expect(runCronExport).toHaveBeenCalledWith({
      actorId: "m1",
      actorLogin: "maintainer-alice",
    });
  });

  it("returns 502 when export fails", async () => {
    process.env.CRON_SECRET = "cron-token-123";
    vi.mocked(requireMaintainerSession).mockResolvedValue(null);
    vi.mocked(runCronExport).mockResolvedValue({
      status: "error",
      startedAt: new Date().toISOString(),
      durationMs: 8,
      error: "Failed to connect to database",
    });

    const res = await POST(post({ authorization: "Bearer cron-token-123" }));

    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error).toBe("Failed to connect to database");
  });
});

describe("GET /api/cron/export", () => {
  it("returns status of most recent export run", async () => {
    vi.mocked(getLastCronExportHealth).mockReturnValue({
      status: "ok",
      startedAt: "2026-08-30T05:00:00.000Z",
      durationMs: 25,
      totalContributors: 10,
      readyCount: 9,
    });

    const res = await GET();

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.lastRun?.totalContributors).toBe(10);
  });
});
