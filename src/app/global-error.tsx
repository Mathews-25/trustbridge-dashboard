"use client";

import { useEffect } from "react";

import { classifyError, globalErrorLogger } from "@/lib/error-handling";
import { captureException } from "@/lib/sentry";

import "./globals.css";

/**
 * Root-level error boundary. Catches errors thrown by the root layout
 * itself, which `error.tsx` boundaries in nested segments cannot — Next.js
 * requires this file to render its own `<html>`/`<body>` since it replaces
 * the root layout when it activates.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const classification = classifyError(error);

  // Use Next.js digest as the user-visible reference ID. The digest is a
  // server-side fingerprint that appears in server logs — never expose the
  // raw stack or message to users.
  const displayId = error.digest ?? null;

  useEffect(() => {
    globalErrorLogger.log(error, "root-layout");
    // Capture to Sentry with root-layout context
    captureException(error, {
      context: "root-layout-error-boundary",
      digest: error.digest,
    });
  }, [error]);

  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-background font-sans text-foreground">
        <div className="mx-auto max-w-md px-6 py-20 text-center">
          <h1 className="text-2xl font-semibold">Something went wrong</h1>
          <p className="mt-2 text-muted-foreground">
            {classification.message}
          </p>
          {displayId && (
            <p className="mt-3 text-xs text-muted-foreground">
              Reference ID:{" "}
              <code
                aria-label={`Error reference ID: ${displayId}`}
                className="select-all rounded bg-muted px-1 py-0.5 font-mono"
              >
                {displayId}
              </code>
            </p>
          )}
          <button
            type="button"
            onClick={reset}
            className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
