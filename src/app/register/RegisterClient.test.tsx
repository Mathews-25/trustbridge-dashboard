/**
 * Issue #146 — optimistic register saves and rollback.
 *
 * The concurrency suite already proves the API returns 409 for a contested
 * address. These tests cover the half that was missing: what the contributor
 * sees while the save is in flight, and that a rejection puts the UI back
 * exactly where it started rather than leaving a phantom registration on
 * screen.
 */

import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: {
      user: { id: "u1", githubUsername: "contributor" },
      expires: new Date(Date.now() + 86_400_000).toISOString(),
    },
    status: "authenticated",
  }),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

// AddressInput debounces a POST to /api/check; irrelevant here and noisy.
vi.mock("@/components/AddressInput", () => ({
  AddressInput: ({
    value,
    onChange,
    disabled,
  }: {
    value: string;
    onChange: (v: string) => void;
    disabled?: boolean;
  }) => (
    <input
      aria-label="Stellar address"
      data-testid="stellar-address-input"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

vi.mock("@/components/OutreachTemplateGenerator", () => ({
  OutreachTemplateGenerator: () => null,
}));

import { RegisterClient } from "@/app/register/RegisterClient";

const EXISTING_ADDRESS =
  "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const NEW_ADDRESS =
  "GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";

/** Never retry in tests — a rollback assertion must not race a retry. */
function renderClient() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <RegisterClient />
    </QueryClientProvider>
  );
}

/** A POST whose resolution the test controls, so "in flight" is observable. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

/** GET /api/register answers with `registration`; POST is per-test. */
function routeFetch(
  getRegistration: () => unknown,
  onPost: (address: string) => Promise<Response>
) {
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body)) as { stellarAddress: string };
      return onPost(body.stellarAddress);
    }
    return Promise.resolve(
      jsonResponse(200, { registration: getRegistration() })
    );
  });
}

describe("RegisterClient — optimistic save", () => {
  it("shows the new address before the server has answered", async () => {
    const user = userEvent.setup();
    const pending = deferred<Response>();
    routeFetch(() => null, () => pending.promise);

    renderClient();

    await user.type(screen.getByTestId("stellar-address-input"), NEW_ADDRESS);
    await user.click(screen.getByTestId("save-registration"));

    // The card exists while the POST is still open — that is the whole point.
    await waitFor(() => {
      expect(screen.getByTestId("current-registration-address")).toHaveTextContent(
        NEW_ADDRESS
      );
    });

    pending.resolve(jsonResponse(200, { success: true }));
  });

  it("marks the optimistic row as busy and withholds a readiness claim", async () => {
    const user = userEvent.setup();
    const pending = deferred<Response>();
    routeFetch(() => null, () => pending.promise);

    renderClient();

    await user.type(screen.getByTestId("stellar-address-input"), NEW_ADDRESS);
    await user.click(screen.getByTestId("save-registration"));

    await waitFor(() => {
      expect(screen.getByTestId("current-registration")).toHaveAttribute(
        "aria-busy",
        "true"
      );
    });

    // Only the server's Horizon check can say whether this address is ready.
    expect(screen.getByText(/confirming with the stellar network/i)).toBeInTheDocument();

    pending.resolve(jsonResponse(200, { success: true }));
  });

  it("confirms with the server's row once the save lands", async () => {
    const user = userEvent.setup();
    let stored: unknown = null;

    routeFetch(
      () => stored,
      async (address) => {
        stored = { stellarAddress: address, readiness: "ready" };
        return jsonResponse(200, { success: true });
      }
    );

    renderClient();

    await user.type(screen.getByTestId("stellar-address-input"), NEW_ADDRESS);
    await user.click(screen.getByTestId("save-registration"));

    await waitFor(() => {
      expect(screen.getByTestId("registration-saved")).toBeInTheDocument();
    });

    // The pending marker is gone and the badge the server computed is shown.
    await waitFor(() => {
      expect(screen.getByTestId("current-registration")).toHaveAttribute(
        "aria-busy",
        "false"
      );
    });
  });
});

