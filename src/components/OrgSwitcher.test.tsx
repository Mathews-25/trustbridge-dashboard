/**
 * OrgSwitcher — unit tests
 *
 * Covers the happy path (switching orgs), the failure path (API error),
 * accessibility contracts (role="menu", aria-checked, keyboard nav), and
 * the non-render cases (single-org maintainer, contributor, unauthenticated).
 */
import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Session mock ────────────────────────────────────────────────────────────

const mockUpdate = vi.fn();
let mockSession: {
  user: {
    id: string;
    githubUsername: string;
    isMaintainer: boolean;
    maintainerOrgId?: string;
    availableOrgs?: string[];
  };
} | null = null;

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: mockSession, update: mockUpdate }),
}));

// Stub window.location.assign so tests don't navigate
Object.defineProperty(window, "location", {
  value: { assign: vi.fn() },
  writable: true,
});

// ── Import under test ───────────────────────────────────────────────────────

import { OrgSwitcher } from "@/components/OrgSwitcher";

// ── Helpers ─────────────────────────────────────────────────────────────────

function setMultiOrgMaintainerSession(
  activeOrg = "org-alpha",
  availableOrgs = ["org-alpha", "org-beta", "org-gamma"]
) {
  mockSession = {
    user: {
      id: "maintainer-1",
      githubUsername: "octocat",
      isMaintainer: true,
      maintainerOrgId: activeOrg,
      availableOrgs,
    },
  };
}

function setSingleOrgMaintainerSession() {
  mockSession = {
    user: {
      id: "maintainer-1",
      githubUsername: "octocat",
      isMaintainer: true,
      maintainerOrgId: "org-alpha",
      availableOrgs: ["org-alpha"],
    },
  };
}

function setContributorSession() {
  mockSession = {
    user: {
      id: "contributor-1",
      githubUsername: "contributor",
      isMaintainer: false,
      availableOrgs: [],
    },
  };
}

