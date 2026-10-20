"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import type { HealthResponse } from "@/lib/health";

import { CheckRow } from "./CheckRow";
import { StatusBadge } from "./StatusBadge";
import { StatusIcon } from "./StatusIcon";

interface StatusClientProps {
  initial: HealthResponse;
}

const overallLabels: Record<string, string> = {
  ok: "All systems operational",
  degraded: "Partial degradation",
  error: "Service disruption",
};

/**
 * Client shell for the status page (#309).
 * Receives the SSR-fetched health snapshot as `initial`, then lets operators
 * click "Check now" to re-fetch /api/health without waiting for the ISR
 * revalidate window. Loading and error states are announced via aria-live.
 */
export function StatusClient({ initial }: StatusClientProps) {
  const [health, setHealth] = useState<HealthResponse>(initial);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const refresh = () => {
    startTransition(async () => {
      setError(null);
      try {
        const res = await fetch("/api/health", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as HealthResponse;
        setHealth(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch status");
      }
    });
  };

  return (
    <>
      {/* Live region announces fetch results to screen readers */}
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {isPending
          ? "Checking service status…"
          : error
            ? `Status check failed: ${error}`
            : `Status updated at ${new Date(health.timestamp).toLocaleTimeString()}`}
      </p>

      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Service status</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Last updated:{" "}
            <time dateTime={health.timestamp}>
              {new Date(health.timestamp).toLocaleTimeString(undefined, {
                timeStyle: "medium",
              })}
            </time>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={health.status} />
          <button
            type="button"
            onClick={refresh}
            disabled={isPending}
            aria-label="Check service status now"
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`}
              aria-hidden
            />
            {isPending ? "Checking…" : "Check now"}
          </button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      {/* Overall banner */}
      <div className="mb-6 flex items-center gap-3 rounded-lg border bg-card px-4 py-4">
        <StatusIcon status={health.status} />
        <p className="font-medium">{overallLabels[health.status]}</p>
      </div>

      {/* Per-service checks */}
      <div className="rounded-lg border bg-card">
        <div className="px-6 pb-1 pt-4">
          <p className="text-base font-semibold">Components</p>
        </div>
        <div className="px-6 pb-4">
          <CheckRow
            label="Dashboard"
            status={health.checks.database.status === "error" ? "error" : "ok"}
            detail="Next.js application"
          />
          <CheckRow
            label="Database"
            status={health.checks.database.status}
            latencyMs={health.checks.database.latencyMs}
            detail={
              health.checks.database.status === "error"
                ? "Connection failed"
                : undefined
            }
          />
          <CheckRow
            label="Horizon (Stellar)"
            status={health.checks.horizon.status}
            latencyMs={health.checks.horizon.latencyMs}
            detail="Used for trustline and balance checks"
          />
          <CheckRow
            label="Soroban RPC"
            status={health.checks.sorobanRpc.status}
            latencyMs={health.checks.sorobanRpc.latencyMs}
            detail="Used for on-chain contract events"
          />
          <CheckRow
            label="Data freshness"
            status={health.checks.csvStaleness.status}
            detail={
              health.checks.csvStaleness.status === "degraded"
                ? health.checks.csvStaleness.warning || "Contributor data may be stale"
                : `${health.checks.csvStaleness.totalCount} contributors tracked`
            }
          />
        </div>
      </div>

      <p className="mt-6 flex items-center gap-1.5 text-xs text-muted-foreground">
        <RefreshCw className="h-3 w-3" aria-hidden />
        Auto-refreshes every 30 seconds · or use &ldquo;Check now&rdquo; above
      </p>
    </>
  );
}
