"use client";

import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

interface ContributorPagerProps {
  /** Zero-based index of the currently visible page. */
  pageIndex: number;
  /** Total number of contributors across all pages. */
  total: number;
  /** Number of contributors on the current page. */
  pageSize: number;
  /** Whether there is a next page available. */
  hasMore: boolean;
  /** Whether there is a previous page available. */
  hasPrev: boolean;
  /** Whether the current page is loading. */
  isLoading?: boolean;
  /** Navigate to the next page. */
  onNext: () => void;
  /** Navigate to the previous page. */
  onPrev: () => void;
}

/**
 * Accessible prev/next pager for the cursor-paginated contributor table.
 *
 * Rendered below the table so keyboard users can reach it naturally after
 * tabbing through the rows. Buttons are disabled while loading to prevent
 * double-fetches. The live region announces page changes to screen readers
 * without stealing focus.
 */
export function ContributorPager({
  pageIndex,
  total,
  pageSize,
  hasMore,
  hasPrev,
  isLoading = false,
  onNext,
  onPrev,
}: ContributorPagerProps) {
  // Human-readable range: "1–25 of 142"
  const firstItem = pageIndex * pageSize + 1;
  const lastItem = pageIndex * pageSize + pageSize;
  const rangeLabel =
    total > 0
      ? `${firstItem}–${Math.min(lastItem, total)} of ${total}`
      : "Loading…";

  return (
    <nav
      aria-label="Contributor page navigation"
      className="mt-4 flex items-center justify-between gap-4"
    >
      {/* Screen-reader live region: announces page changes without moving focus */}
      <span
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {isLoading
          ? "Loading contributors…"
          : `Showing contributors ${rangeLabel}`}
      </span>

      <Button
        variant="outline"
        size="sm"
        onClick={onPrev}
        disabled={!hasPrev || isLoading}
        aria-label="Previous page"
      >
        {isLoading && hasPrev ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        )}
        Previous
      </Button>

      <span
        className="text-sm text-muted-foreground tabular-nums"
        aria-hidden="true"
      >
        {isLoading ? (
          <Loader2 className="inline h-3 w-3 animate-spin" />
        ) : (
          rangeLabel
        )}
      </span>

      <Button
        variant="outline"
        size="sm"
        onClick={onNext}
        disabled={!hasMore || isLoading}
        aria-label="Next page"
      >
        Next
        {isLoading && hasMore ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        )}
      </Button>
    </nav>
  );
}
