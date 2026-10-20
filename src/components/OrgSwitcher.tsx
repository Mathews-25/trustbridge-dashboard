"use client";

import * as React from "react";
import { Building2, ChevronDown, Check, Loader2 } from "lucide-react";
import { useSession } from "next-auth/react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * OrgSwitcher — lets a multi-org maintainer change their active org context
 * without re-authenticating.
 *
 * Only rendered when the session carries more than one org in `availableOrgs`.
 * Single-org maintainers and contributors see nothing.
 *
 * ## How it works
 * 1. User opens the dropdown and picks a different org.
 * 2. A POST to `/api/auth/switch-org` validates the choice server-side
 *    (the requested org must be in the JWT-baked `availableOrgs` list).
 * 3. On success, `session.update({ maintainerOrgId })` refreshes the
 *    NextAuth session cookie without a full re-login.
 * 4. The page reloads (hard navigation to `/dashboard`) so that all
 *    server-side RLS queries pick up the new `app.maintainer_org_id` setting.
 *
 * ## Edge cases
 * - While the switch is in-flight, all items are disabled and a spinner
 *   is shown on the selected item.
 * - A failed switch surfaces an inline error message and reverts the UI.
 * - If `availableOrgs` has only one entry, the component renders null.
 * - Unauthenticated / non-maintainer callers: the API returns 403 and the
 *   component hides itself.
 */
export function OrgSwitcher({ className }: { className?: string }) {
  const { data: session, update } = useSession();

  const [open, setOpen] = React.useState(false);
  const [switching, setSwitching] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const dropdownRef = React.useRef<HTMLDivElement | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const titleId = React.useId();

  const availableOrgs = session?.user?.availableOrgs ?? [];
  const activeOrg = session?.user?.maintainerOrgId ?? "default";

  // Close on outside click
  React.useEffect(() => {
    if (!open) return;

    function handleClick(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Focus the first item when the dropdown opens
  React.useEffect(() => {
    if (!open) return;

    const first = dropdownRef.current?.querySelector<HTMLButtonElement>(
      '[role="menuitemradio"]:not([disabled])'
    );
    first?.focus();
  }, [open]);

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }

    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;

    event.preventDefault();
    const items = Array.from(
      dropdownRef.current?.querySelectorAll<HTMLButtonElement>(
        '[role="menuitemradio"]:not([disabled])'
      ) ?? []
    );
    if (items.length === 0) return;

    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      event.key === "ArrowDown"
        ? (current + 1) % items.length
        : (current - 1 + items.length) % items.length;

    items[next]?.focus();
  }

  async function switchOrg(orgId: string) {
    if (orgId === activeOrg || switching) return;

    setSwitching(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/switch-org", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(body?.error ?? "Failed to switch org");
      }

      // Refresh the NextAuth session cookie with the new org.
      // `update()` calls /api/auth/session with a PATCH trigger which
      // re-runs the session callback and reissues the cookie.
      await update({ maintainerOrgId: orgId });

      setOpen(false);

      // Hard-navigate so server components and RLS re-evaluate against the
      // new org. A soft router.refresh() alone is insufficient because the
      // RLS `current_setting` is per-connection and NextAuth's session cookie
      // must propagate to middleware before re-rendering.
      window.location.assign("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Switch failed");
    } finally {
      setSwitching(false);
    }
  }

  // Only render for multi-org maintainers
  if (!session?.user?.isMaintainer || availableOrgs.length <= 1) {
    return null;
  }

  return (
    <div className={cn("relative", className)} ref={dropdownRef}>
      <Button
        ref={triggerRef}
        type="button"
        variant="outline"
        size="sm"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={`org-switcher-menu-${titleId}`}
        aria-label={`Active org: ${activeOrg}. Switch org`}
        data-testid="org-switcher-trigger"
        onClick={() => setOpen((prev) => !prev)}
        disabled={switching}
        className="flex items-center gap-1.5"
      >
        {switching ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        <span className="max-w-[8rem] truncate text-xs font-medium">
          {activeOrg}
        </span>
        <ChevronDown
          className={cn(
            "h-3 w-3 transition-transform",
            open && "rotate-180"
          )}
          aria-hidden="true"
        />
      </Button>

      {open && (
        <div
          id={`org-switcher-menu-${titleId}`}
          role="menu"
          aria-label="Switch maintainer org"
          data-testid="org-switcher-menu"
          onKeyDown={handleKeyDown}
          className={cn(
            "absolute right-0 top-full z-50 mt-1 min-w-[12rem] rounded-lg border",
            "bg-card p-1 shadow-lg"
          )}
        >
          <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Switch org
          </p>
          {availableOrgs.map((org) => {
            const isActive = org === activeOrg;
            return (
              <button
                key={org}
                type="button"
                role="menuitemradio"
                aria-checked={isActive}
                data-testid={`org-option-${org}`}
                disabled={switching}
                onClick={() => void switchOrg(org)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm",
                  "transition-colors hover:bg-muted focus:bg-muted focus:outline-none",
                  isActive && "font-medium text-foreground",
                  !isActive && "text-muted-foreground"
                )}
              >
                <Check
                  className={cn(
                    "h-3.5 w-3.5 shrink-0",
                    isActive ? "opacity-100" : "opacity-0"
                  )}
                  aria-hidden="true"
                />
                <span className="truncate">{org}</span>
              </button>
            );
          })}

          {error && (
            <p
              role="alert"
              className="mt-1 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive"
              data-testid="org-switcher-error"
            >
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
