import { describe, expect, it } from "vitest";

import {
  generateOpenAPISpec,
  validateOpenAPISpec,
  type OpenAPISpec,
} from "@/lib/openapi-spec";

/** Paths that MUST be present in the spec to avoid spec-drift. */
const REQUIRED_PATHS = [
  "/api/register",
  "/api/check",
  "/api/contributors",
  "/api/stats",
  "/api/actions/lookup",
  "/api/webhooks/trustbridge-action",
];

describe("OpenAPI Spec Generation", () => {
  describe("generateOpenAPISpec", () => {
    it("generates valid OpenAPI 3.0.0 spec", () => {
      const spec = generateOpenAPISpec();

      expect(spec.openapi).toBe("3.0.0");
      expect(spec.info).toBeDefined();
      expect(spec.paths).toBeDefined();
      expect(spec.servers).toBeDefined();
    });

    it("includes required info fields", () => {
      const spec = generateOpenAPISpec();

      expect(spec.info.title).toBe("TrustBridge Dashboard API");
      expect(spec.info.version).toBe("1.0.0");
      expect(spec.info.description).toBeDefined();
      expect(spec.info.contact).toBeDefined();
    });

    it("includes all required API endpoints", () => {
      const spec = generateOpenAPISpec();

      expect(spec.paths["/api/register"]).toBeDefined();
      expect(spec.paths["/api/check"]).toBeDefined();
      expect(spec.paths["/api/contributors"]).toBeDefined();
      expect(spec.paths["/api/stats"]).toBeDefined();
    });

    it("documents GET /api/register endpoint", () => {
      const spec = generateOpenAPISpec();
      const registerPath = spec.paths["/api/register"];

      expect(registerPath.get).toBeDefined();
      expect(registerPath.get.summary).toContain("Get");
      expect(registerPath.get.tags).toContain("Registration");
      expect(registerPath.get.responses["200"]).toBeDefined();
      expect(registerPath.get.responses["401"]).toBeDefined();
      expect(registerPath.get.responses["404"]).toBeDefined();
    });

    it("documents POST /api/register endpoint", () => {
      const spec = generateOpenAPISpec();
      const registerPath = spec.paths["/api/register"];

      expect(registerPath.post).toBeDefined();
      expect(registerPath.post.summary).toContain("Create or update");
      expect(registerPath.post.requestBody).toBeDefined();
      expect(registerPath.post.responses["200"]).toBeDefined();
      expect(registerPath.post.responses["401"]).toBeDefined();
    });

    it("documents POST /api/check endpoint for validation", () => {
      const spec = generateOpenAPISpec();
      const checkPath = spec.paths["/api/check"];

      expect(checkPath.post).toBeDefined();
      expect(checkPath.post.summary).toContain("Validate");
      expect(checkPath.post.requestBody).toBeDefined();
      expect(checkPath.post.responses["200"]).toBeDefined();
      expect(checkPath.post.responses["429"]).toBeDefined();
    });

    it("documents GET /api/contributors with pagination parameters", () => {
      const spec = generateOpenAPISpec();
      const contributorsPath = spec.paths["/api/contributors"];

      expect(contributorsPath.get).toBeDefined();
      expect(contributorsPath.get.parameters).toBeDefined();

      const params = contributorsPath.get.parameters as any[];
      const cursorParam = params.find((p) => p.name === "cursor");
      const limitParam = params.find((p) => p.name === "limit");

      expect(cursorParam).toBeDefined();
      expect(limitParam).toBeDefined();
      expect(limitParam.schema.maximum).toBe(100);
      expect(limitParam.schema.default).toBe(50);
    });

    it("documents POST /api/contributors for batch operations", () => {
      const spec = generateOpenAPISpec();
      const contributorsPath = spec.paths["/api/contributors"];

      expect(contributorsPath.post).toBeDefined();
      expect(contributorsPath.post.summary).toContain("Batch");
    });

    it("documents GET /api/stats endpoint", () => {
      const spec = generateOpenAPISpec();
      const statsPath = spec.paths["/api/stats"];

      expect(statsPath.get).toBeDefined();
      expect(statsPath.get.summary).toContain("statistics");
      expect(statsPath.get.responses["200"]).toBeDefined();
    });

    it("documents GET /api/actions/lookup endpoint", () => {
      const spec = generateOpenAPISpec();
      const lookupPath = spec.paths["/api/actions/lookup"];

      expect(lookupPath).toBeDefined();
      expect(lookupPath.get).toBeDefined();
      expect(lookupPath.get.summary).toContain("lookup");
      expect(lookupPath.get.tags).toContain("Actions");

      const params = lookupPath.get.parameters as any[];
      const addressParam = params.find((p) => p.name === "address");
      expect(addressParam).toBeDefined();
      expect(addressParam.required).toBe(true);

      expect(lookupPath.get.responses["200"]).toBeDefined();
      expect(lookupPath.get.responses["400"]).toBeDefined();
      expect(lookupPath.get.responses["429"]).toBeDefined();
    });

    it("documents POST /api/webhooks/trustbridge-action endpoint", () => {
      const spec = generateOpenAPISpec();
      const webhookPath = spec.paths["/api/webhooks/trustbridge-action"];

      expect(webhookPath.post).toBeDefined();
      expect(webhookPath.post.summary).toContain("webhook");
      expect(webhookPath.post.requestBody).toBeDefined();
      expect(webhookPath.post.responses["202"]).toBeDefined();
      expect(webhookPath.post.responses["401"]).toBeDefined();
      expect(webhookPath.post.responses["400"]).toBeDefined();
    });

    it("includes component schemas for all entity types", () => {
      const spec = generateOpenAPISpec();

      expect(spec.components).toBeDefined();
      expect(spec.components!.schemas).toBeDefined();
      expect(spec.components!.schemas!.Registration).toBeDefined();
      expect(spec.components!.schemas!.CheckRequest).toBeDefined();
      expect(spec.components!.schemas!.CheckResult).toBeDefined();
      expect(spec.components!.schemas!.ContributorList).toBeDefined();
      expect(spec.components!.schemas!.DashboardStats).toBeDefined();
      expect(spec.components!.schemas!.WebhookPayload).toBeDefined();
      expect(spec.components!.schemas!.ActionLookupResult).toBeDefined();
    });

    it("defines security schemes", () => {
      const spec = generateOpenAPISpec();

      expect(spec.components).toBeDefined();
      expect(spec.components!.securitySchemes).toBeDefined();
      expect(spec.components!.securitySchemes!.bearerAuth).toBeDefined();
    });

    it("uses custom server URL when provided", () => {
      const customUrl = "https://api.trustbridge.example.com";
      const spec = generateOpenAPISpec(customUrl);

      expect(spec.servers[0].url).toBe(customUrl);
    });

    it("uses default server URL when not provided", () => {
      const spec = generateOpenAPISpec();

      expect(spec.servers[0].url).toBe("http://localhost:3000");
    });

    // ── Spec-drift guard ────────────────────────────────────────────────
    it("includes all REQUIRED_PATHS (spec-drift guard)", () => {
      const spec = generateOpenAPISpec();

      for (const path of REQUIRED_PATHS) {
        expect(spec.paths[path]).toBeDefined();
      }
    });

    it("every documented path has at least one operation", () => {
      const spec = generateOpenAPISpec();

      for (const [path, methods] of Object.entries(spec.paths)) {
        const ops = Object.keys(methods).filter((m) =>
          ["get", "post", "put", "patch", "delete"].includes(m)
        );
        expect(ops.length).toBeGreaterThan(0);
      }
    });
  });

  describe("validateOpenAPISpec", () => {
    it("validates a correctly generated spec (success path)", () => {
      const spec = generateOpenAPISpec();
      const result = validateOpenAPISpec(spec);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("detects missing openapi version (failure path)", () => {
      const spec = generateOpenAPISpec();
      const invalidSpec = { ...spec, openapi: "" };

      const result = validateOpenAPISpec(invalidSpec as OpenAPISpec);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("openapi"))).toBe(true);
    });

    it("detects missing info object", () => {
      const spec = generateOpenAPISpec();
      const invalidSpec = { ...spec, info: undefined };

      const result = validateOpenAPISpec(invalidSpec as any);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("info"))).toBe(true);
    });

    it("detects missing info.title", () => {
      const spec = generateOpenAPISpec();
      const invalidSpec = { ...spec, info: { ...spec.info, title: "" } };

      const result = validateOpenAPISpec(invalidSpec as OpenAPISpec);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("title"))).toBe(true);
    });

    it("detects missing servers", () => {
      const spec = generateOpenAPISpec();
      const invalidSpec = { ...spec, servers: [] };

      const result = validateOpenAPISpec(invalidSpec as OpenAPISpec);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("servers"))).toBe(true);
    });

    it("detects missing paths", () => {
      const spec = generateOpenAPISpec();
      const invalidSpec = { ...spec, paths: {} };

      const result = validateOpenAPISpec(invalidSpec as OpenAPISpec);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("paths"))).toBe(true);
    });
  });
});
