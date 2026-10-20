import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BatchRecheckLiveRegion } from "@/components/BatchRecheckLiveRegion";
import type { JobProgressEvent } from "@/lib/use-job-progress";

describe("BatchRecheckLiveRegion", () => {
  it("announces progress politely without repeating per-event details", () => {
    const { rerender } = render(
      <BatchRecheckLiveRegion
        event={{ type: "processing", startedAt: "2026-09-27T12:00:00Z" }}
        isStarting={false}
        isStreaming={true}
        error={null}
      />
    );

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveAttribute("aria-atomic", "true");
    expect(status).toHaveTextContent("Batch re-check in progress.");

    rerender(
      <BatchRecheckLiveRegion
        event={{ type: "processing", startedAt: "2026-09-27T12:00:01Z" }}
        isStarting={false}
        isStreaming={true}
        error={null}
      />
    );

    expect(status).toHaveTextContent("Batch re-check in progress.");
    expect(status).not.toHaveTextContent("%");
  });

  it.each([
    {
      event: {
        type: "completed",
        result: { refreshed: 12 },
      } as JobProgressEvent,
      expected: "Batch re-check completed. 12 contributors refreshed.",
    },
    {
      event: { type: "failed", error: "Queue unavailable" } as JobProgressEvent,
      expected: "Batch re-check failed: Queue unavailable",
    },
  ])("announces terminal event: $expected", ({ event, expected }) => {
    render(
      <BatchRecheckLiveRegion
        event={event}
        isStarting={false}
        isStreaming={false}
        error={null}
      />
    );

    expect(screen.getByRole("status")).toHaveTextContent(expected);
  });

  // #498 — the dashboard used to pass an undefined `error` identifier here, so
  // an SSE disconnect never reached the live region.
  it("announces a stream failure while not streaming", () => {
    render(
      <BatchRecheckLiveRegion
        event={null}
        isStarting={false}
        isStreaming={false}
        error="Connection lost. Failed to reconnect after 3 attempts."
      />
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Batch re-check failed: Connection lost. Failed to reconnect after 3 attempts."
    );
  });

  it("announces reconnection instead of a failure that is still being retried", () => {
    render(
      <BatchRecheckLiveRegion
        event={{ type: "processing", startedAt: "2026-09-27T12:00:00Z" }}
        isStarting={false}
        isStreaming={false}
        isReconnecting
        reconnectAttempt={2}
        maxReconnectAttempts={3}
        error="Connection lost. Failed to reconnect after 3 attempts."
      />
    );

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Batch re-check: Reconnecting (2/3)...");
    expect(status).not.toHaveTextContent("failed");
  });

  it("reports a completed run once reconnection succeeds", () => {
    const { rerender } = render(
      <BatchRecheckLiveRegion
        event={null}
        isStarting={false}
        isStreaming={false}
        isReconnecting
        reconnectAttempt={1}
        maxReconnectAttempts={3}
        error={null}
      />
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Batch re-check: Reconnecting (1/3)..."
    );

    rerender(
      <BatchRecheckLiveRegion
        event={{ type: "completed", result: { refreshed: 7 } }}
        isStarting={false}
        isStreaming={false}
        isReconnecting={false}
        reconnectAttempt={0}
        maxReconnectAttempts={3}
        error={null}
      />
    );

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(
      "Batch re-check completed. 7 contributors refreshed."
    );
    expect(status).not.toHaveTextContent("Reconnecting");
  });
});