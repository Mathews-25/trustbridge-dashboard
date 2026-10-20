import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  TrustlineGuidancePanel,
  ONBOARDING_STEPS,
} from "@/components/TrustlineGuidancePanel";

describe("TrustlineGuidancePanel Checklist Component", () => {
  it("renders all onboarding checklist steps", () => {
    render(<TrustlineGuidancePanel />);

    for (const step of ONBOARDING_STEPS) {
      const item = screen.getByTestId(`checklist-item-${step.id}`);
      expect(item).toBeInTheDocument();
      expect(within(item).getByText(step.title)).toBeInTheDocument();
    }

    expect(screen.getByTestId("checklist-progress-badge")).toHaveTextContent(
      "0/4 complete"
    );
  });

  it("reflects persisted checklist state correctly", () => {
    const checklistCompleted = {
      choose_wallet: true,
      fund_wallet: true,
    };

    render(
      <TrustlineGuidancePanel checklistCompleted={checklistCompleted} />
    );

    const step1 = screen.getByTestId("checklist-item-choose_wallet");
    const step2 = screen.getByTestId("checklist-item-fund_wallet");
    const step3 = screen.getByTestId("checklist-item-add_trustline");

    expect(step1).toHaveAttribute("data-checked", "true");
    expect(step2).toHaveAttribute("data-checked", "true");
    expect(step3).toHaveAttribute("data-checked", "false");

    expect(screen.getByTestId("checklist-progress-badge")).toHaveTextContent(
      "2/4 complete"
    );
  });

  it("calls onToggleStep when user checks an item", async () => {
    const user = userEvent.setup();
    const handleToggle = vi.fn();

    render(
      <TrustlineGuidancePanel
        checklistCompleted={{ choose_wallet: false }}
        onToggleStep={handleToggle}
      />
    );

    const step1 = screen.getByTestId("checklist-item-choose_wallet");
    await user.click(step1);

    expect(handleToggle).toHaveBeenCalledWith("choose_wallet", true);
  });

  it("displays 4/4 complete when all steps are completed", () => {
    const checklistCompleted = {
      choose_wallet: true,
      fund_wallet: true,
      add_trustline: true,
      register_address: true,
    };

    render(
      <TrustlineGuidancePanel checklistCompleted={checklistCompleted} />
    );

    expect(screen.getByTestId("checklist-progress-badge")).toHaveTextContent(
      "4/4 complete"
    );
  });
});
