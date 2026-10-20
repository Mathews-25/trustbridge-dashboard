/**
 * Component tests for ErrorFallback (issue #381).
 *
 * ErrorFallback is the shared UI behind every App Router `error.tsx`
 * boundary, so these tests assert what a user actually sees for each
 * error input and state the component supports:
 *  - the classification-specific message rendered for network, timeout,
 *    auth, server and unknown errors,
 *  - the default and custom titles the boundaries pass,
 *  - the Reference ID block: explicit `requestId`, Next.js `digest`
 *    fallback, neither, and precedence between them,
 *  - the "Try again" reset control,
 *  - the side effects on mount (local error logger + Sentry capture),
 *  - and that raw stack traces are never rendered for users
 *    (docs/LOGGING_AND_PAGINATION.md).
 *
 * Mocks `@/lib/sentry` so the capture call can be asserted; everything
 * else (classifyError, Card/Button primitives, globalErrorLogger) is real.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/sentry", () => ({
  captureException: vi.fn(),
}));

import { ErrorFallback } from "@/components/ErrorFallback";
import { globalErrorLogger } from "@/lib/error-handling";
import { captureException } from "@/lib/sentry";

function makeError(
  message: string,
  extra: { digest?: string } = {}
): Error & { digest?: string } {
  const error = new Error(message) as Error & { digest?: string };
  if (extra.digest !== undefined) error.digest = extra.digest;
  return error;
}

beforeEach(() => {
  vi.clearAllMocks();
  globalErrorLogger.clear();
});

describe("ErrorFallback — titles", () => {
  it("renders the default title when none is provided", () => {
    render(<ErrorFallback error={makeError("boom")} reset={vi.fn()} />);

    expect(
      screen.getByRole("heading", { name: "Something went wrong" })
    ).toBeInTheDocument();
  });

  it("renders a custom title passed by a route error boundary", () => {
    render(
      <ErrorFallback
        error={makeError("boom")}
        reset={vi.fn()}
        title="Failed to load the maintainer dashboard"
      />
    );

    expect(
      screen.getByRole("heading", {
        name: "Failed to load the maintainer dashboard",
      })
    ).toBeInTheDocument();
  });
});

describe("ErrorFallback — error messaging by classification", () => {
  it.each([
    [
      "network (fetch TypeError)",
      new TypeError("fetch failed"),
      "Network error. Please check your connection and try again.",
    ],
    [
      "network (timeout)",
      new Error("timeout of 10000ms exceeded"),
      "Request timed out. Please try again.",
    ],
    [
      "auth (401)",
      new Error("Request failed with 401 Unauthorized"),
      "You do not have permission to perform this action.",
    ],
    [
      "auth (403)",
      new Error("Forbidden (403)"),
      "You do not have permission to perform this action.",
    ],
    [
      "server (500)",
      new Error("HTTP 500 Internal Server Error"),
      "Server error. Please try again later.",
    ],
    [
      "unknown",
      new Error("something inexplicable happened"),
      "An unexpected error occurred. Please try again.",
    ],
  ])("shows the %s message", (_label, error, expectedMessage) => {
    render(<ErrorFallback error={error} reset={vi.fn()} />);

    expect(screen.getByText(expectedMessage)).toBeInTheDocument();
  });

  it("always shows exactly one classification message", () => {
    render(<ErrorFallback error={makeError("boom")} reset={vi.fn()} />);

    // The card description area carries the only user-facing explanation.
    expect(
      screen.getByText("An unexpected error occurred. Please try again.")
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Network error. Please check your connection and try again.")
    ).not.toBeInTheDocument();
  });
});

describe("ErrorFallback — Reference ID display", () => {
  it("shows an explicit requestId as a selectable reference ID", () => {
    render(
      <ErrorFallback
        error={makeError("boom")}
        reset={vi.fn()}
        requestId="req-123"
      />
    );

    expect(screen.getByText(/Reference ID:/)).toBeInTheDocument();
    const code = screen.getByLabelText("Error reference ID: req-123");
    expect(code).toHaveTextContent("req-123");
    expect(code).toHaveClass("select-all");
  });

  it("falls back to the Next.js error digest when no requestId is given", () => {
    render(
      <ErrorFallback error={makeError("boom", { digest: "abc123" })} reset={vi.fn()} />
    );

    expect(screen.getByLabelText("Error reference ID: abc123")).toBeInTheDocument();
    expect(screen.getByText(/Reference ID:/)).toBeInTheDocument();
  });

  it("prefers requestId over the digest when both are present", () => {
    render(
      <ErrorFallback
        error={makeError("boom", { digest: "from-digest" })}
        reset={vi.fn()}
        requestId="from-request"
      />
    );

    expect(
      screen.getByLabelText("Error reference ID: from-request")
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Error reference ID: from-digest")
    ).not.toBeInTheDocument();
  });

  it("shows no reference block when neither requestId nor digest exists", () => {
    render(<ErrorFallback error={makeError("boom")} reset={vi.fn()} />);

    expect(screen.queryByText(/Reference ID:/)).not.toBeInTheDocument();
  });

  it("hides the reference block for an empty-string requestId", () => {
    // Documents actual behaviour: `"" ?? digest` keeps the empty string, and
    // the block renders only when `displayId` is truthy.
    render(
      <ErrorFallback
        error={makeError("boom", { digest: "abc123" })}
        reset={vi.fn()}
        requestId=""
      />
    );

    expect(screen.queryByText(/Reference ID:/)).not.toBeInTheDocument();
  });

  it("never renders the raw stack trace", () => {
    const error = makeError("boom", { digest: "abc123" });
    const { container } = render(
      <ErrorFallback error={error} reset={vi.fn()} requestId="req-1" />
    );

    expect(error.stack).toBeDefined();
    expect(container.textContent).not.toContain(error.stack);
  });
});

describe("ErrorFallback — recovery control", () => {
  it("invokes the reset callback when 'Try again' is clicked", () => {
    const reset = vi.fn();
    render(<ErrorFallback error={makeError("boom")} reset={reset} />);

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("renders the reset control exactly once", () => {
    render(<ErrorFallback error={makeError("boom")} reset={vi.fn()} />);

    expect(
      screen.getAllByRole("button", { name: "Try again" })
    ).toHaveLength(1);
  });
});

describe("ErrorFallback — mount-time reporting side effects", () => {
  it("logs the error to the shared local error logger", () => {
    const error = makeError("boom");
    render(
      <ErrorFallback error={error} reset={vi.fn()} title="Custom boundary title" />
    );

    const logged = globalErrorLogger
      .getErrors()
      .filter((e) => e.errorMessage === "boom");

    expect(logged).toHaveLength(1);
    expect(logged[0].componentStack).toBe("Custom boundary title");
    expect(logged[0].errorStack).toBe(error.stack);
  });

  it("captures the exception in Sentry with component and digest context", () => {
    const error = makeError("boom", { digest: "digest-42" });
    render(
      <ErrorFallback error={error} reset={vi.fn()} title="Something went wrong" />
    );

    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(error, {
      component: "Something went wrong",
      digest: "digest-42",
    });
  });

  it("captures with an undefined digest when the error has none", () => {
    const error = makeError("boom");
    render(<ErrorFallback error={error} reset={vi.fn()} />);

    expect(captureException).toHaveBeenCalledWith(error, {
      component: "Something went wrong",
      digest: undefined,
    });
  });
});
