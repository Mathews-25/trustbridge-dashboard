/**
 * Tests for the cursor-pagination pager — both the hook and the UI component.
 *
 * Tests run in jsdom (see vitest.config.ts environmentMatchGlobs).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

// ── ContributorPager component tests ────────────────────────────────────────

// The component is pure — no context providers needed.
import { ContributorPager } from "@/components/ContributorPager";

describe("ContributorPager", () => {
  const noop = () => {};

  it("renders Previous and Next buttons", () => {
    render(
      <ContributorPager
        pageIndex={0}
        total={50}
        pageSize={25}
        hasMore={true}
        hasPrev={false}
        onNext={noop}
        onPrev={noop}
      />
    );

    expect(screen.getByRole("button", { name: /previous page/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /next page/i })).toBeDefined();
  });

  it("disables Previous on the first page", () => {
    render(
      <ContributorPager
        pageIndex={0}
        total={50}
        pageSize={25}
        hasMore={true}
        hasPrev={false}
        onNext={noop}
        onPrev={noop}
      />
    );

    const prevBtn = screen.getByRole("button", { name: /previous page/i });
    expect((prevBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it("enables Previous when hasPrev is true", () => {
    render(
      <ContributorPager
        pageIndex={1}
        total={50}
        pageSize={25}
        hasMore={false}
        hasPrev={true}
        onNext={noop}
        onPrev={noop}
      />
    );

    const prevBtn = screen.getByRole("button", { name: /previous page/i });
    expect((prevBtn as HTMLButtonElement).disabled).toBe(false);
  });

  it("disables Next when hasMore is false", () => {
    render(
      <ContributorPager
        pageIndex={1}
        total={25}
        pageSize={25}
        hasMore={false}
        hasPrev={true}
        onNext={noop}
        onPrev={noop}
      />
    );

    const nextBtn = screen.getByRole("button", { name: /next page/i });
    expect((nextBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it("enables Next when hasMore is true", () => {
    render(
      <ContributorPager
        pageIndex={0}
        total={100}
        pageSize={25}
        hasMore={true}
        hasPrev={false}
        onNext={noop}
        onPrev={noop}
      />
    );

    const nextBtn = screen.getByRole("button", { name: /next page/i });
    expect((nextBtn as HTMLButtonElement).disabled).toBe(false);
  });

  it("calls onNext when Next is clicked", () => {
    const onNext = vi.fn();
    render(
      <ContributorPager
        pageIndex={0}
        total={100}
        pageSize={25}
        hasMore={true}
        hasPrev={false}
        onNext={onNext}
        onPrev={noop}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /next page/i }));
    expect(onNext).toHaveBeenCalledOnce();
  });

  it("calls onPrev when Previous is clicked", () => {
    const onPrev = vi.fn();
    render(
      <ContributorPager
        pageIndex={1}
        total={100}
        pageSize={25}
        hasMore={true}
        hasPrev={true}
        onNext={noop}
        onPrev={onPrev}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /previous page/i }));
    expect(onPrev).toHaveBeenCalledOnce();
  });

  it("shows the correct range label for the first page", () => {
    render(
      <ContributorPager
        pageIndex={0}
        total={142}
        pageSize={25}
        hasMore={true}
        hasPrev={false}
        onNext={noop}
        onPrev={noop}
      />
    );

    // The range appears in both the sr-only live region and the visible span.
    const matches = screen.getAllByText(/1–25 of 142/);
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("shows the correct range label for the second page", () => {
    render(
      <ContributorPager
        pageIndex={1}
        total={142}
        pageSize={25}
        hasMore={true}
        hasPrev={true}
        onNext={noop}
        onPrev={noop}
      />
    );

    const matches = screen.getAllByText(/26–50 of 142/);
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("caps the range label at total on the last page", () => {
    render(
      <ContributorPager
        pageIndex={5}
        total={142}
        pageSize={25}
        hasMore={false}
        hasPrev={true}
        onNext={noop}
        onPrev={noop}
      />
    );

    // Page 5 (0-based): 5*25+1 = 126, min(5*25+25, 142) = min(150,142) = 142
    const matches = screen.getAllByText(/126–142 of 142/);
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("disables both buttons while loading", () => {
    render(
      <ContributorPager
        pageIndex={1}
        total={100}
        pageSize={25}
        hasMore={true}
        hasPrev={true}
        isLoading={true}
        onNext={noop}
        onPrev={noop}
      />
    );

    const prevBtn = screen.getByRole("button", { name: /previous page/i });
    const nextBtn = screen.getByRole("button", { name: /next page/i });
    expect((prevBtn as HTMLButtonElement).disabled).toBe(true);
    expect((nextBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it("has an accessible nav landmark", () => {
    render(
      <ContributorPager
        pageIndex={0}
        total={50}
        pageSize={25}
        hasMore={true}
        hasPrev={false}
        onNext={noop}
        onPrev={noop}
      />
    );

    expect(
      screen.getByRole("navigation", { name: /contributor page navigation/i })
    ).toBeDefined();
  });

  it("does not fire onNext when Next is disabled", () => {
    const onNext = vi.fn();
    render(
      <ContributorPager
        pageIndex={0}
        total={10}
        pageSize={25}
        hasMore={false}
        hasPrev={false}
        onNext={onNext}
        onPrev={noop}
      />
    );

    const nextBtn = screen.getByRole("button", { name: /next page/i });
    fireEvent.click(nextBtn);
    // Button is disabled — onClick should not fire
    expect(onNext).not.toHaveBeenCalled();
  });

  it("announces the visible range in a polite live region", () => {
    render(
      <ContributorPager
        pageIndex={1}
        total={142}
        pageSize={25}
        hasMore={true}
        hasPrev={true}
        onNext={noop}
        onPrev={noop}
      />
    );

    const liveRegion = document.querySelector("[aria-live='polite']");
    expect(liveRegion).not.toBeNull();
    expect(liveRegion).toHaveAttribute("aria-atomic", "true");
    expect(liveRegion).toHaveTextContent("Showing contributors 26–50 of 142");
  });

  it("announces the loading state in the live region", () => {
    render(
      <ContributorPager
        pageIndex={0}
        total={0}
        pageSize={25}
        hasMore={false}
        hasPrev={false}
        isLoading={true}
        onNext={noop}
        onPrev={noop}
      />
    );

    expect(document.querySelector("[aria-live='polite']")).toHaveTextContent(
      "Loading contributors…"
    );
  });

  it("supports keyboard activation for Previous and Next", async () => {
    const onNext = vi.fn();
    const onPrev = vi.fn();
    render(
      <ContributorPager
        pageIndex={1}
        total={100}
        pageSize={25}
        hasMore={true}
        hasPrev={true}
        onNext={onNext}
        onPrev={onPrev}
      />
    );

    const user = userEvent.setup();
    await user.tab();
    expect(screen.getByRole("button", { name: /previous page/i })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onPrev).toHaveBeenCalledOnce();

    await user.tab();
    expect(screen.getByRole("button", { name: /next page/i })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onNext).toHaveBeenCalledOnce();
  });
});
