"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Accessible confirmation dialog (issue #155).
 *
 * Exports can dump contributor PII, so the confirmation in front of them has to
 * actually work for everyone: keyboard users must be able to reach the buttons
 * and get out with ESC, and screen-reader users must be told what they are
 * confirming. `window.confirm()` gave us that for free but cannot carry a stale
 * data warning or a row count — this does, and implements the same guarantees
 * by hand:
 *
 *   • `role="alertdialog"` + `aria-modal`, labelled by the title and described
 *     by the body, so the whole prompt is announced on open.
 *   • Focus moves to the cancel button on open — the safe default when the
 *     confirm button is the one that leaks data.
 *   • Tab and Shift+Tab cycle inside the dialog and cannot escape to the page
 *     behind it.
 *   • ESC cancels, and focus returns to whatever opened the dialog.
 *   • Confirm fires at most once per opening, even on a double click or a
 *     keyboard repeat.
 *
 * This is deliberately not a modal library: one dialog, no portal, no
 * dependencies. If a second modal pattern shows up, revisit it then.
 */

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** What the viewer is about to do, in a sentence. Announced on open. */
  description: React.ReactNode;
  /** Optional warning callout — e.g. the stale-export warning. */
  warning?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Style the confirm button as destructive. */
  destructive?: boolean;
  /** Disables both buttons and shows the confirm button as busy. */
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  className?: string;
}

export function ConfirmDialog({
  open,
  title,
  description,
  warning,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  pending = false,
  onConfirm,
  onCancel,
  className,
}: ConfirmDialogProps) {
  const titleId = React.useId();
  const descriptionId = React.useId();
  const dialogRef = React.useRef<HTMLDivElement | null>(null);
  const cancelRef = React.useRef<HTMLButtonElement | null>(null);
  const openerRef = React.useRef<HTMLElement | null>(null);
  // Guards the double submit: a second confirm before the parent has closed
  // the dialog would fire a second export.
  const confirmedRef = React.useRef(false);

  // Remember the opener, move focus in, and put it back on close.
  React.useEffect(() => {
    if (!open) return;

    confirmedRef.current = false;
    openerRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    cancelRef.current?.focus();

    return () => {
      openerRef.current?.focus();
    };
  }, [open]);

  function handleConfirm() {
    if (pending || confirmedRef.current) return;
    confirmedRef.current = true;
    onConfirm();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      // ESC always works, even mid-flight: the parent decides whether an
      // in-progress export can actually be abandoned.
      onCancel();
      return;
    }

    if (event.key !== "Tab") return;

    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []
    ).filter((element) => !element.hasAttribute("aria-hidden"));

    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && (active === first || !dialogRef.current?.contains(active))) {
      event.preventDefault();
      last.focus();
      return;
    }

    if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/60 p-4 sm:items-center"
      // Clicking the backdrop is the same as cancelling; the dialog itself
      // stops the click so an in-dialog click never dismisses.
      onMouseDown={onCancel}
      data-testid="confirm-dialog-backdrop"
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onKeyDown={handleKeyDown}
        onMouseDown={(event) => event.stopPropagation()}
        className={cn(
          "w-full max-w-md rounded-xl border border-border-strong bg-card p-6 text-card-foreground shadow-xl",
          className
        )}
        data-testid="confirm-dialog"
      >
        <h2 id={titleId} className="text-lg font-semibold">
          {title}
        </h2>

        <div id={descriptionId} className="mt-2 space-y-3 text-sm text-muted-foreground">
          <div>{description}</div>

          {warning && (
            <div
              className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-amber-800 dark:border-amber-600 dark:bg-amber-950/40 dark:text-amber-200"
              data-testid="confirm-dialog-warning"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <div>{warning}</div>
            </div>
          )}
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            ref={cancelRef}
            type="button"
            variant="outline"
            onClick={onCancel}
            // Never disabled: an in-flight export must not trap the keyboard
            // user inside the dialog with no way out but the confirm button.
            data-testid="confirm-dialog-cancel"
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={destructive ? "destructive" : "stellar"}
            onClick={handleConfirm}
            disabled={pending}
            data-testid="confirm-dialog-confirm"
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
