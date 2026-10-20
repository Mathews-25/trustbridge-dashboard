/**
 * Tests for TrustlineGuidancePanel and WalletInstallStepper (issue #295).
 *
 * Acceptance criteria:
 *   - Progress percent updates from checklist map
 *   - Step toggle calls onToggleStep when provided
 *   - Active wallet tab is keyboard-reachable
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import {
  TrustlineGuidancePanel,
  ONBOARDING_STEPS,
} from "@/components/TrustlineGuidancePanel";
import { WalletInstallStepper } from "@/components/WalletInstallStepper";

// ---------------------------------------------------------------------------
// TrustlineGuidancePanel
// ---------------------------------------------------------------------------

describe("TrustlineGuidancePanel", () => {
  it("renders the guidance card", () => {
    render(<TrustlineGuidancePanel />);
    expect(screen.getByTestId("trustline-guidance")).toBeInTheDocument();
  });

  it("shows 0/4 progress when no steps are completed", () => {
    render(<TrustlineGuidancePanel checklistCompleted={{}} />);
    expect(screen.getByTestId("checklist-progress-badge")).toHaveTextContent(
      "0/4 complete"
    );
  });

  it("shows correct count when some steps are completed", () => {
    const completed = {
      choose_wallet: true,
      fund_wallet: true,
    };
    render(<TrustlineGuidancePanel checklistCompleted={completed} />);
    expect(screen.getByTestId("checklist-progress-badge")).toHaveTextContent(
      "2/4 complete"
    );
  });

  it("shows 4/4 when all steps are completed", () => {
    const allCompleted = Object.fromEntries(
      ONBOARDING_STEPS.map((s) => [s.id, true])
    );
    render(<TrustlineGuidancePanel checklistCompleted={allCompleted} />);
    expect(screen.getByTestId("checklist-progress-badge")).toHaveTextContent(
      "4/4 complete"
    );
  });

  it("progress bar aria-valuenow reflects percentage", () => {
    // 2 of 4 steps completed → 50%
    const twoCompleted = {
      choose_wallet: true,
      fund_wallet: true,
    };
    render(<TrustlineGuidancePanel checklistCompleted={twoCompleted} />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "50");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
  });

  it("progress bar aria-valuenow is 0 when nothing completed", () => {
    render(<TrustlineGuidancePanel checklistCompleted={{}} />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "0");
  });

  it("progress bar aria-valuenow is 100 when everything completed", () => {
    const allCompleted = Object.fromEntries(
      ONBOARDING_STEPS.map((s) => [s.id, true])
    );
    render(<TrustlineGuidancePanel checklistCompleted={allCompleted} />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "100");
  });

  it("renders all four checklist items", () => {
    render(<TrustlineGuidancePanel />);
    ONBOARDING_STEPS.forEach((step) => {
      expect(
        screen.getByTestId(`checklist-item-${step.id}`)
      ).toBeInTheDocument();
    });
  });

  it("calls onToggleStep when a checkbox is changed", () => {
    const onToggle = vi.fn();
    render(
      <TrustlineGuidancePanel
        checklistCompleted={{}}
        onToggleStep={onToggle}
      />
    );
    // Click the first step checkbox
    const firstStepId = ONBOARDING_STEPS[0].id;
    const checkbox = screen.getByRole("checkbox", { hidden: true, name: /step 1/i });
    fireEvent.click(checkbox);
    expect(onToggle).toHaveBeenCalledWith(firstStepId, true);
  });

  it("calls onToggleStep with false when unchecking a completed step", () => {
    const onToggle = vi.fn();
    const firstStepId = ONBOARDING_STEPS[0].id;
    render(
      <TrustlineGuidancePanel
        checklistCompleted={{ [firstStepId]: true }}
        onToggleStep={onToggle}
      />
    );
    const checkbox = screen.getByRole("checkbox", { hidden: true, name: /step 1/i });
    fireEvent.click(checkbox);
    expect(onToggle).toHaveBeenCalledWith(firstStepId, false);
  });

  it("disables checkboxes when onToggleStep is not provided", () => {
    render(<TrustlineGuidancePanel checklistCompleted={{}} />);
    const checkboxes = screen.getAllByRole("checkbox", { hidden: true });
    checkboxes.forEach((cb) => {
      expect(cb).toBeDisabled();
    });
  });

  it("disables checkboxes while isUpdating is true", () => {
    const onToggle = vi.fn();
    render(
      <TrustlineGuidancePanel
        checklistCompleted={{}}
        onToggleStep={onToggle}
        isUpdating
      />
    );
    const checkboxes = screen.getAllByRole("checkbox", { hidden: true });
    checkboxes.forEach((cb) => {
      expect(cb).toBeDisabled();
    });
  });

  it("marks completed items with data-checked=true", () => {
    const firstStepId = ONBOARDING_STEPS[0].id;
    render(
      <TrustlineGuidancePanel checklistCompleted={{ [firstStepId]: true }} />
    );
    const item = screen.getByTestId(`checklist-item-${firstStepId}`);
    expect(item).toHaveAttribute("data-checked", "true");
  });

  it("marks uncompleted items with data-checked=false", () => {
    render(<TrustlineGuidancePanel checklistCompleted={{}} />);
    const item = screen.getByTestId(`checklist-item-${ONBOARDING_STEPS[1].id}`);
    expect(item).toHaveAttribute("data-checked", "false");
  });

  it("treats null checklistCompleted the same as empty", () => {
    render(<TrustlineGuidancePanel checklistCompleted={null} />);
    expect(screen.getByTestId("checklist-progress-badge")).toHaveTextContent(
      "0/4 complete"
    );
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "0");
  });
});

// ---------------------------------------------------------------------------
// WalletInstallStepper
// ---------------------------------------------------------------------------

describe("WalletInstallStepper", () => {
  it("renders the tablist with three wallet tabs", () => {
    render(<WalletInstallStepper />);
    const tablist = screen.getByRole("tablist");
    expect(tablist).toBeInTheDocument();
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(3);
  });

  it("has Freighter selected by default", () => {
    render(<WalletInstallStepper />);
    const freighterTab = screen.getByRole("tab", { name: /freighter/i });
    expect(freighterTab).toHaveAttribute("aria-selected", "true");
    expect(freighterTab).toHaveAttribute("tabindex", "0");
  });

  it("shows the Freighter panel by default", () => {
    render(<WalletInstallStepper />);
    const panel = screen.getByTestId("wallet-panel-freighter");
    expect(panel).not.toHaveAttribute("hidden");
  });

  it("hides non-active panels", () => {
    render(<WalletInstallStepper />);
    expect(screen.getByTestId("wallet-panel-lobstr")).toHaveAttribute("hidden");
    expect(screen.getByTestId("wallet-panel-xbull")).toHaveAttribute("hidden");
  });

  it("switches to LOBSTR panel when its tab is clicked", () => {
    render(<WalletInstallStepper />);
    const lobstrTab = screen.getByRole("tab", { name: /lobstr/i });
    fireEvent.click(lobstrTab);
    expect(lobstrTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("wallet-panel-lobstr")).not.toHaveAttribute("hidden");
    expect(screen.getByTestId("wallet-panel-freighter")).toHaveAttribute("hidden");
  });

  it("switches to xBull panel when its tab is clicked", () => {
    render(<WalletInstallStepper />);
    const xbullTab = screen.getByRole("tab", { name: /xbull/i });
    fireEvent.click(xbullTab);
    expect(xbullTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("wallet-panel-xbull")).not.toHaveAttribute("hidden");
  });

  it("active tab has tabindex=0 and inactive tabs have tabindex=-1", () => {
    render(<WalletInstallStepper />);
    const tabs = screen.getAllByRole("tab");
    const activeTab = tabs.find((t) => t.getAttribute("aria-selected") === "true");
    const inactiveTabs = tabs.filter((t) => t.getAttribute("aria-selected") !== "true");
    expect(activeTab).toHaveAttribute("tabindex", "0");
    inactiveTabs.forEach((t) => expect(t).toHaveAttribute("tabindex", "-1"));
  });

  it("ArrowRight moves focus to the next wallet tab", () => {
    render(<WalletInstallStepper />);
    const freighterTab = screen.getByRole("tab", { name: /freighter/i });
    fireEvent.keyDown(freighterTab, { key: "ArrowRight" });
    // After ArrowRight the second tab (LOBSTR) should become active
    const lobstrTab = screen.getByRole("tab", { name: /lobstr/i });
    expect(lobstrTab).toHaveAttribute("aria-selected", "true");
  });

  it("ArrowLeft wraps from first tab to last tab", () => {
    render(<WalletInstallStepper />);
    const freighterTab = screen.getByRole("tab", { name: /freighter/i });
    fireEvent.keyDown(freighterTab, { key: "ArrowLeft" });
    const xbullTab = screen.getByRole("tab", { name: /xbull/i });
    expect(xbullTab).toHaveAttribute("aria-selected", "true");
  });

  it("ArrowRight wraps from last tab to first tab", () => {
    render(<WalletInstallStepper />);
    // Move to last tab first
    const xbullTab = screen.getByRole("tab", { name: /xbull/i });
    fireEvent.click(xbullTab);
    fireEvent.keyDown(xbullTab, { key: "ArrowRight" });
    const freighterTab = screen.getByRole("tab", { name: /freighter/i });
    expect(freighterTab).toHaveAttribute("aria-selected", "true");
  });

  it("Home key moves to first tab from any position", () => {
    render(<WalletInstallStepper />);
    const xbullTab = screen.getByRole("tab", { name: /xbull/i });
    fireEvent.click(xbullTab);
    fireEvent.keyDown(xbullTab, { key: "Home" });
    const freighterTab = screen.getByRole("tab", { name: /freighter/i });
    expect(freighterTab).toHaveAttribute("aria-selected", "true");
  });

  it("End key moves to last tab from any position", () => {
    render(<WalletInstallStepper />);
    const freighterTab = screen.getByRole("tab", { name: /freighter/i });
    fireEvent.keyDown(freighterTab, { key: "End" });
    const xbullTab = screen.getByRole("tab", { name: /xbull/i });
    expect(xbullTab).toHaveAttribute("aria-selected", "true");
  });

  it("each tab panel has the correct aria-labelledby pointing to its tab", () => {
    render(<WalletInstallStepper />);
    const wallets = ["freighter", "lobstr", "xbull"];
    wallets.forEach((id) => {
      const panel = screen.getByTestId(`wallet-panel-${id}`);
      expect(panel).toHaveAttribute("aria-labelledby", `wallet-tab-${id}`);
    });
  });

  it("active panel has tabindex=0 and is keyboard-reachable", () => {
    render(<WalletInstallStepper />);
    const freighterPanel = screen.getByTestId("wallet-panel-freighter");
    expect(freighterPanel).toHaveAttribute("tabindex", "0");
  });

  it("each active panel exposes a trustline deep-link button", () => {
    render(<WalletInstallStepper />);
    // Freighter panel is active by default
    const freighterPanel = screen.getByTestId("wallet-panel-freighter");
    const link = freighterPanel.querySelector("a[aria-label]");
    expect(link).toBeTruthy();
    expect(link?.getAttribute("aria-label")).toMatch(/opens in a new tab/i);
  });
});
