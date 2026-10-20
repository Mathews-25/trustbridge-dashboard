import { generateOpenAPISpec, validateOpenAPISpec } from "@/lib/openapi-spec";
import { publicOptionsResponse, withPublicCors } from "@/lib/public-cors";

/**
 * GET /api/openapi.json
 *
 * Returns the OpenAPI 3.0.0 specification for the TrustBridge Dashboard API.
 * Can be used with Swagger UI or other API documentation tools.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const baseUrl = `${url.protocol}//${url.host}`;

  const spec = generateOpenAPISpec(baseUrl);
  const validation = validateOpenAPISpec(spec);

  if (!validation.valid) {
    return withPublicCors(Response.json(
      {
        error: "OpenAPI spec generation failed",
        details: validation.errors,
      },
      { status: 500 }
    ));
  }

  return withPublicCors(Response.json(spec, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  }));
}

export function OPTIONS() {
  return publicOptionsResponse("GET, OPTIONS");
}
