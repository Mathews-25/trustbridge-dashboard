/**
 * API tests for /api/actions/lookup
 *
 * Tests the public action lookup endpoint which:
 * - Validates Stellar addresses
 * - Checks account trustlines and balances on Horizon
 * - Returns action recommendations
 * - Implements caching (30s TTL)
 * - Does NOT require authentication
 *
 * SSRF: Not applicable (Horizon is server-side only)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

// Mock dependencies — keep real cache key/header helpers, stub only getOrCompute
vi.mock("@/lib/horizon");
vi.mock("@/lib/cache", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/cache")>();
  return {
    ...actual,
    verificationCache: Object.assign(actual.verificationCache, {
      getOrCompute: vi.fn(),
    }),
  };
});
vi.mock("@/lib/action-lookup");

import { GET } from "@/app/api/actions/lookup/route";
import * as horizonLib from "@/lib/horizon";
import * as cacheLib from "@/lib/cache";
import * as actionLookupLib from "@/lib/action-lookup";

describe("GET /api/actions/lookup", () => {
  const VALID_ADDRESS = "GDXNXL25GDM3N5LAR5FALA3VSGHFET3EOKLXRP3ITPPMR3PISTQSKSFS";
  const VALID_ADDRESS_2 = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
  const INVALID_ADDRESS = "NOTAVALIDADDRESS";
  const DEFAULT_ASSET_CODE = "USDC";
  const DEFAULT_ASSET_ISSUER = "GBBD47XCVX2FTHVG7245YFSSSFYQ2Y5RJRQ3QH6POIRXZVSFD3ZCVTEJ";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validation", () => {
    it("rejects request without address parameter", async () => {
      const request = new NextRequest("http://localhost:3000/api/actions/lookup");
      const response = await GET(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toMatch(/address.*required/i);
    });

    it("rejects request with empty address parameter", async () => {
      const request = new NextRequest("http://localhost:3000/api/actions/lookup?address=");
      const response = await GET(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toMatch(/address.*required|invalid/i);
    });

    it("rejects invalid Stellar address format", async () => {
      const request = new NextRequest(
        `http://localhost:3000/api/actions/lookup?address=${INVALID_ADDRESS}`
      );
      const response = await GET(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toMatch(/invalid.*stellar|G-address/i);
    });

    it("trims whitespace from address parameter", async () => {
      const mockResult = { nextAction: "ready" };
      const mockCheckResult = {
        address: VALID_ADDRESS,
        hasWallet: true,
        hasTrustline: true,
      };

      vi.mocked(horizonLib.checkStellarAddress).mockResolvedValue(mockCheckResult);
      vi.mocked(actionLookupLib.buildActionLookupResult).mockReturnValue(mockResult);
      vi.mocked(cacheLib.verificationCache.getOrCompute).mockResolvedValue(mockResult);

      const request = new NextRequest(
        `http://localhost:3000/api/actions/lookup?address=  ${VALID_ADDRESS}  `
      );
      const response = await GET(request);

      expect(response.status).toBe(200);
    });
  });

  describe("cache behavior", () => {
    it("uses cache for identical requests", async () => {
      const mockResult = { nextAction: "ready" };
      const cacheGetOrComputeSpy = vi.spyOn(cacheLib.verificationCache, "getOrCompute");
      cacheGetOrComputeSpy.mockResolvedValue(mockResult);

      const request1 = new NextRequest(
        `http://localhost:3000/api/actions/lookup?address=${VALID_ADDRESS}`
      );
      const response1 = await GET(request1);
      expect(response1.status).toBe(200);

      // Second request should use same cache entry
      const request2 = new NextRequest(
        `http://localhost:3000/api/actions/lookup?address=${VALID_ADDRESS}`
      );
      const response2 = await GET(request2);
      expect(response2.status).toBe(200);

      // Verify cache was called with 30s TTL
      expect(cacheGetOrComputeSpy).toHaveBeenCalledWith(
        expect.stringContaining("action-lookup"),
        expect.any(Function),
        30000 // TTL in milliseconds
      );
    });

    it("includes proper Cache-Control headers", async () => {
      const mockResult = { nextAction: "ready" };
      vi.mocked(cacheLib.verificationCache.getOrCompute).mockResolvedValue(mockResult);

      const request = new NextRequest(
        `http://localhost:3000/api/actions/lookup?address=${VALID_ADDRESS}`
      );
      const response = await GET(request);

      expect(response.headers.has("Cache-Control")).toBe(true);
      const cacheControl = response.headers.get("Cache-Control");
      expect(cacheControl).toMatch(/max-age|public|private/i);
    });

    it("uses different cache keys for different addresses", async () => {
      const mockResult = { nextAction: "ready" };
      const cacheGetOrComputeSpy = vi.spyOn(cacheLib.verificationCache, "getOrCompute");
      cacheGetOrComputeSpy.mockResolvedValue(mockResult);

      const address1 = VALID_ADDRESS;
      const address2 = VALID_ADDRESS_2;

      const request1 = new NextRequest(
        `http://localhost:3000/api/actions/lookup?address=${address1}`
      );
      await GET(request1);

      const request2 = new NextRequest(
        `http://localhost:3000/api/actions/lookup?address=${address2}`
      );
      await GET(request2);

      // Cache should be called twice with different keys
      expect(cacheGetOrComputeSpy).toHaveBeenCalledTimes(2);
      const firstCall = cacheGetOrComputeSpy.mock.calls[0][0];
      const secondCall = cacheGetOrComputeSpy.mock.calls[1][0];
      expect(firstCall).not.toEqual(secondCall);
    });

    it("uses different cache keys for different assets", async () => {
      const mockResult = { nextAction: "ready" };
      const cacheGetOrComputeSpy = vi.spyOn(cacheLib.verificationCache, "getOrCompute");
      cacheGetOrComputeSpy.mockResolvedValue(mockResult);

      const request1 = new NextRequest(
        `http://localhost:3000/api/actions/lookup?address=${VALID_ADDRESS}&asset_code=USDC`
      );
      await GET(request1);

      const request2 = new NextRequest(
        `http://localhost:3000/api/actions/lookup?address=${VALID_ADDRESS}&asset_code=EUROC`
      );
      await GET(request2);

      // Cache keys should differ based on asset
      expect(cacheGetOrComputeSpy).toHaveBeenCalledTimes(2);
      const firstCall = cacheGetOrComputeSpy.mock.calls[0][0];
      const secondCall = cacheGetOrComputeSpy.mock.calls[1][0];
      expect(firstCall).not.toEqual(secondCall);
    });
  });

  describe("successful lookup", () => {
    it("returns action recommendation for valid address", async () => {
      const mockCheckResult = {
        address: VALID_ADDRESS,
        hasWallet: true,
        hasTrustline: true,
        balance: "100.0",
      };
      const mockLookupResult = {
        nextAction: "ready",
        readiness: "ready",
      };

      vi.mocked(horizonLib.checkStellarAddress).mockResolvedValue(mockCheckResult);
      vi.mocked(actionLookupLib.buildActionLookupResult).mockReturnValue(mockLookupResult);
      vi.mocked(cacheLib.verificationCache.getOrCompute).mockResolvedValue(mockLookupResult);

      const request = new NextRequest(
        `http://localhost:3000/api/actions/lookup?address=${VALID_ADDRESS}`
      );
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty("nextAction");
      expect(data).toHaveProperty("readiness");
    });

    it("accepts custom asset code and issuer parameters", async () => {
      const mockResult = { nextAction: "ready" };
      const cacheGetOrComputeSpy = vi.spyOn(cacheLib.verificationCache, "getOrCompute");
      cacheGetOrComputeSpy.mockResolvedValue(mockResult);

      const customAssetCode = "EUROC";
      const customAssetIssuer = "GBUQWP3BOUZX34ULNQG23RQ6F4BVWBRXLCUBCC5LJ4AXCIW7QLRBTOWM";

      const request = new NextRequest(
        `http://localhost:3000/api/actions/lookup?address=${VALID_ADDRESS}&asset_code=${customAssetCode}&asset_issuer=${customAssetIssuer}`
      );
      const response = await GET(request);

      expect(response.status).toBe(200);

      // Verify cache key includes the custom asset
      const cacheKeyCall = cacheGetOrComputeSpy.mock.calls[0][0];
      expect(cacheKeyCall).toContain(customAssetCode);
      expect(cacheKeyCall).toContain(customAssetIssuer);
    });
  });

  describe("rate limiting and abuse prevention", () => {
    it("is public and requires no authentication", async () => {
      const mockResult = { nextAction: "ready" };
      vi.mocked(cacheLib.verificationCache.getOrCompute).mockResolvedValue(mockResult);

      // Request with no auth headers should succeed
      const request = new NextRequest(
        `http://localhost:3000/api/actions/lookup?address=${VALID_ADDRESS}`,
        {
          headers: {},
        }
      );
      const response = await GET(request);

      expect(response.status).toBe(200);
    });

    it("relies on cache to mitigate repeated requests", async () => {
      const mockResult = { nextAction: "ready" };
      const checkSpy = vi.spyOn(horizonLib, "checkStellarAddress");
      const cacheGetOrComputeSpy = vi.spyOn(cacheLib.verificationCache, "getOrCompute");

      // Simulate cache hit
      cacheGetOrComputeSpy.mockResolvedValue(mockResult);

      for (let i = 0; i < 5; i++) {
        const request = new NextRequest(
          `http://localhost:3000/api/actions/lookup?address=${VALID_ADDRESS}`
        );
        await GET(request);
      }

      // Cache should prevent multiple Horizon calls
      expect(cacheGetOrComputeSpy).toHaveBeenCalledTimes(5);
      // The actual Horizon call would be inside the cache compute function
    });
  });

  describe("error handling", () => {
    it("handles Horizon service errors gracefully", async () => {
      const error = new Error("Horizon service unavailable");
      vi.mocked(cacheLib.verificationCache.getOrCompute).mockRejectedValue(error);

      const request = new NextRequest(
        `http://localhost:3000/api/actions/lookup?address=${VALID_ADDRESS}`
      );
      const response = await GET(request);

      // Should return 5xx error
      expect(response.status).toBeGreaterThanOrEqual(500);
    });

    it("does not expose sensitive error details", async () => {
      const error = new Error("Internal database error at xyz.example.com");
      vi.mocked(cacheLib.verificationCache.getOrCompute).mockRejectedValue(error);

      const request = new NextRequest(
        `http://localhost:3000/api/actions/lookup?address=${VALID_ADDRESS}`
      );
      const response = await GET(request);

      const data = await response.json();
      // Should not expose database URLs or internal details
      expect(JSON.stringify(data)).not.toMatch(/example\.com|database|internal/i);
    });
  });

  describe("response content type", () => {
    it("returns JSON content type", async () => {
      const mockResult = { nextAction: "ready" };
      vi.mocked(cacheLib.verificationCache.getOrCompute).mockResolvedValue(mockResult);

      const request = new NextRequest(
        `http://localhost:3000/api/actions/lookup?address=${VALID_ADDRESS}`
      );
      const response = await GET(request);

      expect(response.headers.get("content-type")).toMatch(/application\/json/i);
    });
  });

  describe("rate-limit headers", () => {
    it("returns RateLimit-* headers on successful response", async () => {
      const mockResult = { nextAction: "none" };
      vi.mocked(cacheLib.verificationCache.getOrCompute).mockResolvedValue(mockResult);

      const request = new NextRequest(
        `http://localhost:3000/api/actions/lookup?address=${VALID_ADDRESS}`
      );
      const response = await GET(request);

      expect(response.headers.get("ratelimit-limit")).toBeTruthy();
      expect(response.headers.get("ratelimit-remaining")).toBeTruthy();
      expect(response.headers.get("ratelimit-reset")).toBeTruthy();
    });
  });
});