describe("RegisterClient — rollback on conflict", () => {
  it("restores the previous address when the new one is already taken", async () => {
    const user = userEvent.setup();
    routeFetch(
      () => ({ stellarAddress: EXISTING_ADDRESS, readiness: "ready" }),
      async () =>
        jsonResponse(409, {
          error: "This Stellar address is already registered to another user",
          code: "ADDRESS_TAKEN",
        })
    );

    renderClient();

    await waitFor(() => {
      expect(screen.getByTestId("current-registration-address")).toHaveTextContent(
        EXISTING_ADDRESS
      );
    });

    await user.type(screen.getByTestId("stellar-address-input"), NEW_ADDRESS);
    await user.click(screen.getByTestId("save-registration"));

    // A phantom registration left on screen is worse than no optimism at all.
    await waitFor(() => {
      expect(screen.getByTestId("current-registration-address")).toHaveTextContent(
        EXISTING_ADDRESS
      );
    });
    expect(
      screen.queryByTestId("current-registration-address")
    ).not.toHaveTextContent(NEW_ADDRESS);
  });

  it("removes the optimistic card entirely when there was no prior registration", async () => {
    const user = userEvent.setup();
    routeFetch(
      () => null,
      async () => jsonResponse(409, { code: "ADDRESS_TAKEN" })
    );

    renderClient();

    await user.type(screen.getByTestId("stellar-address-input"), NEW_ADDRESS);
    await user.click(screen.getByTestId("save-registration"));

    await waitFor(() => {
      expect(screen.getByTestId("registration-error")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("current-registration")).not.toBeInTheDocument();
  });

  it("announces the conflict as an alert", async () => {
    const user = userEvent.setup();
    routeFetch(
      () => null,
      async () =>
        jsonResponse(409, {
          error: "This Stellar address is already registered to another user",
          code: "ADDRESS_TAKEN",
        })
    );

    renderClient();

    await user.type(screen.getByTestId("stellar-address-input"), NEW_ADDRESS);
    await user.click(screen.getByTestId("save-registration"));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveAttribute("data-failure-kind", "address_taken");
    expect(alert).toHaveTextContent(/already registered/i);
  });

  it("clears the input after a conflict so the retry is a different wallet", async () => {
    const user = userEvent.setup();
    routeFetch(
      () => null,
      async () => jsonResponse(409, { code: "ADDRESS_TAKEN" })
    );

    renderClient();

    const input = screen.getByTestId("stellar-address-input");
    await user.type(input, NEW_ADDRESS);
    await user.click(screen.getByTestId("save-registration"));

    await waitFor(() => expect(input).toHaveValue(""));
  });

  it("does not report success alongside a failure", async () => {
    const user = userEvent.setup();
    routeFetch(
      () => null,
      async () => jsonResponse(409, { code: "ADDRESS_TAKEN" })
    );

    renderClient();

    await user.type(screen.getByTestId("stellar-address-input"), NEW_ADDRESS);
    await user.click(screen.getByTestId("save-registration"));

    await screen.findByTestId("registration-error");
    expect(screen.queryByTestId("registration-saved")).not.toBeInTheDocument();
  });
});

describe("RegisterClient — other failures are distinguished", () => {
  it("treats 401 as an expired session, not a conflict", async () => {
    const user = userEvent.setup();
    routeFetch(
      () => null,
      async () => jsonResponse(401, { error: "Unauthorized", code: "UNAUTHORIZED" })
    );

    renderClient();

    await user.type(screen.getByTestId("stellar-address-input"), NEW_ADDRESS);
    await user.click(screen.getByTestId("save-registration"));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveAttribute("data-failure-kind", "unauthorized");
    expect(alert).toHaveTextContent(/sign in/i);
  });

  it("keeps the typed address when the session expired", async () => {
    const user = userEvent.setup();
    routeFetch(
      () => null,
      async () => jsonResponse(401, { code: "UNAUTHORIZED" })
    );

    renderClient();

    const input = screen.getByTestId("stellar-address-input");
    await user.type(input, NEW_ADDRESS);
    await user.click(screen.getByTestId("save-registration"));

    await screen.findByTestId("registration-error");
    // The address was fine; re-typing 56 characters after a session blip is
    // a punishment for the server's problem.
    expect(input).toHaveValue(NEW_ADDRESS);
  });

  it("surfaces a validation message from the server", async () => {
    const user = userEvent.setup();
    routeFetch(
      () => null,
      async () =>
        jsonResponse(400, {
          error: "Invalid Stellar G-address format",
          code: "VALIDATION_FAILED",
        })
    );

    renderClient();

    await user.type(screen.getByTestId("stellar-address-input"), "NOPE");
    await user.click(screen.getByTestId("save-registration"));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveAttribute("data-failure-kind", "validation");
    expect(alert).toHaveTextContent("Invalid Stellar G-address format");
  });

  it("reports a network failure without claiming anything was saved", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "POST") return Promise.reject(new TypeError("offline"));
      return Promise.resolve(jsonResponse(200, { registration: null }));
    });

    renderClient();

    await user.type(screen.getByTestId("stellar-address-input"), NEW_ADDRESS);
    await user.click(screen.getByTestId("save-registration"));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveAttribute("data-failure-kind", "network");
    expect(alert).toHaveTextContent(/nothing was saved/i);
  });
});

