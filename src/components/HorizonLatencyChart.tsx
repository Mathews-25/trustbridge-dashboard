import { Activity } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { HorizonLatencyStats } from "@/lib/stats";

interface HorizonLatencyChartProps {
  stats?: HorizonLatencyStats;
}

export function HorizonLatencyChart({ stats }: HorizonLatencyChartProps) {
  const sampleCount = stats?.sampleCount ?? 0;

  return (
    <Card className="mb-6" data-testid="horizon-latency-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" aria-hidden />
          Horizon API Latency
        </CardTitle>
        <CardDescription>
          Aggregated response latency (ms) for Stellar Horizon address checks across{" "}
          {sampleCount} registrations.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {sampleCount === 0 ? (
          <div
            className="rounded-lg border border-border-strong bg-muted/20 p-6 text-center text-sm text-muted-foreground"
            data-testid="horizon-latency-empty"
          >
            No Horizon latency data recorded yet. Latency will be aggregated as contributors recheck their Stellar address readiness.
          </div>
        ) : (
          <>
            {/* Screen-reader summary — invisible but announced before the metric grid */}
            <p className="sr-only" data-testid="horizon-latency-sr-summary">
              Horizon API latency summary based on {sampleCount} samples:
              average {stats?.averageMs} ms,
              median (p50) {stats?.p50Ms} ms,
              95th percentile (p95) {stats?.p95Ms} ms.
            </p>

            <dl
              className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4 sm:gap-4"
              data-testid="horizon-latency-metrics"
              aria-label="Horizon API latency statistics"
            >
              <div className="min-h-11 rounded-lg border border-sky-300 bg-sky-50 px-4 py-4 dark:border-sky-600 dark:bg-sky-950/40">
                <dd className="text-2xl font-bold text-sky-700 dark:text-sky-300">
                  {stats?.averageMs}ms
                </dd>
                <dt className="mt-1 text-xs text-sky-700 dark:text-sky-200">
                  Average Latency
                </dt>
              </div>

              <div className="min-h-11 rounded-lg border border-indigo-300 bg-indigo-50 px-4 py-4 dark:border-indigo-600 dark:bg-indigo-950/40">
                <dd className="text-2xl font-bold text-indigo-700 dark:text-indigo-300">
                  {stats?.p50Ms}ms
                </dd>
                <dt className="mt-1 text-xs text-indigo-700 dark:text-indigo-200">
                  p50 (Median)
                </dt>
              </div>

              <div className="min-h-11 rounded-lg border border-purple-300 bg-purple-50 px-4 py-4 dark:border-purple-600 dark:bg-purple-950/40">
                <dd className="text-2xl font-bold text-purple-700 dark:text-purple-300">
                  {stats?.p95Ms}ms
                </dd>
                <dt className="mt-1 text-xs text-purple-700 dark:text-purple-200">
                  p95 Latency
                </dt>
              </div>

              <div className="min-h-11 rounded-lg border border-slate-300 bg-slate-50 px-4 py-4 dark:border-slate-600 dark:bg-slate-900/40">
                <dd className="text-2xl font-bold text-slate-700 dark:text-slate-300">
                  {sampleCount}
                </dd>
                <dt className="mt-1 text-xs text-slate-700 dark:text-slate-200">
                  Samples
                </dt>
              </div>
            </dl>
          </>
        )}
      </CardContent>
    </Card>
  );
}
