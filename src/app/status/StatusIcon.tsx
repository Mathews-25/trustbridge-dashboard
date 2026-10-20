import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import type { HealthStatus } from "@/lib/health";

export function StatusIcon({ status }: { status: HealthStatus }) {
  if (status === "ok")
    return <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden />;
  if (status === "degraded")
    return <AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden />;
  return <XCircle className="h-4 w-4 text-destructive" aria-hidden />;
}
