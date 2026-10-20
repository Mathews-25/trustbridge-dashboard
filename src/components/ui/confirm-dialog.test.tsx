/**
 * Issue #155 — accessibility contract for the export confirmation dialog.
 *
 * These assertions are the reason the dialog exists in the first place: a
 * confirmation that cannot be dismissed with a keyboard, or that drops focus
 * into the page behind it, gets clicked through rather than read — and the
 * thing behind this one downloads contributor PII.
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";

function Harness({
  onConfirm = vi.fn(),
  onCancel,
  ...props
}: Partial<React.ComponentProps<typeof ConfirmDialog>> & {
  onConfirm?: () => void;
  onCancel?: () => void;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Export CSV
      </button>
      <button type="button">Some other page control</button>
      <ConfirmDialog
        open={open}
        title="Export contributor data as CSV?"
        description="This downloads 3 contributors to your device."
        onConfirm={() => {
          onConfirm();
        }}
        onCancel={() => {
          setOpen(false);
          onCancel?.();
        }}
        {...props}
      />
    </div>
  );
}

async function openDialog() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Export CSV" }));
  return user;
}

describe("ConfirmDialog — structure and labelling", () => {
  it("renders nothing while closed", () => {
    render(
      <ConfirmDialog
        open={false}
        title="Export?"
        description="body"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("is an aria-modal alertdialog labelled by its title and described by its body", async () => {
    render(<Harness />);
    await openDialog();

    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");

    const labelId = dialog.getAttribute("aria-labelledby");
    const describedId = dialog.getAttribute("aria-describedby");
    expect(labelId).toBeTruthy();
    expect(describedId).toBeTruthy();

    expect(document.getElementById(labelId!)).toHaveTextContent(
      "Export contributor data as CSV?"
    );
    expect(document.getElementById(describedId!)).toHaveTextContent(
      /downloads 3 contributors/i
    );
  });

  it("renders the stale-data warning inside the described region", async () => {
    render(
      <Harness warning="2 of 3 contributors have not been verified in the last 24 hour(s)." />
    );
    await openDialog();

    const dialog = screen.getByRole("alertdialog");
    const describedId = dialog.getAttribute("aria-describedby");

    // The warning has to be part of what is announced, not a visual aside.
    expect(document.getElementById(describedId!)).toHaveTextContent(
      /have not been verified/i
    );
  });

  it("omits the warning region when there is nothing stale to say", async () => {
    render(<Harness />);
    await openDialog();

    expect(
      screen.queryByTestId("confirm-dialog-warning")
    ).not.toBeInTheDocument();
  });
});

describe("ConfirmDialog — focus management", () => {
  it("moves focus to the cancel button on open", async () => {
    render(<Harness />);
    await openDialog();

    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  });

  it("returns focus to the opener when dismissed", async () => {
    render(<Harness />);
    const user = await openDialog();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("button", { name: "Export CSV" })).toHaveFocus();
  });

  it("traps Tab inside the dialog", async () => {
    render(<Harness />);
    const user = await openDialog();

    const cancel = screen.getByRole("button", { name: "Cancel" });
    const confirm = screen.getByRole("button", { name: "Confirm" });

    expect(cancel).toHaveFocus();
    await user.tab();
    expect(confirm).toHaveFocus();

    // Past the last control, focus wraps back to the first — it never reaches
    // "Some other page control" behind the dialog.
    await user.tab();
    expect(cancel).toHaveFocus();
  });

  it("traps Shift+Tab inside the dialog", async () => {
    render(<Harness />);
    const user = await openDialog();

    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();

    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Confirm" })).toHaveFocus();
  });
});

describe("ConfirmDialog — dismissal", () => {
  it("cancels on Escape and does not confirm", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<Harness onConfirm={onConfirm} onCancel={onCancel} />);
    const user = await openDialog();

    await user.keyboard("{Escape}");

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("returns focus to the opener after Escape", async () => {
    render(<Harness />);
    const user = await openDialog();

    await user.keyboard("{Escape}");

    expect(screen.getByRole("button", { name: "Export CSV" })).toHaveFocus();
  });

  it("cancels when the backdrop is clicked", async () => {
    const onCancel = vi.fn();
    render(<Harness onCancel={onCancel} />);
    await openDialog();

    const user = userEvent.setup();
    await user.click(screen.getByTestId("confirm-dialog-backdrop"));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("does not cancel when the dialog body is clicked", async () => {
    const onCancel = vi.fn();
    render(<Harness onCancel={onCancel} />);
    const user = await openDialog();

    await user.click(screen.getByRole("heading", { level: 2 }));

    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });
});

describe("ConfirmDialog — confirming", () => {
  it("calls onConfirm once when confirmed", async () => {
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);
    const user = await openDialog();

    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("can be confirmed from the keyboard", async () => {
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);
    const user = await openDialog();

    await user.tab();
    await user.keyboard("{Enter}");

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("ignores a second confirm before the dialog closes (double submit)", async () => {
    // The parent may keep the dialog open across an await; a double click or a
    // held Enter key must not fire a second export.
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Export?"
        description="body"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    );

    const user = userEvent.setup();
    const confirm = screen.getByRole("button", { name: "Confirm" });
    await user.click(confirm);
    await user.click(confirm);
    await user.click(confirm);

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("disables the confirm button while an export is in flight", async () => {
    const onConfirm = vi.fn();
    render(<Harness pending onConfirm={onConfirm} />);
    const user = await openDialog();

    const confirm = screen.getByRole("button", { name: "Confirm" });
    expect(confirm).toBeDisabled();

    await user.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("keeps cancel available while pending so the user is never trapped", async () => {
    const onCancel = vi.fn();
    render(<Harness pending onCancel={onCancel} />);
    const user = await openDialog();

    const cancel = screen.getByRole("button", { name: "Cancel" });
    expect(cancel).toBeEnabled();

    await user.click(cancel);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("uses the supplied labels", async () => {
    render(
      <Harness confirmLabel="Download CSV" cancelLabel="Keep it private" />
    );
    await openDialog();

    expect(
      screen.getByRole("button", { name: "Download CSV" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Keep it private" })
    ).toBeInTheDocument();
  });
});
