import { Badge } from "@/components/ui/badge";
import type { HealthStatus } from "@/lib/health";
import { StatusIcon } from "./StatusIcon";

const variants: Record<HealthStatus, string> = {
  ok: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  degraded: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  error: "bg-destructive/15 text-destructive border-destructive/30",
};

const labels: Record<HealthStatus, string> = {
  ok: "Operational",
  degraded: "Degraded",
  error: "Outage",
};

export function StatusBadge({ status }: { status: HealthStatus }) {
  return (
    <Badge className={`gap-1.5 ${variants[status]}`}>
      <StatusIcon status={status} />
      {labels[status]}
    </Badge>
  );
}
