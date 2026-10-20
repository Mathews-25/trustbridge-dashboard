import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  checkRateLimit,
  extractClientIp,
  resetRateLimit,
  getRateLimitMetrics,
  buildRateLimitHeaders,
} from "@/lib/rate-limit";
import { NextRequest } from "next/server";

describe("Rate Limiting", () => {
  beforeEach(() => {
    resetRateLimit();
    vi.clearAllTimers();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetRateLimit();
  });

  describe("checkRateLimit", () => {
    it("allows first request", () => {
      const result = checkRateLimit("user-1");

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9);
      expect(result.retryAfter).toBe(0);
    });

    it("tracks remaining requests", () => {
      for (let i = 0; i < 5; i++) {
        checkRateLimit("user-1");
      }

      const result = checkRateLimit("user-1");

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
    });

    it("blocks after max requests", () => {
      for (let i = 0; i < 10; i++) {
        checkRateLimit("user-1");
      }

      const result = checkRateLimit("user-1");

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it("respects custom window and max", () => {
      const result1 = checkRateLimit("user-2", {
        windowMs: 60_000,
        maxRequests: 3,
      });
      expect(result1.allowed).toBe(true);

      checkRateLimit("user-2", {
        windowMs: 60_000,
        maxRequests: 3,
      });
      checkRateLimit("user-2", {
        windowMs: 60_000,
        maxRequests: 3,
      });

      const result4 = checkRateLimit("user-2", {
        windowMs: 60_000,
        maxRequests: 3,
      });

      expect(result4.allowed).toBe(false);
    });

    it("resets after window expires", () => {
      for (let i = 0; i < 10; i++) {
        checkRateLimit("user-3", { windowMs: 5_000, maxRequests: 10 });
      }

      let result = checkRateLimit("user-3", {
        windowMs: 5_000,
        maxRequests: 10,
      });
      expect(result.allowed).toBe(false);

      vi.advanceTimersByTime(6_000);

      result = checkRateLimit("user-3", {
        windowMs: 5_000,
        maxRequests: 10,
      });

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9);
    });

    it("calculates retryAfter correctly", () => {
      const opts = { windowMs: 10_000, maxRequests: 2 };

      checkRateLimit("user-4", opts);
      checkRateLimit("user-4", opts);

      vi.advanceTimersByTime(3_000);
      const result = checkRateLimit("user-4", opts);

      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBe(7);
    });

    it("tracks different identifiers separately", () => {
      const result1 = checkRateLimit("user-a");
      const result2 = checkRateLimit("user-b");

      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(true);
      expect(result1.remaining).toBe(9);
      expect(result2.remaining).toBe(9);
    });

    it("uses environment defaults", () => {
      process.env.RATE_LIMIT_WINDOW_MS = "30000";
      process.env.RATE_LIMIT_MAX_REQUESTS = "5";

      for (let i = 0; i < 5; i++) {
        checkRateLimit("env-user");
      }

      const result = checkRateLimit("env-user");

      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeGreaterThan(0);

      delete process.env.RATE_LIMIT_WINDOW_MS;
      delete process.env.RATE_LIMIT_MAX_REQUESTS;
    });

    it("handles invalid env vars gracefully", () => {
      process.env.RATE_LIMIT_MAX_REQUESTS = "invalid";

      const result = checkRateLimit("user-5");

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9);

      delete process.env.RATE_LIMIT_MAX_REQUESTS;
    });
  });

  describe("getRateLimitMetrics", () => {
    it("returns initial zero metrics when store is empty", () => {
      const metrics = getRateLimitMetrics();
      expect(metrics.activeIdentifiers).toBe(0);
      expect(metrics.totalAllowed).toBe(0);
      expect(metrics.totalBlocked).toBe(0);
      expect(metrics.processLocal).toBe(true);
      expect(metrics.options.windowMs).toBeGreaterThan(0);
      expect(metrics.options.maxRequests).toBeGreaterThan(0);
    });

    it("counts allowed requests in totalAllowed", () => {
      checkRateLimit("u1");
      checkRateLimit("u1");
      checkRateLimit("u2");

      const metrics = getRateLimitMetrics();
      expect(metrics.totalAllowed).toBe(3);
      expect(metrics.totalBlocked).toBe(0);
    });

    it("counts blocked requests in totalBlocked", () => {
      for (let i = 0; i < 10; i++) {
        checkRateLimit("blocked-user", { maxRequests: 10, windowMs: 60_000 });
      }
      checkRateLimit("blocked-user", { maxRequests: 10, windowMs: 60_000 });
      checkRateLimit("blocked-user", { maxRequests: 10, windowMs: 60_000 });

      const metrics = getRateLimitMetrics();
      expect(metrics.totalAllowed).toBe(10);
      expect(metrics.totalBlocked).toBe(2);
    });

    it("reports activeIdentifiers with requests in the current window", () => {
      const opts = { windowMs: 60_000, maxRequests: 10 };
      checkRateLimit("alice", opts);
      checkRateLimit("bob", opts);
      checkRateLimit("carol", opts);

      expect(getRateLimitMetrics().activeIdentifiers).toBe(3);

      vi.advanceTimersByTime(61_000);

      expect(getRateLimitMetrics().activeIdentifiers).toBe(0);
    });

    it("does NOT expose any identifier strings or IPs in metrics", () => {
      checkRateLimit("192.168.1.100");
      checkRateLimit("sensitive-identifier");

      const metrics = getRateLimitMetrics();
      const serialized = JSON.stringify(metrics);

      expect(serialized).not.toContain("192.168.1.100");
      expect(serialized).not.toContain("sensitive-identifier");
      expect(typeof metrics.activeIdentifiers).toBe("number");
    });

    it("resets counters when resetRateLimit() is called with no args", () => {
      for (let i = 0; i < 5; i++) {
        checkRateLimit("x");
      }
      expect(getRateLimitMetrics().totalAllowed).toBe(5);

      resetRateLimit();

      const after = getRateLimitMetrics();
      expect(after.totalAllowed).toBe(0);
      expect(after.totalBlocked).toBe(0);
      expect(after.activeIdentifiers).toBe(0);
    });

    it("returns options from environment or defaults", () => {
      process.env.RATE_LIMIT_WINDOW_MS = "45000";
      process.env.RATE_LIMIT_MAX_REQUESTS = "7";

      const metrics = getRateLimitMetrics();
      expect(metrics.options.windowMs).toBe(45_000);
      expect(metrics.options.maxRequests).toBe(7);

      delete process.env.RATE_LIMIT_WINDOW_MS;
      delete process.env.RATE_LIMIT_MAX_REQUESTS;
    });
  });

  describe("extractClientIp", () => {
    it("extracts from x-forwarded-for header", () => {
      const request = new NextRequest("http://localhost:3000", {
        method: "GET",
        headers: {
          "x-forwarded-for": "192.168.1.1, 10.0.0.1",
        },
      });

      const ip = extractClientIp(request);

      expect(ip).toBe("192.168.1.1");
    });

    it("uses x-real-ip if x-forwarded-for missing", () => {
      const request = new NextRequest("http://localhost:3000", {
        method: "GET",
        headers: {
          "x-real-ip": "203.0.113.5",
        },
      });

      const ip = extractClientIp(request);

      expect(ip).toBe("203.0.113.5");
    });

    it("uses cf-connecting-ip if other headers missing", () => {
      const request = new NextRequest("http://localhost:3000", {
        method: "GET",
        headers: {
          "cf-connecting-ip": "198.51.100.1",
        },
      });

      const ip = extractClientIp(request);

      expect(ip).toBe("198.51.100.1");
    });

    it("returns 'unknown' if no IP headers present", () => {
      const request = new NextRequest("http://localhost:3000", {
        method: "GET",
        headers: {},
      });

      const ip = extractClientIp(request);

      expect(ip).toBe("unknown");
    });

    it("prioritizes x-forwarded-for over other headers", () => {
      const request = new NextRequest("http://localhost:3000", {
        method: "GET",
        headers: {
          "x-forwarded-for": "192.168.1.1",
          "x-real-ip": "203.0.113.5",
          "cf-connecting-ip": "198.51.100.1",
        },
      });

      const ip = extractClientIp(request);

      expect(ip).toBe("192.168.1.1");
    });

    it("trims whitespace from headers", () => {
      const request = new NextRequest("http://localhost:3000", {
        method: "GET",
        headers: {
          "x-real-ip": "  192.168.1.1  ",
        },
      });

      const ip = extractClientIp(request);

      expect(ip).toBe("192.168.1.1");
    });
  });

  describe("buildRateLimitHeaders", () => {
    it("returns standard headers for allowed request", () => {
      const result = { allowed: true, retryAfter: 0, remaining: 7 };
      const headers = buildRateLimitHeaders(result, 10);

      expect(headers["RateLimit-Limit"]).toBe("10");
      expect(headers["RateLimit-Remaining"]).toBe("7");
      expect(headers["RateLimit-Reset"]).toBe("0");
      expect(headers["Retry-After"]).toBeUndefined();
    });

    it("returns Retry-After header when rate limited", () => {
      const result = { allowed: false, retryAfter: 15, remaining: 0 };
      const headers = buildRateLimitHeaders(result, 10);

      expect(headers["RateLimit-Limit"]).toBe("10");
      expect(headers["RateLimit-Remaining"]).toBe("0");
      expect(headers["RateLimit-Reset"]).toBe("15");
      expect(headers["Retry-After"]).toBe("15");
    });

    it("floors remaining at 0", () => {
      const result = { allowed: false, retryAfter: 5, remaining: -1 };
      const headers = buildRateLimitHeaders(result, 10);

      expect(headers["RateLimit-Remaining"]).toBe("0");
    });

    it("sets Reset to 0 for allowed requests", () => {
      const result = { allowed: true, retryAfter: 0, remaining: 9 };
      const headers = buildRateLimitHeaders(result, 10);

      expect(headers["RateLimit-Reset"]).toBe("0");
    });
  });

  describe("resetRateLimit", () => {
    it("resets specific identifier", () => {
      for (let i = 0; i < 10; i++) {
        checkRateLimit("user-x");
      }

      let result = checkRateLimit("user-x");
      expect(result.allowed).toBe(false);

      resetRateLimit("user-x");

      result = checkRateLimit("user-x");
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9);
    });

    it("resets all identifiers when no argument", () => {
      for (let i = 0; i < 10; i++) {
        checkRateLimit("user-a");
        checkRateLimit("user-b");
      }

      let resultA = checkRateLimit("user-a");
      let resultB = checkRateLimit("user-b");
      expect(resultA.allowed).toBe(false);
      expect(resultB.allowed).toBe(false);

      resetRateLimit();

      resultA = checkRateLimit("user-a");
      resultB = checkRateLimit("user-b");
      expect(resultA.allowed).toBe(true);
      expect(resultB.allowed).toBe(true);
    });
  });
});
