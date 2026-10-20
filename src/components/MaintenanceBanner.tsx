import { AlertTriangle } from "lucide-react";

/**
 * Site-wide maintenance banner (issue #202).
 *
 * Pure/sync component — the layout resolves whether maintenance mode is on
 * (via the `MAINTENANCE` env var or the `maintenance_mode` feature flag) and
 * passes the result in. While maintenance mode is on, reads keep working but
 * mutating API requests get a 503 from the middleware.
 */
export function MaintenanceBanner({
  enabled,
  message,
}: {
  enabled: boolean;
  message: string;
}) {
  if (!enabled) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="maintenance-banner"
      className="flex items-center justify-center gap-2 border-b border-amber-300 bg-amber-100 px-4 py-2 text-center text-sm font-medium text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
    >
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}
