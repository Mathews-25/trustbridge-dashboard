import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WavePrepWorkspace } from "./WavePrepWorkspace";
import type { ContributorRow } from "@/types";

describe("WavePrepWorkspace", () => {
  const mockContributors: ContributorRow[] = [
    {
      id: "1",
      githubUsername: "alice",
      stellarAddress: "GA1234567890ABCDEF",
      funded: true,
      trustlineReady: true,
      trustlineAuthorized: true,
      verified: true,
      xlmBalance: "100.5",
      spendableXlmBalance: "99.5",
      readiness: "ready",
      lastCheckedAt: "2026-07-25T10:00:00Z",
    },
    {
      id: "2",
      githubUsername: "bob",
      stellarAddress: "GB1234567890ABCDEF",
      funded: true,
      trustlineReady: true,
      trustlineAuthorized: true,
      verified: true,
      xlmBalance: "50.0",
      spendableXlmBalance: "1.0",
      readiness: "low_reserve",
      lastCheckedAt: "2026-07-24T10:00:00Z",
    },
    {
      id: "3",
      githubUsername: "charlie",
      stellarAddress: "GC1234567890ABCDEF",
      funded: false,
      trustlineReady: false,
      trustlineAuthorized: false,
      verified: false,
      xlmBalance: "0.0",
      spendableXlmBalance: "0.0",
      readiness: "not_ready",
      lastCheckedAt: null,
    },
  ];

  it("should render Wave prep workspace with title", () => {
    render(<WavePrepWorkspace contributors={mockContributors} />);
    expect(screen.getByText(/Wave Prep Workspace/i)).toBeInTheDocument();
  });

  it("should display correct stats", () => {
    render(<WavePrepWorkspace contributors={mockContributors} />);

    expect(screen.getByText("Total Contributors")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^Ready \(1\)$/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^Low Reserve \(1\)$/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^Not Ready \(1\)$/i })
    ).toBeInTheDocument();
  });

  it("should display wave number if provided", () => {
    render(
      <WavePrepWorkspace contributors={mockContributors} waveNumber={5} />
    );
    expect(screen.getByText("Wave 5 Prep Workspace")).toBeInTheDocument();
  });

  it("should filter contributors by readiness status", () => {
    render(<WavePrepWorkspace contributors={mockContributors} />);

    const lowReserveButton = screen.getByRole("button", {
      name: /^Low Reserve \(1\)$/i,
    });

    fireEvent.click(lowReserveButton);

    // After clicking low reserve (toggle off), it should show fewer selected
    expect(
      screen.getByText((_, el) =>
        Boolean(
          el?.tagName === "P" &&
            el.textContent?.replace(/\s+/g, " ").includes("Filtered: 2 of 3")
        )
      )
    ).toBeInTheDocument();
  });

  it("should call onExportCsv only after the confirmation is accepted", () => {
    const onExportCsv = vi.fn();
    render(
      <WavePrepWorkspace
        contributors={mockContributors}
        onExportCsv={onExportCsv}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Export CSV/i }));

    // The click opens the confirmation; nothing has downloaded yet.
    expect(onExportCsv).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Download CSV/i }));
    expect(onExportCsv).toHaveBeenCalledTimes(1);
  });

  it("should call onExportJson only after the confirmation is accepted", () => {
    const onExportJson = vi.fn();
    render(
      <WavePrepWorkspace
        contributors={mockContributors}
        onExportJson={onExportJson}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Export JSON/i }));

    expect(onExportJson).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Download JSON/i }));
    expect(onExportJson).toHaveBeenCalledTimes(1);
  });

  it("should not export when the confirmation is cancelled", () => {
    const onExportCsv = vi.fn();
    render(
      <WavePrepWorkspace
        contributors={mockContributors}
        onExportCsv={onExportCsv}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Export CSV/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Cancel$/i }));

    expect(onExportCsv).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("warns in the dialog when the selected rows are stale", () => {
    // `charlie` has never been checked, so the selection is stale.
    render(<WavePrepWorkspace contributors={mockContributors} onExportCsv={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /Export CSV/i }));

    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent(/have not been verified/i);
    expect(dialog).toHaveTextContent(/personal data/i);
  });

  it("should disable export buttons when isExporting is true", () => {
    render(
      <WavePrepWorkspace contributors={mockContributors} isExporting={true} />
    );

    const csvButton = screen.getByRole("button", {
      name: /Export CSV/i,
    }) as HTMLButtonElement;

    const jsonButton = screen.getByRole("button", {
      name: /Export JSON/i,
    }) as HTMLButtonElement;

    expect(csvButton.disabled).toBe(true);
    expect(jsonButton.disabled).toBe(true);
  });

  it("should disable export buttons when no contributors", () => {
    render(
      <WavePrepWorkspace contributors={[]} onExportCsv={() => {}} />
    );

    const csvButton = screen.getByRole("button", {
      name: /Export CSV/i,
    }) as HTMLButtonElement;

    expect(csvButton.disabled).toBe(true);
  });

  it("should show filtered count", () => {
    render(<WavePrepWorkspace contributors={mockContributors} />);
    expect(
      screen.getByText((_, el) =>
        Boolean(
          el?.tagName === "P" &&
            el.textContent?.replace(/\s+/g, " ").includes("Filtered: 3 of 3")
        )
      )
    ).toBeInTheDocument();
  });
});
