import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { validateEnv } from "@/lib/env-validation";

describe("env-validation", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Save original env
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original env
    process.env = originalEnv;
  });

  describe("validateEnv - required fields", () => {
    it("validates a complete valid configuration", () => {
      process.env = {
        GITHUB_CLIENT_ID: "test-id",
        GITHUB_CLIENT_SECRET: "test-secret",
        NEXTAUTH_URL: "http://localhost:3000",
        NEXTAUTH_SECRET: "test-secret-123",
        TOKEN_ENCRYPTION_KEY: "test-key-123",
        GITHUB_MAINTAINER_ORG: "test-org",
        DATABASE_URL: "postgresql://localhost/test",
        NEXT_PUBLIC_HORIZON_URL: "https://horizon.stellar.org",
        NEXT_PUBLIC_DEFAULT_ASSET_CODE: "USDC",
        NEXT_PUBLIC_DEFAULT_ASSET_ISSUER:
          "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
      };

      const env = validateEnv();
      expect(env.GITHUB_CLIENT_ID).toBe("test-id");
      expect(env.GITHUB_MAINTAINER_ORG).toBe("test-org");
      expect(env.DATABASE_URL).toBe("postgresql://localhost/test");
    });

    it("fails when GITHUB_CLIENT_ID is missing", () => {
      process.env = {
        GITHUB_CLIENT_SECRET: "secret",
        NEXTAUTH_URL: "http://localhost:3000",
        NEXTAUTH_SECRET: "secret",
        TOKEN_ENCRYPTION_KEY: "key",
        GITHUB_MAINTAINER_ORG: "org",
        DATABASE_URL: "postgresql://localhost/test",
      };

      expect(() => validateEnv()).toThrow("Environment validation failed");
    });

    it("fails when DATABASE_URL is invalid", () => {
      process.env = {
        GITHUB_CLIENT_ID: "test-id",
        GITHUB_CLIENT_SECRET: "test-secret",
        NEXTAUTH_URL: "http://localhost:3000",
        NEXTAUTH_SECRET: "test-secret",
        TOKEN_ENCRYPTION_KEY: "test-key",
        GITHUB_MAINTAINER_ORG: "test-org",
        DATABASE_URL: "not-a-url",
      };

      expect(() => validateEnv()).toThrow("Environment validation failed");
    });
  });

  describe("validateEnv - numeric parsing", () => {
    it("parses numeric env vars as numbers", () => {
      process.env = {
        GITHUB_CLIENT_ID: "test-id",
        GITHUB_CLIENT_SECRET: "test-secret",
        NEXTAUTH_URL: "http://localhost:3000",
        NEXTAUTH_SECRET: "test-secret",
        TOKEN_ENCRYPTION_KEY: "test-key",
        GITHUB_MAINTAINER_ORG: "test-org",
        DATABASE_URL: "postgresql://localhost/test",
        RATE_LIMIT_MAX_REQUESTS: "20",
        RATE_LIMIT_WINDOW_MS: "120000",
        NEXT_PUBLIC_MIN_XLM_BALANCE: "2.5",
        HORIZON_CB_FAILURE_THRESHOLD: "10",
      };

      const env = validateEnv();
      expect(env.RATE_LIMIT_MAX_REQUESTS).toBe(20);
      expect(typeof env.RATE_LIMIT_MAX_REQUESTS).toBe("number");
      expect(env.RATE_LIMIT_WINDOW_MS).toBe(120000);
      expect(env.NEXT_PUBLIC_MIN_XLM_BALANCE).toBe(2.5);
      expect(env.HORIZON_CB_FAILURE_THRESHOLD).toBe(10);
    });

    it("fails when numeric env var is invalid", () => {
      process.env = {
        GITHUB_CLIENT_ID: "test-id",
        GITHUB_CLIENT_SECRET: "test-secret",
        NEXTAUTH_URL: "http://localhost:3000",
        NEXTAUTH_SECRET: "test-secret",
        TOKEN_ENCRYPTION_KEY: "test-key",
        GITHUB_MAINTAINER_ORG: "test-org",
        DATABASE_URL: "postgresql://localhost/test",
        RATE_LIMIT_MAX_REQUESTS: "not-a-number",
      };

      expect(() => validateEnv()).toThrow("Environment validation failed");
    });

    it("fails when numeric value is negative", () => {
      process.env = {
        GITHUB_CLIENT_ID: "test-id",
        GITHUB_CLIENT_SECRET: "test-secret",
        NEXTAUTH_URL: "http://localhost:3000",
        NEXTAUTH_SECRET: "test-secret",
        TOKEN_ENCRYPTION_KEY: "test-key",
        GITHUB_MAINTAINER_ORG: "test-org",
        DATABASE_URL: "postgresql://localhost/test",
        NEXT_PUBLIC_MIN_XLM_BALANCE: "-1",
      };

      expect(() => validateEnv()).toThrow("Environment validation failed");
    });
  });

  describe("validateEnv - optional fields and defaults", () => {
    it("uses default values for optional fields", () => {
      process.env = {
        GITHUB_CLIENT_ID: "test-id",
        GITHUB_CLIENT_SECRET: "test-secret",
        NEXTAUTH_URL: "http://localhost:3000",
        NEXTAUTH_SECRET: "test-secret",
        TOKEN_ENCRYPTION_KEY: "test-key",
        GITHUB_MAINTAINER_ORG: "test-org",
        DATABASE_URL: "postgresql://localhost/test",
      };

      const env = validateEnv();
      expect(env.NEXT_PUBLIC_HORIZON_URL).toBe("https://horizon.stellar.org");
      expect(env.NEXT_PUBLIC_DEFAULT_ASSET_CODE).toBe("USDC");
      expect(env.RATE_LIMIT_MAX_REQUESTS).toBe(10);
      expect(env.HORIZON_CB_FAILURE_THRESHOLD).toBe(5);
    });

    it("allows optional fields to be omitted", () => {
      process.env = {
        GITHUB_CLIENT_ID: "test-id",
        GITHUB_CLIENT_SECRET: "test-secret",
        NEXTAUTH_URL: "http://localhost:3000",
        NEXTAUTH_SECRET: "test-secret",
        TOKEN_ENCRYPTION_KEY: "test-key",
        GITHUB_MAINTAINER_ORG: "test-org",
        DATABASE_URL: "postgresql://localhost/test",
      };

      const env = validateEnv();
      expect(env.SOROBAN_CONTRACT_ID).toBeUndefined();
      expect(env.GITHUB_WEBHOOK_SECRET).toBeUndefined();
      expect(env.GITHUB_MAINTAINER_TEAM).toBeUndefined();
    });
  });

  describe("validateEnv - URL validation", () => {
    it("validates NEXTAUTH_URL as a valid URL", () => {
      process.env = {
        GITHUB_CLIENT_ID: "test-id",
        GITHUB_CLIENT_SECRET: "test-secret",
        NEXTAUTH_URL: "not-a-url",
        NEXTAUTH_SECRET: "test-secret",
        TOKEN_ENCRYPTION_KEY: "test-key",
        GITHUB_MAINTAINER_ORG: "test-org",
        DATABASE_URL: "postgresql://localhost/test",
      };

      expect(() => validateEnv()).toThrow("NEXTAUTH_URL must be a valid URL");
    });

    it("accepts https URLs", () => {
      process.env = {
        GITHUB_CLIENT_ID: "test-id",
        GITHUB_CLIENT_SECRET: "test-secret",
        NEXTAUTH_URL: "https://example.com",
        NEXTAUTH_SECRET: "test-secret",
        TOKEN_ENCRYPTION_KEY: "test-key",
        GITHUB_MAINTAINER_ORG: "test-org",
        DATABASE_URL: "postgresql://localhost/test",
      };

      const env = validateEnv();
      expect(env.NEXTAUTH_URL).toBe("https://example.com");
    });
  });

  describe("error reporting", () => {
    it("includes helpful error messages for missing required fields", () => {
      process.env = {
        GITHUB_CLIENT_ID: "test-id",
        // Missing everything else
      };

      try {
        validateEnv();
        expect.fail("Should have thrown");
      } catch (error) {
        const message = (error as Error).message;
        expect(message).toContain("Environment validation failed");
        expect(message).toContain("GITHUB_CLIENT_SECRET");
        expect(message).toContain("NEXTAUTH_URL");
      }
    });
  });
});

  describe("validateEnv - DATABASE_URL pool and pgbouncer settings", () => {
    it("accepts DATABASE_URL with connection_limit and pool_timeout", () => {
      process.env = {
        GITHUB_CLIENT_ID: "test-id",
        GITHUB_CLIENT_SECRET: "test-secret",
        NEXTAUTH_URL: "http://localhost:3000",
        NEXTAUTH_SECRET: "test-secret",
        TOKEN_ENCRYPTION_KEY: "test-key",
        GITHUB_MAINTAINER_ORG: "test-org",
        DATABASE_URL: "postgresql://localhost/test?connection_limit=5&pool_timeout=10&pgbouncer=true&idle_in_transaction_session_timeout=30000",
      };

      const env = validateEnv();
      expect(env.DATABASE_URL).toContain("connection_limit=5");
      expect(env.DATABASE_URL).toContain("pgbouncer=true");
    });

    it("fails when connection_limit is invalid", () => {
      process.env = {
        GITHUB_CLIENT_ID: "test-id",
        GITHUB_CLIENT_SECRET: "test-secret",
        NEXTAUTH_URL: "http://localhost:3000",
        NEXTAUTH_SECRET: "test-secret",
        TOKEN_ENCRYPTION_KEY: "test-key",
        GITHUB_MAINTAINER_ORG: "test-org",
        DATABASE_URL: "postgresql://localhost/test?connection_limit=-1",
      };

      expect(() => validateEnv()).toThrow("Environment validation failed");
    });

    it("fails when pool_timeout is negative", () => {
      process.env = {
        GITHUB_CLIENT_ID: "test-id",
        GITHUB_CLIENT_SECRET: "test-secret",
        NEXTAUTH_URL: "http://localhost:3000",
        NEXTAUTH_SECRET: "test-secret",
        TOKEN_ENCRYPTION_KEY: "test-key",
        GITHUB_MAINTAINER_ORG: "test-org",
        DATABASE_URL: "postgresql://localhost/test?pool_timeout=-5",
      };

      expect(() => validateEnv()).toThrow("Environment validation failed");
    });
  });
