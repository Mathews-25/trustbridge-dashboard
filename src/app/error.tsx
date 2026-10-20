"use client";

import { useEffect } from "react";
import { ErrorFallback } from "@/components/ErrorFallback";
import { captureException } from "@/lib/sentry";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Capture the error to Sentry with digest context
    captureException(error, {
      context: "app-error-boundary",
      digest: error.digest,
    });
  }, [error]);

  return (
    <ErrorFallback error={error} reset={reset} title="Something went wrong" />
  );
}
