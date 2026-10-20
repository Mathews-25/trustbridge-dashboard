"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { classifyError, globalErrorLogger } from "@/lib/error-handling";
import { captureException } from "@/lib/sentry";

interface ErrorFallbackProps {
  error: Error & { digest?: string };
  reset: () => void;
  title?: string;
  /** Optional request ID to display so users can relay it to support. */
  requestId?: string;
}

/** Shared UI for App Router error boundaries (`error.tsx` files). */
export function ErrorFallback({
  error,
  reset,
  title = "Something went wrong",
  requestId,
}: ErrorFallbackProps) {
  const classification = classifyError(error);

  // Use digest (Next.js server-error fingerprint) as the displayed ID when no
  // explicit requestId is provided. Never expose raw stack traces to users.
  const displayId = requestId ?? error.digest ?? null;

  useEffect(() => {
    // Log to local error tracking and Sentry
    globalErrorLogger.log(error, title);
    captureException(error, {
      component: title,
      digest: error.digest,
    });
  }, [error, title]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-20 text-center sm:px-6">
      <Card className="w-full border-destructive/30 bg-destructive/5">
        <CardHeader>
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-5 w-5 text-destructive" />
          </div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{classification.message}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {displayId && (
            <p className="text-xs text-muted-foreground">
              Reference ID:{" "}
              <code
                aria-label={`Error reference ID: ${displayId}`}
                className="select-all rounded bg-muted px-1 py-0.5 font-mono"
              >
                {displayId}
              </code>
            </p>
          )}
          <Button variant="stellar" onClick={reset}>
            Try again
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
