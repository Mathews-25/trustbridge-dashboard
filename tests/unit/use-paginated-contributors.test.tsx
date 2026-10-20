import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockPush = vi.fn();
let mockSearchParams = new URLSearchParams();
let mockPathname = "/dashboard";
const requestedUrls: string[] = [];

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  usePathname: () => mockPathname,
  useSearchParams: () => mockSearchParams,
}));

import { usePaginatedContributors } from "@/lib/use-paginated-contributors";

function emptyPage() {
  return { contributors: [], total: 0, hasMore: false, nextCursor: null };
}

/**
 * Stub `/api/contributors/paginated` and record the URL of every request so the
 * tests can assert the `limit` the hook actually asked for. Without this the
 * hook hits the real jsdom fetch, which is what made the `limit` assertions
 * below impossible to write.
 */
function stubFetch(
  page: (url: string) => unknown = () => emptyPage()
) {
  global.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    requestedUrls.push(url);
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(page(url)),
    });
  }) as unknown as typeof global.fetch;
}

describe("usePaginatedContributors", () => {
  let queryClient: QueryClient;
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    requestedUrls.length = 0;
    mockSearchParams = new URLSearchParams();
    mockPathname = "/dashboard";
    stubFetch();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  it("hydrates initial cursor from URL searchParams on mount", () => {
    mockSearchParams = new URLSearchParams("cursor=cursor-page-2");

    const { result } = renderHook(() => usePaginatedContributors(10), { wrapper });

    expect(result.current.currentCursor).toBe("cursor-page-2");
    expect(result.current.hasPrev).toBe(false);
  });

  it("updates URL on goToNext", async () => {
    stubFetch(() => ({
      contributors: [{ id: "1", githubUsername: "test1" }],
      total: 10,
      hasMore: true,
      nextCursor: "cursor-next-abc",
    }));

    const { result } = renderHook(() => usePaginatedContributors(10), { wrapper });

    // `goToNext` reads the next cursor off the resolved page, so the first
    // response has to land before it can be called.
    await waitFor(() => {
      expect(result.current.hasMore).toBe(true);
    });

    await act(async () => {
      result.current.goToNext();
    });

    expect(mockPush).toHaveBeenCalledWith("/dashboard?cursor=cursor-next-abc");
    expect(result.current.currentCursor).toBe("cursor-next-abc");
    expect(result.current.hasPrev).toBe(true);
    expect(result.current.pageIndex).toBe(1);
  });

  it("updates URL and pops cursor on goToPrev", async () => {
    stubFetch((url) => {
      const cursor = new URL(url, "http://localhost").searchParams.get("cursor");
      return {
        contributors: [{ id: cursor ?? "page-1" }],
        total: 20,
        hasMore: cursor === null,
        nextCursor: cursor === null ? "cursor-2" : null,
      };
    });

    const { result } = renderHook(() => usePaginatedContributors(10), { wrapper });

    await waitFor(() => {
      expect(result.current.hasMore).toBe(true);
    });

    await act(async () => {
      result.current.goToNext();
    });

    await waitFor(() => {
      expect(result.current.currentCursor).toBe("cursor-2");
    });

    await act(async () => {
      result.current.goToPrev();
    });

    expect(mockPush).toHaveBeenLastCalledWith("/dashboard");
    expect(result.current.currentCursor).toBe(null);
    expect(result.current.hasPrev).toBe(false);
    expect(result.current.pageIndex).toBe(0);
  });

  // #496 — the module declared ITEMS_PER_PAGE twice. These lock the single
  // surviving declaration to the value the API and the pager assume.
  it("defaults to 25 contributors per page", async () => {
    renderHook(() => usePaginatedContributors(), { wrapper });

    await waitFor(() => {
      expect(requestedUrls.length).toBeGreaterThan(0);
    });
    expect(new URL(requestedUrls[0], "http://localhost").searchParams.get("limit")).toBe("25");
  });

  it("honours a custom pageSize override in the API request", async () => {
    renderHook(() => usePaginatedContributors(7), { wrapper });

    await waitFor(() => {
      expect(requestedUrls.length).toBeGreaterThan(0);
    });
    expect(new URL(requestedUrls[0], "http://localhost").searchParams.get("limit")).toBe("7");
  });

  it.each([
    ["zero", 0],
    ["negative", -5],
    ["NaN", Number.NaN],
    ["fractional", 10.7],
  ])("falls back to the default page size for a %s pageSize", async (_label, pageSize) => {
    const expected = pageSize === 10.7 ? "10" : "25";
    renderHook(() => usePaginatedContributors(pageSize), { wrapper });

    await waitFor(() => {
      expect(requestedUrls.length).toBeGreaterThan(0);
    });
    expect(new URL(requestedUrls[0], "http://localhost").searchParams.get("limit")).toBe(expected);
  });

  it("exposes hasMore from the API response", async () => {
    stubFetch(() => ({
      contributors: [{ id: "1", githubUsername: "alice" }],
      total: 60,
      hasMore: true,
      nextCursor: "cursor-2",
    }));

    const { result } = renderHook(() => usePaginatedContributors(25), { wrapper });

    await waitFor(() => {
      expect(result.current.hasMore).toBe(true);
    });
    expect(result.current.total).toBe(60);
    expect(result.current.contributors).toHaveLength(1);
  });

  it("defaults hasMore to false before the first page resolves", () => {
    const { result } = renderHook(() => usePaginatedContributors(25), { wrapper });

    expect(result.current.hasMore).toBe(false);
    expect(result.current.hasPrev).toBe(false);
  });

  it("requests a distinct page per cursor and keeps each page's hasMore", async () => {
    stubFetch((url) => {
      const cursor = new URL(url, "http://localhost").searchParams.get("cursor");
      return {
        contributors: [{ id: cursor ?? "page-1", githubUsername: "alice" }],
        total: 3,
        hasMore: cursor === null,
        nextCursor: cursor === null ? "cursor-2" : null,
      };
    });

    const { result } = renderHook(() => usePaginatedContributors(25), { wrapper });

    await waitFor(() => {
      expect(result.current.contributors).toHaveLength(1);
    });
    expect(result.current.hasMore).toBe(true);

    await act(async () => {
      result.current.goToNext();
    });

    await waitFor(() => {
      expect(result.current.currentCursor).toBe("cursor-2");
    });
    await waitFor(() => {
      expect(result.current.hasMore).toBe(false);
    });

    // One request per cursor: page 1 (no cursor) and page 2 (`cursor-2`).
    const cursors = requestedUrls.map(
      (url) => new URL(url, "http://localhost").searchParams.get("cursor")
    );
    expect(cursors).toEqual([null, "cursor-2"]);
  });
});
