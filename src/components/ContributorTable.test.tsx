import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/csv", async () => {
  const actual = await vi.importActual<typeof import("@/lib/csv")>(
    "@/lib/csv"
  );

  return {
    ...actual,
    buildCsvFilename: vi.fn(() => "trustbridge-wave-2026-07-26.csv"),
    downloadCsv: vi.fn(),
    // jsdom has no URL.createObjectURL, and the JSON export path now runs for
    // real once the confirmation dialog is accepted.
    buildJsonFilename: vi.fn(() => "trustbridge-wave-2026-07-26.json"),
    downloadJson: vi.fn(),
  };
});

import {
  ContributorTable,
  exportContributorsCsv,
} from "@/components/ContributorTable";
import { downloadCsv } from "@/lib/csv";
import type { ContributorRow } from "@/types";

describe("ContributorTable", () => {
  const contributors: ContributorRow[] = [
    {
      id: "row-1",
      githubUsername: "alice",
      stellarAddress: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      funded: true,
      trustlineReady: true,
      trustlineAuthorized: true,
      verified: true,
      xlmBalance: "10",
      spendableXlmBalance: "8",
      readiness: "ready",
      lastCheckedAt: "2026-07-26T09:00:00.000Z",
    },
    {
      id: "row-2",
      githubUsername: "bob",
      stellarAddress: "GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
      funded: true,
      trustlineReady: false,
      trustlineAuthorized: false,
      verified: false,
      xlmBalance: "2",
      spendableXlmBalance: "0.2",
      readiness: "not_ready",
      lastCheckedAt: "2026-07-26T09:00:00.000Z",
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("empty states", () => {
    it("shows a loading state instead of an empty state while data is loading", () => {
      render(<ContributorTable contributors={[]} isLoading />);

      expect(screen.getByTestId("contributors-loading")).toBeInTheDocument();
      expect(
        screen.queryByTestId("contributors-zero-empty")
      ).not.toBeInTheDocument();
    });

    it("shows a zero-contributors empty state with maintainer next actions", () => {
      render(<ContributorTable contributors={[]} viewerRole="maintainer" />);

      const emptyState = screen.getByTestId("contributors-zero-empty");
      expect(emptyState).toHaveTextContent(/No contributors registered yet/i);
      expect(emptyState).toHaveTextContent(/Share the registration link/i);
      expect(
        screen.getByRole("link", { name: /Open register page/i })
      ).toHaveAttribute("href", "/register");
      expect(
        screen.getByRole("button", { name: /Copy register link/i })
      ).toBeInTheDocument();
    });

    it("shows contributor-specific copy in the zero-contributors empty state", () => {
      render(<ContributorTable contributors={[]} viewerRole="contributor" />);

      const emptyState = screen.getByTestId("contributors-zero-empty");
      expect(emptyState).toHaveTextContent(/You are not registered yet/i);
      expect(emptyState).toHaveTextContent(/Register your Stellar payout address/i);
      expect(
        screen.getByRole("link", { name: /Register now/i })
      ).toHaveAttribute("href", "/register");
      expect(
        screen.queryByRole("button", { name: /Copy register link/i })
      ).not.toBeInTheDocument();
    });

    it("distinguishes search-empty from zero-contributors empty", async () => {
      const user = userEvent.setup();
      render(<ContributorTable contributors={contributors} />);

      const searchInput = screen.getByLabelText(
        /Search contributors by GitHub username or Stellar address/i
      );
      await user.type(searchInput, "zzz_no_match");

      expect(screen.getAllByTestId("contributors-filtered-empty")[0]).toHaveTextContent(
        /No contributors match "zzz_no_match"/i
      );
      expect(
        screen.queryByTestId("contributors-zero-empty")
      ).not.toBeInTheDocument();
    });

    it("distinguishes filter-empty from zero-contributors empty", async () => {
      const user = userEvent.setup();
      render(<ContributorTable contributors={contributors} />);

      await user.click(screen.getByRole("button", { name: /^Low reserve$/i }));

      expect(screen.getAllByTestId("contributors-filtered-empty")[0]).toHaveTextContent(
        /No contributors match this filter/i
      );
      expect(
        screen.queryByTestId("contributors-zero-empty")
      ).not.toBeInTheDocument();
    });
  });

  it("renders accessible table controls and row diagnostics", () => {
    render(<ContributorTable contributors={contributors} />);

    expect(
      screen.getByLabelText(/Search contributors by GitHub username or Stellar address/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Contributor payout readiness table with per-row Horizon debug details/i)
    ).toBeInTheDocument();
    expect(screen.getAllByText("Horizon debug").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("columnheader", { name: /GitHub/i })
    ).toHaveAttribute("aria-sort", "ascending");
  });

  it("opens the command palette and applies keyboard commands", async () => {
    const user = userEvent.setup();
    render(<ContributorTable contributors={contributors} onExport={vi.fn()} />);

    await user.keyboard("{Control>}k{/Control}");
    const palette = screen.getByRole("dialog", { name: /command palette/i });
    expect(palette).toBeInTheDocument();

    const readyButtonInPalette = within(palette).getByRole("button", { name: "Ready" });
    await user.click(readyButtonInPalette);
    expect(screen.getByRole("button", { name: /^Ready$/i })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    await user.keyboard("{Control>}k{/Control}");
    await user.click(screen.getByRole("button", { name: /Focus table search/i }));
    expect(screen.getByLabelText(/Search contributors by GitHub username/i)).toHaveFocus();
  });

  it("routes palette export through the existing confirmation dialog", async () => {
    const user = userEvent.setup();
    render(<ContributorTable contributors={contributors} onExport={vi.fn()} />);

    await user.keyboard("{Control>}k{/Control}");
    await user.click(screen.getByRole("button", { name: "Export CSV" }));

    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Download CSV/i })).toBeInTheDocument();
  });

  it("exports derived proof and horizon debug details", () => {
    const exported = exportContributorsCsv(contributors, true);

    expect(exported).toBe(true);
    expect(downloadCsv).toHaveBeenCalledTimes(1);
    expect(vi.mocked(downloadCsv).mock.calls[0][1]).toContain(
      "TrustBridge Freighter ownership proof"
    );
    expect(vi.mocked(downloadCsv).mock.calls[0][1]).toContain(
      "Required USDC trustline is missing."
    );
  });

  // ── Export confirmation (issue #155) ────────────────────────────────────

  describe("export confirmation dialog", () => {
    /** `bob` was checked long enough ago to be stale in every test run. */
    const staleContributors: ContributorRow[] = [
      contributors[0],
      { ...contributors[1], lastCheckedAt: null },
    ];

    it("does not export until the confirmation is accepted", async () => {
      const user = userEvent.setup();
      const onExport = vi.fn();
      render(
        <ContributorTable contributors={contributors} onExport={onExport} />
      );

      await user.click(screen.getByRole("button", { name: /Export CSV/i }));

      expect(onExport).not.toHaveBeenCalled();
      expect(screen.getByRole("alertdialog")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /Download CSV/i }));
      expect(onExport).toHaveBeenCalledTimes(1);
    });

    it("does not export when the confirmation is cancelled", async () => {
      const user = userEvent.setup();
      const onExport = vi.fn();
      render(
        <ContributorTable contributors={contributors} onExport={onExport} />
      );

      await user.click(screen.getByRole("button", { name: /Export CSV/i }));
      await user.keyboard("{Escape}");

      expect(onExport).not.toHaveBeenCalled();
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });

    it("returns focus to the export button after cancelling", async () => {
      const user = userEvent.setup();
      render(
        <ContributorTable contributors={contributors} onExport={vi.fn()} />
      );

      const exportButton = screen.getByRole("button", { name: /Export CSV/i });
      await user.click(exportButton);
      await user.keyboard("{Escape}");

      expect(exportButton).toHaveFocus();
    });

    it("names the row count and the PII in the confirmation", async () => {
      const user = userEvent.setup();
      render(
        <ContributorTable contributors={contributors} onExport={vi.fn()} />
      );

      await user.click(screen.getByRole("button", { name: /Export CSV/i }));

      const dialog = screen.getByRole("alertdialog");
      expect(dialog).toHaveTextContent(/2 contributors/i);
      expect(dialog).toHaveTextContent(/personal data/i);
    });

    it("carries the stale-data warning into the dialog", async () => {
      const user = userEvent.setup();
      render(
        <ContributorTable contributors={staleContributors} onExport={vi.fn()} />
      );

      await user.click(
        screen.getByRole("button", { name: /Export CSV \(stale\)/i })
      );

      const dialog = screen.getByRole("alertdialog");
      expect(dialog).toHaveTextContent(/have not been verified/i);
      expect(dialog).toHaveTextContent(/may cause payout failures/i);
    });

    it("does not re-prompt with window.confirm once the dialog was accepted", async () => {
      // The dialog already showed the staleness warning, so the export runs
      // forced — a second native prompt is exactly the friction that gets
      // confirmations clicked through without reading.
      const user = userEvent.setup();
      const confirmSpy = vi
        .spyOn(window, "confirm")
        .mockReturnValue(true);

      render(
        <ContributorTable contributors={staleContributors} onExport={vi.fn()} />
      );

      await user.click(
        screen.getByRole("button", { name: /Export JSON \(stale\)/i })
      );
      await user.click(screen.getByRole("button", { name: /Download JSON/i }));

      expect(confirmSpy).not.toHaveBeenCalled();
      confirmSpy.mockRestore();
    });

    it("confirms the JSON export separately from the CSV export", async () => {
      const user = userEvent.setup();
      render(
        <ContributorTable contributors={contributors} onExport={vi.fn()} />
      );

      await user.click(screen.getByRole("button", { name: /Export JSON/i }));

      expect(
        screen.getByRole("button", { name: /Download JSON/i })
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /Download CSV/i })
      ).not.toBeInTheDocument();
    });
  });

  describe("ban and unban confirmation dialog", () => {
    const bannedContributor: ContributorRow = {
      ...contributors[0],
      banned: true,
      banReason: "Policy violation",
    };

    it("requires confirmation to ban and leaves the contributor unchanged when cancelled", async () => {
      const user = userEvent.setup();
      const onBanToggle = vi.fn().mockResolvedValue(undefined);
      render(
        <ContributorTable
          contributors={contributors}
          onBanToggle={onBanToggle}
        />
      );

      const banButton = screen.getByRole("button", { name: "Ban alice" });
      await user.click(banButton);

      let dialog = screen.getByRole("alertdialog");
      expect(dialog).toHaveTextContent(/reject all current and future registration or recheck attempts/i);
      expect(onBanToggle).not.toHaveBeenCalled();
      await user.type(screen.getByTestId("ban-reason-input"), "Policy violation");
      await user.click(screen.getByRole("button", { name: "Cancel" }));

      expect(onBanToggle).not.toHaveBeenCalled();
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
      expect(banButton).toHaveTextContent("Ban");
      expect(screen.queryByTestId("banned-badge-alice")).not.toBeInTheDocument();

      await user.click(banButton);
      await user.type(screen.getByTestId("ban-reason-input"), "Policy violation");
      await user.click(screen.getByRole("button", { name: "Confirm Ban" }));

      await waitFor(() =>
        expect(onBanToggle).toHaveBeenCalledWith(
          "alice",
          "ban",
          "Policy violation"
        )
      );
    });

    it("requires confirmation to unban and leaves the contributor banned when cancelled", async () => {
      const user = userEvent.setup();
      const onBanToggle = vi.fn().mockResolvedValue(undefined);
      render(
        <ContributorTable
          contributors={[bannedContributor]}
          onBanToggle={onBanToggle}
        />
      );

      const unbanButton = screen.getByRole("button", { name: "Unban alice" });
      await user.click(unbanButton);

      const dialog = screen.getByRole("alertdialog");
      expect(dialog).toHaveTextContent(/removes this GitHub account from the ban list/i);
      expect(dialog).toHaveTextContent(/allows future registration and re-check attempts/i);
      expect(onBanToggle).not.toHaveBeenCalled();
      await user.click(screen.getByRole("button", { name: "Cancel" }));

      expect(onBanToggle).not.toHaveBeenCalled();
      expect(screen.getByTestId("banned-badge-alice")).toBeInTheDocument();
      expect(unbanButton).toHaveTextContent("Unban");

      await user.click(unbanButton);
      await user.click(screen.getByRole("button", { name: "Confirm Unban" }));

      await waitFor(() =>
        expect(onBanToggle).toHaveBeenCalledWith("alice", "unban", undefined)
      );
    });
  });
});