function mockSwitchOrgSuccess(newOrgId: string) {
  vi.spyOn(global, "fetch").mockResolvedValueOnce(
    new Response(JSON.stringify({ maintainerOrgId: newOrgId, availableOrgs: ["org-alpha", "org-beta", "org-gamma"] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  );
}

function mockSwitchOrgFailure(message = "Org not available for this session") {
  vi.spyOn(global, "fetch").mockResolvedValueOnce(
    new Response(JSON.stringify({ error: message }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    })
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("OrgSwitcher — visibility", () => {
  beforeEach(() => {
    mockSession = null;
    vi.clearAllMocks();
  });

  it("renders nothing when the user is unauthenticated", () => {
    mockSession = null;
    const { container } = render(<OrgSwitcher />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for a contributor (non-maintainer)", () => {
    setContributorSession();
    const { container } = render(<OrgSwitcher />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for a single-org maintainer", () => {
    setSingleOrgMaintainerSession();
    const { container } = render(<OrgSwitcher />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the switcher for a multi-org maintainer", () => {
    setMultiOrgMaintainerSession();
    render(<OrgSwitcher />);
    expect(screen.getByTestId("org-switcher-trigger")).toBeInTheDocument();
  });

  it("displays the active org name in the trigger button", () => {
    setMultiOrgMaintainerSession("org-beta");
    render(<OrgSwitcher />);
    expect(screen.getByTestId("org-switcher-trigger")).toHaveTextContent("org-beta");
  });
});

describe("OrgSwitcher — dropdown", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setMultiOrgMaintainerSession();
  });

  it("opens the menu on trigger click", async () => {
    const user = userEvent.setup();
    render(<OrgSwitcher />);

    expect(screen.queryByTestId("org-switcher-menu")).not.toBeInTheDocument();
    await user.click(screen.getByTestId("org-switcher-trigger"));
    expect(screen.getByTestId("org-switcher-menu")).toBeInTheDocument();
  });

  it("closes the menu on a second trigger click", async () => {
    const user = userEvent.setup();
    render(<OrgSwitcher />);

    await user.click(screen.getByTestId("org-switcher-trigger"));
    await user.click(screen.getByTestId("org-switcher-trigger"));
    expect(screen.queryByTestId("org-switcher-menu")).not.toBeInTheDocument();
  });

  it("closes the menu on Escape and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    render(<OrgSwitcher />);

    await user.click(screen.getByTestId("org-switcher-trigger"));
    expect(screen.getByTestId("org-switcher-menu")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByTestId("org-switcher-menu")).not.toBeInTheDocument();
    expect(screen.getByTestId("org-switcher-trigger")).toHaveFocus();
  });

  it("marks the active org as aria-checked=true", async () => {
    const user = userEvent.setup();
    render(<OrgSwitcher />);

    await user.click(screen.getByTestId("org-switcher-trigger"));

    const activeOption = screen.getByTestId("org-option-org-alpha");
    expect(activeOption).toHaveAttribute("aria-checked", "true");

    const inactiveOption = screen.getByTestId("org-option-org-beta");
    expect(inactiveOption).toHaveAttribute("aria-checked", "false");
  });

  it("lists all available orgs in the menu", async () => {
    const user = userEvent.setup();
    render(<OrgSwitcher />);

    await user.click(screen.getByTestId("org-switcher-trigger"));

    const menu = screen.getByTestId("org-switcher-menu");
    expect(within(menu).getByTestId("org-option-org-alpha")).toBeInTheDocument();
    expect(within(menu).getByTestId("org-option-org-beta")).toBeInTheDocument();
    expect(within(menu).getByTestId("org-option-org-gamma")).toBeInTheDocument();
  });

  it("navigates between options with ArrowDown and ArrowUp", async () => {
    const user = userEvent.setup();
    render(<OrgSwitcher />);

    await user.click(screen.getByTestId("org-switcher-trigger"));

    // ArrowDown moves focus to the next item
    await user.keyboard("{ArrowDown}");
    const second = screen.getByTestId("org-option-org-beta");
    expect(document.activeElement).toBe(second);

    // ArrowDown wraps around
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{ArrowDown}");
    const first = screen.getByTestId("org-option-org-alpha");
    expect(document.activeElement).toBe(first);

    // ArrowUp wraps backward
    await user.keyboard("{ArrowUp}");
    const last = screen.getByTestId("org-option-org-gamma");
    expect(document.activeElement).toBe(last);
  });
});

describe("OrgSwitcher — switching orgs (happy path)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setMultiOrgMaintainerSession("org-alpha");
    mockUpdate.mockResolvedValue(undefined);
  });

  it("calls the switch-org API and updates the session on success", async () => {
    mockSwitchOrgSuccess("org-beta");
    const user = userEvent.setup();
    render(<OrgSwitcher />);

    await user.click(screen.getByTestId("org-switcher-trigger"));
    await user.click(screen.getByTestId("org-option-org-beta"));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/auth/switch-org",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ orgId: "org-beta" }),
        })
      );
    });

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith({ maintainerOrgId: "org-beta" });
    });

    expect(window.location.assign).toHaveBeenCalledWith("/dashboard");
  });

  it("does not call the API when clicking the already-active org", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    const user = userEvent.setup();
    render(<OrgSwitcher />);

    await user.click(screen.getByTestId("org-switcher-trigger"));
    await user.click(screen.getByTestId("org-option-org-alpha")); // already active

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("OrgSwitcher — switching orgs (failure path)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setMultiOrgMaintainerSession("org-alpha");
  });

  it("shows an inline error when the API rejects the switch", async () => {
    mockSwitchOrgFailure("Org not available for this session");
    const user = userEvent.setup();
    render(<OrgSwitcher />);

    await user.click(screen.getByTestId("org-switcher-trigger"));
    await user.click(screen.getByTestId("org-option-org-beta"));

    await waitFor(() => {
      expect(screen.getByTestId("org-switcher-error")).toHaveTextContent(
        "Org not available for this session"
      );
    });

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(window.location.assign).not.toHaveBeenCalledWith("/dashboard");
  });

  it("does not navigate on API failure", async () => {
    mockSwitchOrgFailure();
    const user = userEvent.setup();
    render(<OrgSwitcher />);

    await user.click(screen.getByTestId("org-switcher-trigger"));
    await user.click(screen.getByTestId("org-option-org-beta"));

    await waitFor(() => {
      expect(screen.getByTestId("org-switcher-error")).toBeInTheDocument();
    });

    expect(window.location.assign).not.toHaveBeenCalledWith("/dashboard");
  });
});

describe("OrgSwitcher — accessibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setMultiOrgMaintainerSession();
  });

  it("trigger has aria-haspopup=menu", () => {
    render(<OrgSwitcher />);
    expect(screen.getByTestId("org-switcher-trigger")).toHaveAttribute(
      "aria-haspopup",
      "menu"
    );
  });

  it("trigger aria-expanded toggles correctly", async () => {
    const user = userEvent.setup();
    render(<OrgSwitcher />);

    expect(screen.getByTestId("org-switcher-trigger")).toHaveAttribute(
      "aria-expanded",
      "false"
    );
    await user.click(screen.getByTestId("org-switcher-trigger"));
    expect(screen.getByTestId("org-switcher-trigger")).toHaveAttribute(
      "aria-expanded",
      "true"
    );
  });

  it("menu items have role=menuitemradio", async () => {
    const user = userEvent.setup();
    render(<OrgSwitcher />);

    await user.click(screen.getByTestId("org-switcher-trigger"));
    const items = screen.getAllByRole("menuitemradio");
    expect(items.length).toBe(3);
  });
});
