import { describe, it, expect } from "vitest";
import {
  flattenContributorPages,
  type PaginatedContributorsResponse,
} from "@/lib/use-infinite-contributors";

describe("flattenContributorPages", () => {
  it("flattens multiple pages of contributors into a single array", () => {
    const mockData = {
      pages: [
        {
          contributors: [
            {
              id: "1",
              githubUsername: "user1",
              stellarAddress: "G1",
              trustlineReady: true,
              trustlineAuthorized: true,
              verified: true,
              funded: true,
              xlmBalance: "10",
              spendableXlmBalance: "9",
              lastCheckedAt: "2025-01-01T00:00:00Z",
              readiness: "ready",
            },
          ],
          total: 2,
          hasMore: true,
          nextCursor: "cursor1",
        } as PaginatedContributorsResponse,
        {
          contributors: [
            {
              id: "2",
              githubUsername: "user2",
              stellarAddress: "G2",
              trustlineReady: true,
              trustlineAuthorized: true,
              verified: true,
              funded: true,
              xlmBalance: "15",
              spendableXlmBalance: "14",
              lastCheckedAt: "2025-01-01T00:00:00Z",
              readiness: "ready",
            },
          ],
          total: 2,
          hasMore: false,
        } as PaginatedContributorsResponse,
      ],
      pageParams: [null, "cursor1"],
    };

    const flattened = flattenContributorPages(mockData as any);

    expect(flattened).toHaveLength(2);
    expect(flattened[0].githubUsername).toBe("user1");
    expect(flattened[1].githubUsername).toBe("user2");
  });

  it("handles empty data", () => {
    const flattened = flattenContributorPages(undefined as any);
    expect(flattened).toEqual([]);
  });

  it("handles data with no pages", () => {
    const flattened = flattenContributorPages({ pages: undefined } as any);
    expect(flattened).toEqual([]);
  });

  it("handles single page of contributors", () => {
    const mockData = {
      pages: [
        {
          contributors: [
            {
              id: "1",
              githubUsername: "user1",
              stellarAddress: "G1",
              trustlineReady: true,
              trustlineAuthorized: true,
              verified: true,
              funded: true,
              xlmBalance: "10",
              spendableXlmBalance: "9",
              lastCheckedAt: "2025-01-01T00:00:00Z",
              readiness: "ready",
            },
          ],
          total: 1,
          hasMore: false,
        } as PaginatedContributorsResponse,
      ],
      pageParams: [null],
    };

    const flattened = flattenContributorPages(mockData as any);
    expect(flattened).toHaveLength(1);
    expect(flattened[0].githubUsername).toBe("user1");
  });
});