describe("RegisterClient — server stays the source of truth", () => {
  it("still POSTs to the server for every save", async () => {
    const user = userEvent.setup();
    routeFetch(() => null, async () => jsonResponse(200, { success: true }));

    renderClient();

    await user.type(screen.getByTestId("stellar-address-input"), NEW_ADDRESS);
    await user.click(screen.getByTestId("save-registration"));

    await waitFor(() => {
      const posts = fetchMock.mock.calls.filter(
        ([, init]) => (init as RequestInit | undefined)?.method === "POST"
      );
      expect(posts).toHaveLength(1);
      expect(JSON.parse(String((posts[0][1] as RequestInit).body))).toEqual({
        stellarAddress: NEW_ADDRESS,
      });
    });
  });

  it("sends credentials so the session cookie and origin check hold", async () => {
    const user = userEvent.setup();
    routeFetch(() => null, async () => jsonResponse(200, { success: true }));

    renderClient();

    await user.type(screen.getByTestId("stellar-address-input"), NEW_ADDRESS);
    await user.click(screen.getByTestId("save-registration"));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        ([, init]) => (init as RequestInit | undefined)?.method === "POST"
      );
      expect((post?.[1] as RequestInit).credentials).toBe("same-origin");
    });
  });

  it("refetches the registration after the save settles", async () => {
    const user = userEvent.setup();
    routeFetch(() => null, async () => jsonResponse(200, { success: true }));

    renderClient();

    const getsBefore = fetchMock.mock.calls.filter(
      ([, init]) => (init as RequestInit | undefined)?.method !== "POST"
    ).length;

    await user.type(screen.getByTestId("stellar-address-input"), NEW_ADDRESS);
    await user.click(screen.getByTestId("save-registration"));

    await waitFor(() => {
      const getsAfter = fetchMock.mock.calls.filter(
        ([, init]) => (init as RequestInit | undefined)?.method !== "POST"
      ).length;
      expect(getsAfter).toBeGreaterThan(getsBefore);
    });
  });

  it("disables the save button while a save is in flight", async () => {
    const user = userEvent.setup();
    const pending = deferred<Response>();
    routeFetch(() => null, () => pending.promise);

    renderClient();

    await user.type(screen.getByTestId("stellar-address-input"), NEW_ADDRESS);
    await user.click(screen.getByTestId("save-registration"));

    // Guards the double-click the concurrency suite exercises server-side.
    await waitFor(() => {
      expect(screen.getByTestId("save-registration")).toBeDisabled();
    });

    pending.resolve(jsonResponse(200, { success: true }));
  });
});
