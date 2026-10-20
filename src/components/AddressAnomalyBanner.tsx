import { AlertTriangle } from "lucide-react";
import type { AnomalyStatus } from "@/lib/address-anomaly";

interface AddressAnomalyBannerProps {
  status?: AnomalyStatus;
}

export function AddressAnomalyBanner({ status }: AddressAnomalyBannerProps) {
  if (!status?.isAnomaly) return null;

  return (
    <div
      className="mb-6 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900 shadow-sm dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-200"
      role="alert"
      data-testid="address-anomaly-banner"
    >
      <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="flex-1 text-sm">
        <h4 className="font-semibold text-amber-950 dark:text-amber-100">
          Security Alert: High Volume of Wallet Address Changes Detected
        </h4>
        <p className="mt-1 text-amber-800 dark:text-amber-200">
          Detected <span className="font-bold">{status.count} address changes</span> within the last{" "}
          <span className="font-bold">{status.windowMinutes} minutes</span> (threshold: {status.threshold}). Please review maintainer audit logs and session activity to ensure maintainer accounts have not been compromised.
        </p>
      </div>
    </div>
  );
}
