/**
 * Opt-in tracing for API routes, Prisma and Horizon (issue #203).
 *
 * Default OFF. Enabled by either:
 *   - `OTEL_TRACES_ENABLED` truthy, or
 *   - the `otel_traces` feature flag (env-only resolution, so the Edge runtime
 *     is never dragged in here)
 *
 * When enabled and `@opentelemetry/api` is installed, spans are emitted through
 * the real OTEL API (bridge to any OTLP collector via the standard SDK env
 * vars). Otherwise spans are emitted as structured `trace` logs so incident
 * responders can still see which hop is slow without standing up a collector —
 * and the test suite needs neither.
 *
 * PII rules:
 *   - span names are scrubbed of Stellar addresses / emails ("No addresses in
 *     span names")
 *   - span attributes are run through the Sentry redactor before they leave
 *     the process
 */

import { StructuredLogger } from "@/lib/logger";
import { redactValue } from "@/lib/sentry";

const TRUTHY = new Set(["1", "true", "on", "yes", "enabled"]);

function envEnabled(): boolean {
  const raw = process.env.OTEL_TRACES_ENABLED?.trim().toLowerCase();
  if (raw && TRUTHY.has(raw)) return true;
  // `otel_traces` flag, env-only resolution (no DB, no server-only import).
  const flag = process.env.FEATURE_FLAG_OTEL_TRACES?.trim().toLowerCase();
  return flag ? TRUTHY.has(flag) : false;
}

export function isTracingEnabled(): boolean {
  return envEnabled();
}

const STELLAR_KEY = /\b[GS][A-Z2-7]{55}\b/g;
const EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

/** Strip addresses / emails so they can never end up in a span name. */
export function sanitizeSpanName(name: string): string {
  return name
    .replace(STELLAR_KEY, "{address}")
    .replace(EMAIL, "{email}")
    .slice(0, 200);
}

export function redactSpanAttributes(
  attributes?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!attributes) return undefined;
  return redactValue(attributes, 0) as Record<string, unknown>;
}

const traceLogger = new StructuredLogger("trace");

/** Minimal structural view of the parts of the OTEL API we use. */
interface OtelSpan {
  setAttributes(attributes: Record<string, unknown>): void;
  setStatus(status: { code: number; message?: string }): void;
  end(): void;
}
interface OtelTracer {
  startActiveSpan<T>(
    name: string,
    fn: (span: OtelSpan) => Promise<T>,
  ): Promise<T>;
}
interface OtelApiModule {
  trace?: { getTracer?: (name: string) => OtelTracer };
  default?: OtelApiModule;
}

// Lazily resolve the optional OpenTelemetry API. The specifier is held in a
// variable so bundlers don't try to resolve a package that may not be
// installed; a missing module rejects and we fall back to log spans.
let otelTracerPromise: Promise<OtelTracer | null> | null = null;
function loadOtelTracer(): Promise<OtelTracer | null> {
  if (!otelTracerPromise) {
    const specifier = "@opentelemetry/api";
    otelTracerPromise = import(
      /* @vite-ignore */ /* webpackIgnore: true */ specifier
    )
      .then((mod: OtelApiModule) => {
        const api = mod?.trace ? mod : mod?.default;
        const getTracer = api?.trace?.getTracer;
        if (!getTracer) return null;
        return getTracer(
          process.env.OTEL_SERVICE_NAME || "trustbridge-dashboard",
        );
      })
      .catch(() => null);
  }
  return otelTracerPromise;
}

/** Test hook: forget the resolved OTEL tracer. */
export function resetTracingForTests(): void {
  otelTracerPromise = null;
}

export interface SpanOptions {
  attributes?: Record<string, unknown>;
}

/**
 * Run `fn` inside a span. A no-op passthrough when tracing is disabled, so it
 * is safe to wrap hot paths unconditionally.
 */
export async function withSpan<T>(
  name: string,
  fn: () => Promise<T> | T,
  options: SpanOptions = {},
): Promise<T> {
  if (!isTracingEnabled()) {
    return fn();
  }

  const spanName = sanitizeSpanName(name);
  const attributes = redactSpanAttributes(options.attributes);
  const start = Date.now();

  const otel = await loadOtelTracer();
  if (otel) {
    return otel.startActiveSpan(spanName, async (span) => {
      try {
        if (attributes) span.setAttributes(attributes);
        const result = await fn();
        span.setStatus({ code: 1 });
        return result;
      } catch (error) {
        span.setStatus({
          code: 2,
          message:
            error instanceof Error ? sanitizeSpanName(error.message) : "error",
        });
        throw error;
      } finally {
        span.end();
      }
    });
  }

  try {
    const result = await fn();
    traceLogger.debug("span", {
      name: spanName,
      durationMs: Date.now() - start,
      ok: true,
      attributes,
    });
    return result;
  } catch (error) {
    traceLogger.error("span_error", {
      name: spanName,
      durationMs: Date.now() - start,
      ok: false,
      error:
        error instanceof Error ? sanitizeSpanName(error.message) : "error",
      attributes,
    });
    throw error;
  }
}
