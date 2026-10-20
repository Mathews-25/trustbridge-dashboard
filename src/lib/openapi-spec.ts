import "server-only";

/**
 * OpenAPI 3.0.0 schema object
 */
export interface OpenAPISpec {
  openapi: string;
  info: {
    title: string;
    version: string;
    description?: string;
    contact?: {
      name: string;
      url: string;
    };
  };
  servers: Array<{
    url: string;
    description: string;
  }>;
  paths: Record<string, Record<string, unknown>>;
  components?: {
    schemas?: Record<string, unknown>;
    securitySchemes?: Record<string, unknown>;
  };
}

/**
 * Generates the OpenAPI 3.0.0 specification for TrustBridge Dashboard
 */
export function generateOpenAPISpec(
  apiUrl: string = "http://localhost:3000"
): OpenAPISpec {
  return {
    openapi: "3.0.0",
    info: {
      title: "TrustBridge Dashboard API",
      version: "1.0.0",
      description:
        "API for managing Stellar address registrations and payout readiness validation",
      contact: {
        name: "TrustBridge",
        url: "https://github.com/Stellar-TrustBridge/trustbridge-dashboard",
      },
    },
    servers: [
      {
        url: apiUrl,
        description: "TrustBridge Dashboard API",
      },
    ],
    paths: {
      "/api/register": {
        get: {
          operationId: "getRegistration",
          summary: "Get contributor registration",
          tags: ["Registration"],
          security: [{ bearerAuth: [] }],
          responses: {
            "200": {
              description: "Registration found",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/Registration",
                  },
                },
              },
            },
            "401": {
              description: "Not authenticated",
            },
            "404": {
              description: "Registration not found",
            },
          },
        },
        post: {
          operationId: "updateRegistration",
          summary: "Create or update contributor registration",
          tags: ["Registration"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/RegistrationInput",
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Registration updated",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/Registration",
                  },
                },
              },
            },
            "400": {
              description: "Invalid request",
            },
            "401": {
              description: "Not authenticated",
            },
          },
        },
      },
      "/api/check": {
        post: {
          operationId: "checkAddress",
          summary: "Validate Stellar address via Horizon",
          tags: ["Validation"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/CheckRequest",
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Address check result",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/CheckResult",
                  },
                },
              },
            },
            "400": {
              description: "Invalid address",
            },
            "429": {
              description: "Rate limit exceeded",
            },
          },
        },
      },
      "/api/contributors": {
        get: {
          operationId: "listContributors",
          summary: "List all contributors with readiness status",
          tags: ["Contributors"],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "cursor",
              in: "query",
              schema: { type: "string" },
              description: "Pagination cursor (base64-encoded ID)",
            },
            {
              name: "limit",
              in: "query",
              schema: { type: "integer", minimum: 1, maximum: 100, default: 50 },
              description: "Number of results per page",
            },
          ],
          responses: {
            "200": {
              description: "List of contributors",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ContributorList",
                  },
                },
              },
            },
            "401": {
              description: "Not authenticated or not a maintainer",
            },
          },
        },
        post: {
          operationId: "recheckAllContributors",
          summary: "Batch re-check all contributors via Horizon",
          tags: ["Contributors"],
          security: [{ bearerAuth: [] }],
          responses: {
            "200": {
              description: "Batch re-check initiated",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      checked: { type: "integer" },
                    },
                  },
                },
              },
            },
            "401": {
              description: "Not authenticated or not a maintainer",
            },
          },
        },
      },
      "/api/stats": {
        get: {
          operationId: "getStats",
          summary: "Get aggregate readiness statistics",
          tags: ["Stats"],
          responses: {
            "200": {
              description: "Dashboard statistics",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/DashboardStats",
                  },
                },
              },
            },
          },
        },
      },
      "/api/actions/lookup": {
        get: {
          operationId: "lookupAction",
          summary: "Public action lookup for a Stellar address",
          tags: ["Actions"],
          parameters: [
            {
              name: "address",
              in: "query",
              required: true,
              schema: { type: "string" },
              description: "Stellar public key (G-address)",
            },
            {
              name: "asset_code",
              in: "query",
              schema: { type: "string", default: "USDC" },
              description: "Asset code for trustline check",
            },
            {
              name: "asset_issuer",
              in: "query",
              schema: { type: "string" },
              description: "Asset issuer public key",
            },
          ],
          responses: {
            "200": {
              description: "Action lookup result with next-action hint",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ActionLookupResult",
                  },
                },
              },
            },
            "400": {
              description: "Invalid or missing address parameter",
            },
            "429": {
              description: "Rate limit exceeded",
            },
          },
        },
      },
      "/api/webhooks/trustbridge-action": {
        post: {
          operationId: "trustbridgeActionWebhook",
          summary: "Receive trustbridge-action validation webhook",
          tags: ["Webhooks"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/WebhookPayload",
                },
              },
            },
          },
          responses: {
            "202": {
              description: "Webhook accepted for processing",
            },
            "400": {
              description: "Unsupported schema version or event type",
            },
            "401": {
              description: "Invalid signature or unauthorized request",
            },
          },
        },
      },
      "/api/maintainer/ban": {
        post: {
          operationId: "manageContributorBan",
          summary: "Ban or unban a contributor by GitHub username",
          tags: ["Maintainer"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/BanRequest",
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Contributor ban status updated successfully",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/BanResponse",
                  },
                },
              },
            },
            "400": {
              description: "Invalid request (missing githubUsername, invalid action, or missing reason for ban)",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse",
                  },
                },
              },
            },
            "403": {
              description: "Forbidden. Maintainer access required.",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse",
                  },
                },
              },
            },
            "500": {
              description: "Internal server error executing ban action",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse",
                  },
                },
              },
            },
          },
        },
      },
      "/api/registrations/{id}/restore": {
        post: {
          operationId: "restoreRegistration",
          summary: "Restore a soft-deleted contributor registration",
          tags: ["Registration", "Maintainer"],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
              description: "ID of the soft-deleted registration to restore",
            },
          ],
          responses: {
            "200": {
              description: "Registration restored successfully",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/RestoreRegistrationResponse",
                  },
                },
              },
            },
            "403": {
              description: "Forbidden. Maintainer session required.",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse",
                  },
                },
              },
            },
            "404": {
              description: "Deleted registration not found",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse",
                  },
                },
              },
            },
            "409": {
              description: "Conflict. Stellar address is already actively registered.",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse",
                  },
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        BanRequest: {
          type: "object",
          required: ["githubUsername"],
          properties: {
            action: {
              type: "string",
              enum: ["ban", "unban"],
              default: "ban",
              description: "Action to perform: ban or unban",
            },
            githubUsername: {
              type: "string",
              description: "GitHub handle of the contributor",
            },
            reason: {
              type: "string",
              description: "Mandatory reason for ban; optional for unban",
            },
          },
        },
        BanResponse: {
          type: "object",
          required: ["success", "message", "details"],
          properties: {
            success: { type: "boolean" },
            message: { type: "string" },
            details: {
              type: "object",
              required: ["githubUsername", "banned"],
              properties: {
                githubUsername: { type: "string" },
                banned: { type: "boolean" },
                bannedAt: { type: "string", format: "date-time", nullable: true },
                bannedReason: { type: "string", nullable: true },
                bannedBy: { type: "string", nullable: true },
              },
            },
          },
        },
        RestoreRegistrationResponse: {
          type: "object",
          required: ["success", "registration"],
          properties: {
            success: { type: "boolean" },
            registration: {
              $ref: "#/components/schemas/Registration",
            },
          },
        },
        ErrorResponse: {
          type: "object",
          required: ["error"],
          properties: {
            error: { type: "string" },
          },
        },
        Registration: {
          type: "object",
          properties: {
            id: { type: "string" },
            githubUsername: { type: "string" },
            stellarAddress: { type: "string" },
            trustlineReady: { type: "boolean" },
            trustlineAuthorized: { type: "boolean" },
            funded: { type: "boolean" },
            xlmBalance: { type: "string" },
            spendableXlmBalance: { type: "string" },
            lastCheckedAt: { type: "string", format: "date-time" },
            readiness: {
              type: "string",
              enum: ["ready", "low_reserve", "not_ready"],
            },
          },
        },
        RegistrationInput: {
          type: "object",
          required: ["stellarAddress"],
          properties: {
            stellarAddress: { type: "string" },
          },
        },
        CheckRequest: {
          type: "object",
          required: ["address"],
          properties: {
            address: { type: "string" },
            asset_code: { type: "string" },
            asset_issuer: { type: "string" },
          },
        },
        CheckResult: {
          type: "object",
          properties: {
            funded: { type: "boolean" },
            trustline: { type: "boolean" },
            trustline_authorized: { type: "boolean" },
            xlm_balance: { type: "string" },
            spendable_xlm_balance: { type: "string" },
            errors: {
              type: "array",
              items: { type: "string" },
            },
          },
        },
        ContributorList: {
          type: "object",
          properties: {
            data: {
              type: "array",
              items: { $ref: "#/components/schemas/Registration" },
            },
            nextCursor: { type: "string", nullable: true },
            hasMore: { type: "boolean" },
          },
        },
        DashboardStats: {
          type: "object",
          properties: {
            total: { type: "integer" },
            ready: { type: "integer" },
            lowReserve: { type: "integer" },
          },
        },
        ActionLookupResult: {
          type: "object",
          properties: {
            address: { type: "string" },
            funded: { type: "boolean" },
            trustline: { type: "boolean" },
            trustline_authorized: { type: "boolean" },
            xlm_balance: { type: "string" },
            spendable_xlm_balance: { type: "string" },
            readiness: {
              type: "string",
              enum: ["ready", "low_reserve", "not_ready"],
            },
            nextAction: {
              type: "string",
              enum: ["fund_account", "add_trustline", "increase_reserve", "none"],
              description: "Recommended next action for the contributor",
            },
          },
        },
        WebhookPayload: {
          type: "object",
          required: [
            "schema_version",
            "event",
            "timestamp",
            "repository",
            "issue_number",
            "stellar_address",
            "result",
          ],
          properties: {
            schema_version: { type: "string", example: "1" },
            event: { type: "string", example: "validation_complete" },
            timestamp: { type: "string", format: "date-time" },
            repository: { type: "string", example: "owner/repo" },
            issue_number: { type: "integer", nullable: true },
            stellar_address: { type: "string", example: "GBX7...4Y5Z" },
            result: {
              type: "object",
              required: [
                "valid",
                "account_funded",
                "trustline_exists",
                "xlm_balance",
                "checks",
              ],
              properties: {
                valid: { type: "boolean" },
                account_funded: { type: "boolean" },
                trustline_exists: { type: "boolean" },
                xlm_balance: { type: "string" },
                checks: {
                  type: "array",
                  items: {
                    type: "object",
                    required: ["label", "passed"],
                    properties: {
                      label: { type: "string" },
                      passed: { type: "boolean" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
  };
}

/**
 * Validates the generated OpenAPI spec
 */
export function validateOpenAPISpec(spec: OpenAPISpec): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Check required top-level fields
  if (!spec.openapi) errors.push("Missing openapi version");
  if (!spec.info) errors.push("Missing info object");
  if (!spec.paths) errors.push("Missing paths object");

  // Check info object
  if (spec.info) {
    if (!spec.info.title) errors.push("Missing info.title");
    if (!spec.info.version) errors.push("Missing info.version");
  }

  // Check servers
  if (!spec.servers || spec.servers.length === 0) {
    errors.push("No servers defined");
  }

  // Check paths
  if (spec.paths && Object.keys(spec.paths).length === 0) {
    errors.push("No API paths defined");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
