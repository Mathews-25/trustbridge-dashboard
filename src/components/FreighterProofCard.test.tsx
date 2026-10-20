import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FreighterProofCard } from "@/components/FreighterProofCard";
import { buildWalletProofInfo } from "@/lib/registration-insights";

describe("FreighterProofCard", () => {
  const proof = buildWalletProofInfo("GABC123", "gidson5");

  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
    delete window.freighterApi;
    delete window.freighter;
  });

  it("shows the fallback state and disables copying until an address is ready", () => {
    render(<FreighterProofCard proof={proof} addressReady={false} />);

    expect(
      screen.getByText(/Freighter is not detected in this browser/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Enter a Stellar address first/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Copy challenge/i })
    ).toBeDisabled();
  });

  it("copies the challenge when Freighter is detected", async () => {
    window.freighterApi = {};

    render(<FreighterProofCard proof={proof} addressReady />);

    expect(
      screen.getByText(/Freighter detected in this browser/i)
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getAllByRole("button", { name: /Copy challenge/i }).at(-1)!
    );

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        proof.challenge
      );
      expect(
        screen.getByRole("button", { name: /Copied challenge/i })
      ).toBeInTheDocument();
    });
  });

  it("signs the challenge with the detected Freighter API", async () => {
    const signMessage = vi.fn().mockResolvedValue({ signature: "signed" });
    window.freighterApi = { signMessage };

    render(<FreighterProofCard proof={proof} addressReady />);

    fireEvent.click(screen.getByRole("button", { name: /Sign challenge/i }));

    await waitFor(() => {
      expect(signMessage).toHaveBeenCalledWith(proof.challenge);
      expect(screen.getByRole("button", { name: /Challenge signed/i })).toBeInTheDocument();
    });
  });
});
