import type { JobProgressEvent } from "@/lib/use-job-progress";

interface BatchRecheckLiveRegionProps {
  event: JobProgressEvent | null;
  isStarting: boolean;
  isStreaming: boolean;
  /**
   * The single failure message to announce.
   *
   * The caller is responsible for the precedence: a current stream-disconnect
   * message (`useJobProgress().error`) must be passed here ahead of a stale
   * batch mutation error, so a reconnect that is about to fail is not announced
   * as "failed" and then immediately as "reconnecting".
   */
  error: string | null;
  /** True while the SSE connection is being re-established. */
  isReconnecting?: boolean;
  /** Current reconnect attempt, for the announcement copy. */
  reconnectAttempt?: number;
  /** Reconnect budget configured on the hook. */
  maxReconnectAttempts?: number;
}

export function BatchRecheckLiveRegion({
  event,
  isStarting,
  isStreaming,
  error,
  isReconnecting = false,
  reconnectAttempt = 0,
  maxReconnectAttempts = 0,
}: BatchRecheckLiveRegionProps) {
  let announcement = "";

  if (isReconnecting) {
    // Reconnection outranks `error`: `useJobProgress` keeps the previous error
    // around while it retries, and announcing a failure that is still being
    // retried tells the user the run is over when it is not.
    announcement = `Batch re-check: Reconnecting (${reconnectAttempt}/${maxReconnectAttempts})...`;
  } else if (error) {
    announcement = `Batch re-check failed: ${error}`;
  } else if (event?.type === "completed") {
    const refreshed = event.result?.refreshed;
    announcement =
      typeof refreshed === "number"
        ? `Batch re-check completed. ${refreshed} contributors refreshed.`
        : "Batch re-check completed.";
  } else if (event?.type === "failed" || event?.type === "error") {
    announcement = `Batch re-check failed: ${event.error ?? event.message ?? "Unknown error"}`;
  } else if (event?.type === "processing") {
    announcement = "Batch re-check in progress.";
  } else if (event?.status === "pending") {
    announcement = "Batch re-check queued.";
  } else if (isStarting) {
    announcement = "Starting batch re-check.";
  } else if (isStreaming) {
    announcement = "Waiting for batch re-check progress.";
  }

  return (
    <p
      className="sr-only"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-testid="recheck-live-region"
    >
      {announcement}
    </p>
  );
}
