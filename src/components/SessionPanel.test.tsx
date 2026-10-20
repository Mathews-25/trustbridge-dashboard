/**
 * Issue #148 — the session panel must be useful and honest at the same time.
 */

import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const signOutMock = vi.fn();

vi.mock("next-auth/react", () => ({
  signOut: (...args: unknown[]) => signOutMock(...args),
  useSession: () => ({
    data: { user: { id: "u1", githubUsername: "octocat" } },
    status: "authenticated",
  }),
}));

import { SessionPanel } from "@/components/SessionPanel";
import { SESSION_MAX_AGE_SECONDS } from "@/lib/session-info";

const NOW_SECONDS = Math.floor(Date.now() / 1000);

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <SessionPanel />
    </QueryClientProvider>
  );
}

function mockSessionInfo(overrides: Record<string, unknown> = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        session: {
          strategy: "jwt",
          issuedAt: new Date((NOW_SECONDS - 3_600) * 1000).toISOString(),
          expiresAt: new Date(
            (NOW_SECONDS + SESSION_MAX_AGE_SECONDS) * 1000
          ).toISOString(),
          expiresInSeconds: SESSION_MAX_AGE_SECONDS,
          maxAgeSeconds: SESSION_MAX_AGE_SECONDS,
          canListOtherSessions: false,
          signOutEndsAllSessions: false,
          ...overrides,
        },
      }),
    }))
  );
}

beforeEach(() => {
  signOutMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SessionPanel — current session", () => {
  it("names the signed-in GitHub account", async () => {
    mockSessionInfo();
    renderPanel();

    expect(await screen.findByText("@octocat")).toBeInTheDocument();
  });

  it("shows issued-at, expiry and remaining time", async () => {
    mockSessionInfo();
    renderPanel();

    const details = await screen.findByTestId("session-details");
    expect(details).toHaveTextContent(/signed in at/i);
    expect(details).toHaveTextContent(/expires at/i);
    expect(details).toHaveTextContent(/time remaining/i);
    expect(details).toHaveTextContent("30d");
  });

  it("names the session type so the limitation is traceable", async () => {
    mockSessionInfo();
    renderPanel();

    expect(await screen.findByText(/signed token \(jwt\)/i)).toBeInTheDocument();
  });

  it("says Unknown rather than inventing a date", async () => {
    mockSessionInfo({ issuedAt: null, expiresAt: null, expiresInSeconds: null });
    renderPanel();

    const details = await screen.findByTestId("session-details");
    expect(details).toHaveTextContent("Unknown");
  });

  it("surfaces a load failure as an alert", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }))
    );
    renderPanel();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /could not load session details/i
    );
  });
});

describe("SessionPanel — honesty about JWT limits", () => {
  it("states that other devices cannot be listed", async () => {
    mockSessionInfo();
    renderPanel();

    const notice = await screen.findByTestId("jwt-limitation-notice");
    expect(notice).toHaveTextContent(/cannot be listed or signed out from here/i);
  });

  it("says sign-out only ends this browser's session", async () => {
    mockSessionInfo();
    renderPanel();

    const notice = await screen.findByTestId("jwt-limitation-notice");
    expect(notice).toHaveTextContent(/this browser's session only/i);
  });

  it("states how long other sessions stay valid", async () => {
    mockSessionInfo();
    renderPanel();

    // The lifetime comes from the API response, so the notice renders without
    // it on the first paint and fills in once the query lands.
    await screen.findByTestId("session-details");
    await waitFor(() => {
      expect(screen.getByTestId("jwt-limitation-notice")).toHaveTextContent(
        /up to 30 days after sign-in/i
      );
    });
  });

  it("points at the GitHub OAuth revocation page as the real remedy", async () => {
    mockSessionInfo();
    renderPanel();

    const link = await screen.findByRole("link", {
      name: /authorized oauth apps/i,
    });
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/settings/applications"
    );
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("never renders a fabricated device list", async () => {
    mockSessionInfo();
    renderPanel();

    await screen.findByTestId("session-details");
    // An empty or partial device list reads as reassurance to someone whose
    // laptop was just stolen. Better to show none and say why.
    expect(screen.queryByText(/other devices \(0\)/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("does not label the sign-out button as global", async () => {
    mockSessionInfo();
    renderPanel();

    const button = await screen.findByTestId("sign-out");
    expect(button).toHaveTextContent(/this browser/i);
    expect(button).not.toHaveTextContent(/all devices|everywhere/i);
  });
});

describe("SessionPanel — sign out", () => {
  it("signs out through NextAuth and returns to the landing page", async () => {
    mockSessionInfo();
    const user = userEvent.setup();
    renderPanel();

    await user.click(await screen.findByTestId("sign-out"));

    await waitFor(() => {
      expect(signOutMock).toHaveBeenCalledWith({ callbackUrl: "/" });
    });
  });
});
