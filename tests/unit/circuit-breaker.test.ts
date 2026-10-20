import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  CircuitBreaker,
  CircuitBreakerOpenError,
  type CircuitBreakerTripEvent,
} from "@/lib/circuit-breaker";

describe("CircuitBreaker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows calls when CLOSED", async () => {
    const cb = new CircuitBreaker({
      failureThreshold: 3,
      successThreshold: 2,
      recoveryTimeoutMs: 1000,
    });
    const result = await cb.call(() => Promise.resolve(42));
    expect(result).toBe(42);
    expect(cb.getState()).toBe("CLOSED");
  });

  it("opens after failure threshold reached", async () => {
    const cb = new CircuitBreaker({
      failureThreshold: 2,
      successThreshold: 1,
      recoveryTimeoutMs: 5000,
    });

    await expect(cb.call(() => Promise.reject(new Error("fail")))).rejects.toThrow("fail");
    expect(cb.getState()).toBe("CLOSED");

    await expect(cb.call(() => Promise.reject(new Error("fail")))).rejects.toThrow("fail");
    expect(cb.getState()).toBe("OPEN");
  });

  it("fast-fails with CircuitBreakerOpenError when OPEN", async () => {
    const cb = new CircuitBreaker({
      failureThreshold: 1,
      successThreshold: 1,
      recoveryTimeoutMs: 5000,
    });

    await expect(cb.call(() => Promise.reject(new Error("fail")))).rejects.toThrow("fail");
    expect(cb.getState()).toBe("OPEN");

    await expect(cb.call(() => Promise.resolve(42))).rejects.toThrow(CircuitBreakerOpenError);
  });

  it("transitions to HALF_OPEN after recovery timeout", async () => {
    const cb = new CircuitBreaker({
      failureThreshold: 1,
      successThreshold: 1,
      recoveryTimeoutMs: 1000,
    });

    await expect(cb.call(() => Promise.reject(new Error("fail")))).rejects.toThrow("fail");
    expect(cb.getState()).toBe("OPEN");

    vi.advanceTimersByTime(1001);

    const result = await cb.call(() => Promise.resolve(42));
    expect(result).toBe(42);
    expect(cb.getState()).toBe("CLOSED");
  });

  it("returns to OPEN if HALF_OPEN call fails", async () => {
    const cb = new CircuitBreaker({
      failureThreshold: 1,
      successThreshold: 2,
      recoveryTimeoutMs: 1000,
    });

    await expect(cb.call(() => Promise.reject(new Error("fail")))).rejects.toThrow("fail");
    expect(cb.getState()).toBe("OPEN");

    vi.advanceTimersByTime(1001);

    await expect(cb.call(() => Promise.reject(new Error("fail")))).rejects.toThrow("fail");
    expect(cb.getState()).toBe("OPEN");
  });

  it("closes after success threshold in HALF_OPEN", async () => {
    const cb = new CircuitBreaker({
      failureThreshold: 1,
      successThreshold: 2,
      recoveryTimeoutMs: 1000,
    });

    await expect(cb.call(() => Promise.reject(new Error("fail")))).rejects.toThrow("fail");
    expect(cb.getState()).toBe("OPEN");

    vi.advanceTimersByTime(1001);

    await cb.call(() => Promise.resolve(1));
    expect(cb.getState()).toBe("HALF_OPEN");

    await cb.call(() => Promise.resolve(2));
    expect(cb.getState()).toBe("CLOSED");
  });

  it("resets failure count on success in CLOSED state", async () => {
    const cb = new CircuitBreaker({
      failureThreshold: 3,
      successThreshold: 1,
      recoveryTimeoutMs: 1000,
    });

    await expect(cb.call(() => Promise.reject(new Error("fail")))).rejects.toThrow("fail");
    await cb.call(() => Promise.resolve(42));

    await expect(cb.call(() => Promise.reject(new Error("fail")))).rejects.toThrow("fail");
    expect(cb.getState()).toBe("CLOSED");
  });

  it("uses env defaults when not set", async () => {
    const cb = new CircuitBreaker();
    expect(cb.getState()).toBe("CLOSED");
    await cb.call(() => Promise.resolve(42));
    expect(cb.getState()).toBe("CLOSED");
  });

  it("uses env values when set", async () => {
    vi.stubEnv("HORIZON_CB_FAILURE_THRESHOLD", "1");
    vi.stubEnv("HORIZON_CB_RECOVERY_MS", "500");
    vi.stubEnv("HORIZON_CB_SUCCESS_THRESHOLD", "1");

    const cb = new CircuitBreaker();
    await expect(cb.call(() => Promise.reject(new Error("fail")))).rejects.toThrow("fail");
    expect(cb.getState()).toBe("OPEN");

    vi.advanceTimersByTime(501);
    await cb.call(() => Promise.resolve(42));
    expect(cb.getState()).toBe("CLOSED");

    vi.unstubAllEnvs();
  });

  it("ignores malformed env values and uses defaults", async () => {
    vi.stubEnv("HORIZON_CB_FAILURE_THRESHOLD", "not-a-number");
    vi.stubEnv("HORIZON_CB_RECOVERY_MS", "not-a-number");
    vi.stubEnv("HORIZON_CB_SUCCESS_THRESHOLD", "not-a-number");

    const cb = new CircuitBreaker();
    await expect(cb.call(() => Promise.reject(new Error("fail")))).rejects.toThrow("fail");
    expect(cb.getState()).toBe("CLOSED");

    vi.unstubAllEnvs();
  });

  it("exposes metrics", async () => {
    const cb = new CircuitBreaker({
      failureThreshold: 1,
      successThreshold: 1,
      recoveryTimeoutMs: 1000,
    });

    const metrics1 = cb.getMetrics();
    expect(metrics1.state).toBe("CLOSED");
    expect(metrics1.failureCount).toBe(0);

    await expect(cb.call(() => Promise.reject(new Error("fail")))).rejects.toThrow("fail");
    const metrics2 = cb.getMetrics();
    expect(metrics2.state).toBe("OPEN");
    expect(metrics2.failureCount).toBe(1);
    expect(metrics2.lastFailureTime).not.toBeNull();
  });

  describe("trip history", () => {
    it("records a trip event when circuit opens", async () => {
      const cb = new CircuitBreaker({
        failureThreshold: 2,
        successThreshold: 1,
        recoveryTimeoutMs: 1000,
      });

      expect(cb.getMetrics().totalTrips).toBe(0);
      expect(cb.getMetrics().recentTrips).toHaveLength(0);

      await expect(cb.call(() => Promise.reject(new Error("fail")))).rejects.toThrow("fail");
      expect(cb.getMetrics().totalTrips).toBe(0);
      expect(cb.getMetrics().recentTrips).toHaveLength(0);

      await expect(cb.call(() => Promise.reject(new Error("fail")))).rejects.toThrow("fail");
      const metrics = cb.getMetrics();
      expect(metrics.totalTrips).toBe(1);
      expect(metrics.recentTrips).toHaveLength(1);
      expect(metrics.recentTrips[0].trippedAt).toBeGreaterThan(0);
      expect(metrics.recentTrips[0].failureCountAtTrip).toBe(2);
      expect(metrics.recentTrips[0].recoveredAt).toBeNull();
    });

    it("sets recoveredAt when circuit closes after success", async () => {
      const cb = new CircuitBreaker({
        failureThreshold: 1,
        successThreshold: 1,
        recoveryTimeoutMs: 500,
      });

      await expect(cb.call(() => Promise.reject(new Error("fail")))).rejects.toThrow("fail");
      const tripBefore = cb.getMetrics().recentTrips[0];
      expect(tripBefore.recoveredAt).toBeNull();

      vi.advanceTimersByTime(501);
      await cb.call(() => Promise.resolve("ok"));

      const tripAfter = cb.getMetrics().recentTrips[0];
      expect(tripAfter.recoveredAt).not.toBeNull();
      expect(tripAfter.recoveredAt!).toBeGreaterThan(tripAfter.trippedAt);
    });

    it("increments totalTrips across multiple open/close cycles", async () => {
      const cb = new CircuitBreaker({
        failureThreshold: 1,
        successThreshold: 1,
        recoveryTimeoutMs: 100,
      });

      for (let i = 0; i < 3; i++) {
        await expect(cb.call(() => Promise.reject(new Error("fail")))).rejects.toThrow("fail");
        vi.advanceTimersByTime(101);
        await cb.call(() => Promise.resolve("ok"));
      }

      const metrics = cb.getMetrics();
      expect(metrics.totalTrips).toBe(3);
      expect(metrics.recentTrips).toHaveLength(3);
      for (const trip of metrics.recentTrips) {
        expect(trip.recoveredAt).not.toBeNull();
      }
    });

    it("caps recent trip history at MAX_TRIP_HISTORY (20)", async () => {
      const cb = new CircuitBreaker({
        failureThreshold: 1,
        successThreshold: 1,
        recoveryTimeoutMs: 10,
      });

      for (let i = 0; i < 25; i++) {
        await expect(cb.call(() => Promise.reject(new Error("fail")))).rejects.toThrow("fail");
        vi.advanceTimersByTime(11);
        await cb.call(() => Promise.resolve("ok"));
      }

      const metrics = cb.getMetrics();
      expect(metrics.totalTrips).toBe(25);
      expect(metrics.recentTrips).toHaveLength(20);
    });

    it("reports current trip as still open if not recovered", async () => {
      const cb = new CircuitBreaker({
        failureThreshold: 1,
        successThreshold: 2,
        recoveryTimeoutMs: 100,
      });

      await expect(cb.call(() => Promise.reject(new Error("fail")))).rejects.toThrow("fail");
      vi.advanceTimersByTime(101);
      await cb.call(() => Promise.resolve("ok"));

      const metrics = cb.getMetrics();
      expect(metrics.recentTrips).toHaveLength(1);
      expect(metrics.recentTrips[0].recoveredAt).toBeNull();
      expect(cb.getState()).toBe("HALF_OPEN");
    });
  });

  describe("getOptions", () => {
    it("returns a copy of the configured options", () => {
      const opts = {
        failureThreshold: 7,
        successThreshold: 3,
        recoveryTimeoutMs: 60_000,
      };
      const cb = new CircuitBreaker(opts);
      const got = cb.getOptions();
      expect(got).toEqual(opts);
      got.failureThreshold = 999;
      expect(cb.getOptions().failureThreshold).toBe(7);
    });

    it("includes successThreshold in getMetrics options", () => {
      const cb = new CircuitBreaker({
        failureThreshold: 1,
        successThreshold: 5,
        recoveryTimeoutMs: 1000,
      });
      expect(cb.getMetrics().options.successThreshold).toBe(5);
    });
  });

  describe("processLocal flag", () => {
    it("sets processLocal: true in metrics to acknowledge in-memory scope", () => {
      const cb = new CircuitBreaker();
      expect(cb.getMetrics().processLocal).toBe(true);
    });
  });
});
