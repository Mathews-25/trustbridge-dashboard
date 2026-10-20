/**
 * Next.js instrumentation hook (issue #203).
 *
 * Runs once per server process. Tracing is OFF unless `OTEL_TRACES_ENABLED`
 * (or the `otel_traces` flag) is set, so this is a no-op in the default
 * configuration and in tests.
 *
 * When an OpenTelemetry SDK / `@opentelemetry/api` is present the standard
 * `OTEL_*` collector env vars are honoured by that SDK; this hook only records
 * that tracing is active. Serverless flushing is the SDK's responsibility —
 * see docs/ENVIRONMENT.md.
 */
export async function register(): Promise<void> {
  const { isTracingEnabled } = await import("@/lib/tracing");
  if (!isTracingEnabled()) return;

  if (process.env.NEXT_RUNTIME === "nodejs") {
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "info",
        context: "instrumentation",
        message: "tracing_enabled",
        details: {
          service: process.env.OTEL_SERVICE_NAME || "trustbridge-dashboard",
          exporter: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "log-spans",
        },
      }),
    );
  }
}
