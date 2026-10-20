"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface JobProgressEvent {
  type: "status" | "processing" | "completed" | "failed" | "error";
  jobId?: string;
  status?: string;
  result?: Record<string, unknown>;
  error?: string;
  startedAt?: string | null;
  completedAt?: string | null;
  message?: string;
  createdAt?: string | null;
}

export interface UseJobProgressOptions {
  /** Maximum number of reconnect attempts before failing (default: 3) */
  maxReconnectAttempts?: number;
  /** Initial backoff delay in ms before reconnecting (default: 1000) */
  reconnectDelayMs?: number;
}

export interface UseJobProgress {
  /** Currently connected job ID, or null */
  activeJobId: string | null;
  /** Latest progress event */
  event: JobProgressEvent | null;
  /** Whether the SSE connection or recovery is active */
  isStreaming: boolean;
  /** Whether SSE is currently disconnected and attempting recovery */
  isReconnecting: boolean;
  /** Current reconnection attempt count (0 when connected or idle) */
  reconnectAttempt: number;
  /** Maximum reconnection attempts configured */
  maxReconnectAttempts: number;
  /** Any connection or job error */
  error: string | null;
  /** Start streaming progress for a job */
  startProgress: (jobId: string) => void;
  /** Stop streaming and cancel any reconnection timers */
  stopProgress: () => void;
}

const DEFAULT_MAX_RECONNECT_ATTEMPTS = 3;
const DEFAULT_RECONNECT_DELAY_MS = 1000;

/**
 * Hook that consumes SSE progress events for a background queue job
 * with automatic disconnect detection and reconnect recovery.
 */
export function useJobProgress(options?: UseJobProgressOptions): UseJobProgress {
  const maxAttempts = options?.maxReconnectAttempts ?? DEFAULT_MAX_RECONNECT_ATTEMPTS;
  const baseDelay = options?.reconnectDelayMs ?? DEFAULT_RECONNECT_DELAY_MS;

  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [event, setEvent] = useState<JobProgressEvent | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptRef = useRef(0);
  const activeJobIdRef = useRef<string | null>(null);

  const stopProgress = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    reconnectAttemptRef.current = 0;
    activeJobIdRef.current = null;
    setIsStreaming(false);
    setIsReconnecting(false);
    setReconnectAttempt(0);
  }, []);

  const connect = useCallback(
    (jobId: string) => {
      if (typeof window === "undefined" || typeof EventSource === "undefined") {
        return;
      }

      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }

      const url = "/api/contributors/queue/progress?jobId=" + encodeURIComponent(jobId);
      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.onopen = () => {
        setIsReconnecting(false);
      };

      es.onmessage = (messageEvent) => {
        try {
          const data = JSON.parse(messageEvent.data) as JobProgressEvent;
          setEvent(data);
          setIsReconnecting(false);
          reconnectAttemptRef.current = 0;
          setReconnectAttempt(0);

          if (data.type === "completed" || data.type === "failed" || data.type === "error") {
            es.close();
            eventSourceRef.current = null;
            setIsStreaming(false);
            setIsReconnecting(false);
            if (data.type === "error") {
              setError(data.message ?? "Job error");
            }
          }
        } catch {
          // ignore malformed events
        }
      };

      es.onerror = () => {
        es.close();
        eventSourceRef.current = null;

        // Check if we can retry
        const nextAttempt = reconnectAttemptRef.current + 1;
        if (nextAttempt <= maxAttempts) {
          reconnectAttemptRef.current = nextAttempt;
          setReconnectAttempt(nextAttempt);
          setIsReconnecting(true);

          const delay = Math.min(baseDelay * Math.pow(1.5, nextAttempt - 1), 10000);
          reconnectTimerRef.current = setTimeout(() => {
            if (activeJobIdRef.current === jobId) {
              connect(jobId);
            }
          }, delay);
        } else {
          setIsStreaming(false);
          setIsReconnecting(false);
          setError(
            `Connection lost. Failed to reconnect after ${maxAttempts} attempts.`
          );
        }
      };
    },
    [baseDelay, maxAttempts]
  );

  const startProgress = useCallback(
    (jobId: string) => {
      stopProgress();

      setActiveJobId(jobId);
      activeJobIdRef.current = jobId;
      setEvent(null);
      setError(null);
      setIsStreaming(true);
      setIsReconnecting(false);
      reconnectAttemptRef.current = 0;
      setReconnectAttempt(0);

      connect(jobId);
    },
    [connect, stopProgress]
  );

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  return {
    activeJobId,
    event,
    isStreaming,
    isReconnecting,
    reconnectAttempt,
    maxReconnectAttempts: maxAttempts,
    error,
    startProgress,
    stopProgress,
  };
}