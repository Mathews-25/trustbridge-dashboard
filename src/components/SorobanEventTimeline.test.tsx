import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/csv", async () => {
  const actual = await vi.importActual<typeof import("@/lib/csv")>(
    "@/lib/csv"
  );

  return {
    ...actual,
    buildCsvFilename: vi.fn(() => "trustbridge-soroban-events-2026-07-26.csv"),
    downloadCsv: vi.fn(),
  };
});

import { SorobanEventTimeline } from "@/components/SorobanEventTimeline";
import { downloadCsv } from "@/lib/csv";
import type { SorobanEventRow } from "@/types";

describe("SorobanEventTimeline", () => {
  const events: SorobanEventRow[] = [
    {
      id: "evt-1",
      type: "contract",
      ledger: 12345,
      ledgerClosedAt: "2026-07-26T09:00:00.000Z",
      contractId: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
      topic: ["register"],
      value: "alice",
      txHash: "abc123",
    },
    {
      id: "evt-2",
      type: "system",
      ledger: 12340,
      ledgerClosedAt: "2026-07-26T08:00:00.000Z",
      contractId: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
      topic: ["system"],
      value: "heartbeat",
      txHash: "def456",
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a loading state instead of an empty state while data is loading", () => {
    render(<SorobanEventTimeline events={[]} isLoading />);

    expect(screen.getByTestId("soroban-events-loading")).toBeInTheDocument();
    expect(
      screen.queryByTestId("soroban-events-zero-empty")
    ).not.toBeInTheDocument();
  });

  it("shows a zero-events empty state with next actions when there are no errors", () => {
    render(<SorobanEventTimeline events={[]} errors={[]} />);

    const emptyState = screen.getByTestId("soroban-events-zero-empty");
    expect(emptyState).toHaveTextContent(/No Soroban events yet/i);
    expect(emptyState).toHaveTextContent(/SOROBAN_CONTRACT_ID/i);
    expect(emptyState).toHaveTextContent(/SOROBAN_RPC_URL/i);
    expect(
      screen.queryByTestId("soroban-events-filtered-empty")
    ).not.toBeInTheDocument();
  });

  it("keeps error and empty states separate when loading fails", () => {
    render(
      <SorobanEventTimeline
        events={[]}
        errors={["SOROBAN_CONTRACT_ID is not configured"]}
      />
    );

    expect(screen.getByTestId("soroban-events-errors")).toHaveTextContent(
      /SOROBAN_CONTRACT_ID is not configured/i
    );
    expect(screen.getByTestId("soroban-events-error-empty")).toHaveTextContent(
      /Events could not be loaded/i
    );
    expect(
      screen.queryByTestId("soroban-events-zero-empty")
    ).not.toBeInTheDocument();
  });

  it("distinguishes filter-empty from zero-events empty", async () => {
    const user = userEvent.setup();
    render(<SorobanEventTimeline events={events} />);

    await user.click(screen.getByRole("button", { name: /^Diagnostic$/i }));

    expect(screen.getByTestId("soroban-events-filtered-empty")).toHaveTextContent(
      /No Soroban events match this filter/i
    );
    expect(
      screen.queryByTestId("soroban-events-zero-empty")
    ).not.toBeInTheDocument();
  });

  it("exports filtered events from the toolbar", async () => {
    const user = userEvent.setup();
    render(<SorobanEventTimeline events={events} />);

    await user.click(screen.getByRole("button", { name: /^Contract$/i }));
    await user.click(screen.getByRole("button", { name: /Export CSV/i }));

    expect(downloadCsv).toHaveBeenCalledTimes(1);
    expect(vi.mocked(downloadCsv).mock.calls[0][1]).toContain("evt-1");
    expect(vi.mocked(downloadCsv).mock.calls[0][1]).not.toContain("evt-2");
  });
});
