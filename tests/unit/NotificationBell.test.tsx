import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NotificationBell } from "@/components/NotificationBell";

// Mocks
vi.mock("next-auth/react", () => ({
  useSession: vi.fn(),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

describe("NotificationBell component & accessibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when unauthenticated", () => {
    vi.mocked(useSession).mockReturnValue({ data: null, status: "unauthenticated" } as any);
    const { container } = renderWithQueryClient(<NotificationBell />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders bell icon and badge with unread count when authenticated", async () => {
    vi.mocked(useSession).mockReturnValue({
      data: { user: { id: "u1", githubUsername: "alice" } },
      status: "authenticated",
    } as any);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        notifications: [
          {
            id: "n1",
            type: "BATCH_JOB_COMPLETED",
            title: "Batch job done",
            body: "10 contributors checked",
            read: false,
            createdAt: new Date().toISOString(),
          },
        ],
        unreadCount: 1,
      }),
    });

    renderWithQueryClient(<NotificationBell />);

    const button = screen.getByTestId("notification-bell-button");
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute("aria-haspopup", "dialog");
    expect(button).toHaveAttribute("aria-expanded", "false");

    await waitFor(() => {
      expect(screen.getByTestId("notification-badge")).toHaveTextContent("1");
      expect(button).toHaveAttribute("aria-label", "Notifications, 1 unread");
    });
  });

  it("opens popover dialog when bell button is clicked", async () => {
    vi.mocked(useSession).mockReturnValue({
      data: { user: { id: "u1", githubUsername: "alice" } },
      status: "authenticated",
    } as any);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        notifications: [
          {
            id: "n1",
            type: "BATCH_JOB_COMPLETED",
            title: "Batch job done",
            body: "10 contributors checked",
            read: false,
            createdAt: new Date().toISOString(),
          },
        ],
        unreadCount: 1,
      }),
    });

    renderWithQueryClient(<NotificationBell />);

    const button = screen.getByTestId("notification-bell-button");
    fireEvent.click(button);

    expect(button).toHaveAttribute("aria-expanded", "true");

    await waitFor(() => {
      const popover = screen.getByTestId("notification-popover");
      expect(popover).toBeInTheDocument();
      expect(popover).toHaveAttribute("role", "dialog");
      expect(screen.getByText("Batch job done")).toBeInTheDocument();
      expect(screen.getByText("10 contributors checked")).toBeInTheDocument();
    });
  });

  it("closes popover when Escape key is pressed", async () => {
    vi.mocked(useSession).mockReturnValue({
      data: { user: { id: "u1", githubUsername: "alice" } },
      status: "authenticated",
    } as any);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        notifications: [],
        unreadCount: 0,
      }),
    });

    renderWithQueryClient(<NotificationBell />);

    const button = screen.getByTestId("notification-bell-button");
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByTestId("notification-popover")).toBeInTheDocument();
    });

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByTestId("notification-popover")).not.toBeInTheDocument();
    });
  });

  it("triggers mark all read when button is clicked", async () => {
    vi.mocked(useSession).mockReturnValue({
      data: { user: { id: "u1", githubUsername: "alice" } },
      status: "authenticated",
    } as any);

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          notifications: [
            {
              id: "n1",
              type: "BATCH_JOB_COMPLETED",
              title: "Batch job done",
              body: "10 contributors checked",
              read: false,
              createdAt: new Date().toISOString(),
            },
          ],
          unreadCount: 1,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, unreadCount: 0 }),
      });

    renderWithQueryClient(<NotificationBell />);

    const button = screen.getByTestId("notification-bell-button");
    fireEvent.click(button);

    await waitFor(() => {
      const markAllBtn = screen.getByTestId("mark-all-read-button");
      expect(markAllBtn).toBeInTheDocument();
      fireEvent.click(markAllBtn);
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/notifications",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ all: true }),
        })
      );
    });
  });
});
