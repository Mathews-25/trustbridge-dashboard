import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  validateUrl,
  fetchTreasuryExport,
  triggerRecheck,
  loadStoredConfig,
  saveStoredConfig,
} from "../../scripts/cli/client.mjs";
import { parseArgs } from "../../scripts/cli/index.mjs";

describe("trustbridge-dash CLI", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  describe("URL Validation & Protocol Policy", () => {
    it("accepts valid HTTPS URLs", () => {
      const parsed = validateUrl("https://dashboard.trustbridge.org");
      expect(parsed.protocol).toBe("https:");
      expect(parsed.host).toBe("dashboard.trustbridge.org");
    });

    it("rejects non-HTTPS URLs by default to ensure security", () => {
      expect(() => {
        validateUrl("http://dashboard.trustbridge.org");
      }).toThrow(/Insecure HTTP protocol is not permitted/i);
    });

    it("rejects invalid URLs", () => {
      expect(() => {
        validateUrl("not-a-valid-url");
      }).toThrow(/Invalid URL/i);
    });

    it("allows HTTP only when explicitly enabled for unit test mocking", () => {
      const parsed = validateUrl("http://localhost:3000", true);
      expect(parsed.protocol).toBe("http:");
    });
  });

  describe("Argument Parsing", () => {
    it("parses export command with options", () => {
      const parsed = parseArgs([
        "export",
        "--url",
        "https://api.trustbridge.org",
        "--api-key",
        "test_secret_key",
        "--format",
        "csv",
        "--out",
        "export.csv",
      ]);

      expect(parsed.command).toBe("export");
      expect(parsed.options.url).toBe("https://api.trustbridge.org");
      expect(parsed.options.apiKey).toBe("test_secret_key");
      expect(parsed.options.format).toBe("csv");
      expect(parsed.options.out).toBe("export.csv");
    });

    it("parses recheck command with flags", () => {
      const parsed = parseArgs(["recheck", "--all", "--url", "https://api.trustbridge.org"]);
      expect(parsed.command).toBe("recheck");
      expect(parsed.options.all).toBe(true);
      expect(parsed.options.url).toBe("https://api.trustbridge.org");
    });
  });

  describe("fetchTreasuryExport Client", () => {
    it("throws when API key / token is missing", async () => {
      await expect(
        fetchTreasuryExport({ url: "https://dashboard.trustbridge.org" })
      ).rejects.toThrow(/Authentication required/i);
    });

    it("fetches treasury export using Authorization and x-api-key headers", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({
          "content-type": "text/csv",
          "content-disposition": 'attachment; filename="treasury-export-2026-09-24.csv"',
        }),
        text: async () => "github_username,stellar_address,readiness\nalice,GA...,ready",
      });

      const res = await fetchTreasuryExport(
        {
          url: "https://dashboard.trustbridge.org",
          apiKey: "tb_live_secret123",
          format: "csv",
        },
        mockFetch as unknown as typeof fetch
      );

      expect(mockFetch).toHaveBeenCalledWith(
        "https://dashboard.trustbridge.org/api/treasury/export",
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            Authorization: "Bearer tb_live_secret123",
            "x-api-key": "tb_live_secret123",
          }),
        })
      );
      expect(res.data).toContain("alice");
      expect(res.filename).toBe("treasury-export-2026-09-24.csv");
    });

    it("throws clear error on server HTTP failure", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: "Forbidden",
        text: async () => JSON.stringify({ error: "Forbidden" }),
      });

      await expect(
        fetchTreasuryExport(
          {
            url: "https://dashboard.trustbridge.org",
            apiKey: "invalid_key",
          },
          mockFetch as unknown as typeof fetch
        )
      ).rejects.toThrow(/status 403/i);
    });
  });

  describe("triggerRecheck Client", () => {
    it("triggers batch recheck when all flag is passed", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ jobId: "job_123", status: "pending" }),
      });

      const res = await triggerRecheck(
        {
          url: "https://dashboard.trustbridge.org",
          apiKey: "tb_key",
          all: true,
        },
        mockFetch as unknown as typeof fetch
      );

      expect(mockFetch).toHaveBeenCalledWith(
        "https://dashboard.trustbridge.org/api/contributors",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer tb_key",
          }),
        })
      );
      expect(res.success).toBe(true);
      expect(res.result).toEqual({ jobId: "job_123", status: "pending" });
    });
  });
});
