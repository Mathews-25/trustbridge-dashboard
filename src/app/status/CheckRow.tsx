import type { HealthStatus } from "@/lib/health";
import { StatusBadge } from "./StatusBadge";

interface CheckRowProps {
  label: string;
  status: HealthStatus;
  detail?: string;
  latencyMs?: number;
}

export function CheckRow({ label, status, detail, latencyMs }: CheckRowProps) {
  return (
    <div className="flex items-center justify-between py-3 border-b last:border-0">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {detail && (
          <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
        )}
      </div>
      <div className="flex items-center gap-3">
        {latencyMs !== undefined && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {latencyMs} ms
          </span>
        )}
        <StatusBadge status={status} />
      </div>
    </div>
  );
}
