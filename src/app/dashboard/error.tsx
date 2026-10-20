"use client";

import { ErrorFallback } from "@/components/ErrorFallback";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorFallback
      error={error}
      reset={reset}
      title="Failed to load the maintainer dashboard"
    />
  );
}
