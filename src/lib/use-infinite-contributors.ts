"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import type { ContributorRow } from "@/types";

export interface PaginatedContributorsResponse {
  contributors: ContributorRow[];
  total: number;
  hasMore: boolean;
  nextCursor?: string;
}

const ITEMS_PER_PAGE = 25;

/**
 * React Query hook for infinite scroll pagination of contributors.
 * Uses cursor-based pagination to efficiently fetch large contributor lists.
 */
export function useInfiniteContributors() {
  return useInfiniteQuery<PaginatedContributorsResponse>({
    queryKey: ["contributors", "infinite"],
    queryFn: async ({ pageParam = null }) => {
      const params = new URLSearchParams({
        limit: String(ITEMS_PER_PAGE),
      });

      if (typeof pageParam === "string" && pageParam) {
        params.append("cursor", pageParam);
      }

      const response = await fetch(
        `/api/contributors/paginated?${params.toString()}`
      );
      if (!response.ok) {
        throw new Error("Failed to load contributors");
      }

      return (await response.json()) as PaginatedContributorsResponse;
    },
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.nextCursor : undefined,
    initialPageParam: null,
  });
}

/**
 * Flatten infinite query pages into a single array of contributors.
 */
export function flattenContributorPages(
  data: ReturnType<typeof useInfiniteContributors>["data"]
): ContributorRow[] {
  if (!data?.pages) return [];
  return data.pages.flatMap((page) => page.contributors);
}
