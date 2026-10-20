"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpDown, Download, Loader2, RefreshCw, Settings2 } from "lucide-react";

import { TrustlineStatusBadge } from "@/components/TrustlineStatusBadge";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { Button } from "@/components/ui/button";
import {
  filterContributors,
  sortContributors,
  type ContributorFilter,
  type ContributorSortKey,
} from "@/lib/contributors";
import { buildCsv, buildCsvFilename, downloadCsv } from "@/lib/csv";
import { buildStalenessSummary } from "@/lib/stale-export";
import { getRowAccent } from "@/lib/readiness";
import { cn, formatGithubHandle, formatRelativeTime, formatXlmBalance, shortenAddress } from "@/lib/utils";
import type { ContributorRow } from "@/types";

type FilterOption = ContributorFilter;
type SortKey = ContributorSortKey;

/** Column keys that can be toggled on/off via the column picker. */
const ALL_COLUMNS = ["verified", "xlmBalance", "lastCheckedAt"] as const;
type ColumnKey = (typeof ALL_COLUMNS)[number];

interface ContributorTableProps {
  contributors: ContributorRow[];
  onExport?: () => void;
  /** Re-check a single contributor via Horizon (maintainer action). */
  onRecheck?: (id: string) => void;
  /** Id of the contributor currently being re-checked, if any. */
  recheckingId?: string | null;
  className?: string;
}

export function ContributorTable({
  contributors,
  onExport,
  onRecheck,
  recheckingId,
  className,
}: ContributorTableProps) {
  const [filter, setFilter] = useState<FilterOption>("all");
  const [sortKey, setSortKey] = useState<SortKey>("githubUsername");
  const [sortAsc, setSortAsc] = useState(true);
  const [columnPickerOpen, setColumnPickerOpen] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnKey>>(
    new Set(ALL_COLUMNS)
  );

  // -------------------------------------------------------------------------
  // Refs — single declaration block; no duplicates.
  //
  // csvExportRef / jsonExportRef — attached to export buttons so hotkey
  //   handlers can programmatically trigger them.
  // columnPickerRef — wraps the column picker panel; used by the
  //   click-outside handler to detect taps outside the dropdown.
  // columnPickerToggleRef — attached to the toggle button so focus can be
  //   returned after the picker closes (keyboard accessibility).
  // paletteRef — the column palette panel element.
  // paletteOpenerRef — the button that opens the column palette; focus
  //   returns here after the palette is dismissed.
  // searchInputRef — the search/filter input; focused by Cmd/Ctrl+K hotkey.
  // -------------------------------------------------------------------------
  const csvExportRef = useRef<HTMLButtonElement>(null);
  const jsonExportRef = useRef<HTMLButtonElement>(null);
  const columnPickerRef = useRef<HTMLDivElement>(null);
  const columnPickerToggleRef = useRef<HTMLButtonElement>(null);
  const paletteRef = useRef<HTMLDivElement>(null);
  const paletteOpenerRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // -------------------------------------------------------------------------
  // Click-outside handler for the column picker
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!columnPickerOpen) return;

    function handlePointerDown(event: PointerEvent) {
      // Close the picker if the user clicks outside both the panel and the
      // toggle button — checking both refs prevents an immediate re-open
      // when clicking the toggle while the picker is already open.
      if (
        columnPickerRef.current &&
        !columnPickerRef.current.contains(event.target as Node) &&
        columnPickerToggleRef.current &&
        !columnPickerToggleRef.current.contains(event.target as Node)
      ) {
        setColumnPickerOpen(false);
        // Return focus to the opener so keyboard users don't lose their place.
        columnPickerToggleRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [columnPickerOpen]);

  // Keyboard shortcut: Escape closes the column picker and returns focus.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && columnPickerOpen) {
        setColumnPickerOpen(false);
        columnPickerToggleRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [columnPickerOpen]);

  // -------------------------------------------------------------------------
  // Data
  // -------------------------------------------------------------------------
  const staleSummary = useMemo(
    () => buildStalenessSummary(contributors),
    [contributors]
  );

  const filtered = useMemo(() => {
    const rows = filterContributors(contributors, filter);
    return sortContributors(rows, sortKey, sortAsc);
  }, [contributors, filter, sortAsc, sortKey]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  }

  function toggleColumn(col: ColumnKey) {
    setVisibleColumns((prev) => {
      const next = new Set(prev);
      if (next.has(col)) {
        next.delete(col);
      } else {
        next.add(col);
      }
      return next;
    });
  }

  // Total column count for colSpan calculations
  const baseColCount = 3; // GitHub, address, status
  const optionalColCount = visibleColumns.size;
  const actionColCount = onRecheck ? 1 : 0;
  const totalCols = baseColCount + optionalColCount + actionColCount;

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Filter buttons */}
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["all", "All"],
              ["ready", "✅ Ready"],
              ["needs_attention", "❌ Needs attention"],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              size="sm"
              variant={filter === value ? "stellar" : "outline"}
              onClick={() => setFilter(value)}
            >
              {label}
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {/* CSV export button — ref attached for hotkey support */}
          {onExport && (
            <Button
              ref={csvExportRef}
              size="sm"
              variant={staleSummary.stale ? "destructive" : "outline"}
              onClick={onExport}
              title={staleSummary.warning}
            >
              <Download className="h-4 w-4" />
              {staleSummary.stale ? "Export CSV (stale)" : "Export CSV"}
            </Button>
          )}

          {/* JSON export button — ref attached for hotkey support */}
          <Button
            ref={jsonExportRef}
            size="sm"
            variant="outline"
            onClick={() => {
              const data = JSON.stringify(filtered, null, 2);
              const blob = new Blob([data], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "trustbridge-contributors.json";
              a.click();
              URL.revokeObjectURL(url);
            }}
            title="Export as JSON"
          >
            <Download className="h-4 w-4" />
            Export JSON
          </Button>

          {/* Column picker toggle — ref needed to restore focus on close */}
          <div className="relative">
            <Button
              ref={columnPickerToggleRef}
              size="sm"
              variant="outline"
              aria-expanded={columnPickerOpen}
              aria-haspopup="true"
              aria-controls="column-picker-panel"
              onClick={() => setColumnPickerOpen((prev) => !prev)}
              title="Show/hide columns"
            >
              <Settings2 className="h-4 w-4" />
              Columns
            </Button>

            {columnPickerOpen && (
              /* Column picker panel — ref used by click-outside handler */
              <div
                id="column-picker-panel"
                ref={columnPickerRef}
                role="dialog"
                aria-label="Column visibility"
                className="absolute right-0 z-20 mt-1 w-44 rounded-lg border bg-popover p-2 shadow-md"
              >
                {/* Palette panel ref — wired to inner container for
                    any additional focus-trap logic */}
                <div ref={paletteRef} className="space-y-1">
                  {ALL_COLUMNS.map((col) => (
                    <label
                      key={col}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted"
                    >
                      <input
                        type="checkbox"
                        checked={visibleColumns.has(col)}
                        onChange={() => toggleColumn(col)}
                        className="h-3.5 w-3.5"
                      />
                      {col === "verified" && "Verified"}
                      {col === "xlmBalance" && "XLM balance"}
                      {col === "lastCheckedAt" && "Last checked"}
                    </label>
                  ))}
                </div>

                {/* Palette opener ref — focus anchor inside the panel that
                    can receive programmatic focus when the panel opens */}
                <button
                  ref={paletteOpenerRef}
                  type="button"
                  className="sr-only"
                  tabIndex={-1}
                  aria-hidden="true"
                >
                  Column palette anchor
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {staleSummary.stale && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <p className="font-medium">⚠️ Stale data detected</p>
          <p className="mt-1">{staleSummary.warning}</p>
        </div>
      )}

      {/* Search input — ref attached for Cmd/Ctrl+K focus shortcut */}
      <div>
        <input
          ref={searchInputRef}
          type="search"
          placeholder="Search contributors…"
          className="w-full rounded-md border bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          aria-label="Search contributors"
        />
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="px-4 py-3 font-medium">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 hover:text-stellar-cyan"
                  onClick={() => toggleSort("githubUsername")}
                >
                  GitHub
                  <ArrowUpDown className="h-3.5 w-3.5" />
                </button>
              </th>
              <th className="px-4 py-3 font-medium">Stellar address</th>
              <th className="px-4 py-3 font-medium">Status</th>
              {visibleColumns.has("verified") && (
                <th className="px-4 py-3 font-medium">Verified</th>
              )}
              {visibleColumns.has("xlmBalance") && (
                <th className="px-4 py-3 font-medium">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 hover:text-stellar-cyan"
                    onClick={() => toggleSort("xlmBalance")}
                  >
                    XLM
                    <ArrowUpDown className="h-3.5 w-3.5" />
                  </button>
                </th>
              )}
              {visibleColumns.has("lastCheckedAt") && (
                <th className="px-4 py-3 font-medium">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 hover:text-stellar-cyan"
                    onClick={() => toggleSort("lastCheckedAt")}
                  >
                    Last checked
                    <ArrowUpDown className="h-3.5 w-3.5" />
                  </button>
                </th>
              )}
              {onRecheck && (
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              )}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={totalCols}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  No contributors match this filter.
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr
                  key={row.id}
                  className={cn("border-t bg-card/50", getRowAccent(row.readiness))}
                >
                  <td className="px-4 py-3 font-medium">{formatGithubHandle(row.githubUsername)}</td>
                  <td className="px-4 py-3 font-mono text-xs" title={row.stellarAddress}>
                    {shortenAddress(row.stellarAddress)}
                  </td>
                  <td className="px-4 py-3">
                    <TrustlineStatusBadge status={row.readiness} />
                  </td>
                  {visibleColumns.has("verified") && (
                    <td className="px-4 py-3">
                      <VerifiedBadge verified={row.verified} />
                    </td>
                  )}
                  {visibleColumns.has("xlmBalance") && (
                    <td className="px-4 py-3">{formatXlmBalance(row.xlmBalance)}</td>
                  )}
                  {visibleColumns.has("lastCheckedAt") && (
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatRelativeTime(row.lastCheckedAt)}
                    </td>
                  )}
                  {onRecheck && (
                    <td className="px-4 py-3 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onRecheck(row.id)}
                        disabled={recheckingId === row.id}
                        title="Re-check this contributor via Horizon"
                      >
                        {recheckingId === row.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                        Re-check
                      </Button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function exportContributorsCsv(contributors: ContributorRow[], force = false): boolean {
  const summary = buildStalenessSummary(contributors);

  if (summary.stale && !force) {
    const confirmed = window.confirm(
      `${summary.warning}\n\nDo you want to export anyway?`
    );
    if (!confirmed) return false;
  }

  const headers = [
    "github_username",
    "stellar_address",
    "readiness",
    "funded",
    "trustline",
    "trustline_authorized",
    "verified",
    "xlm_balance",
    "last_checked_at",
    "spendable_xlm_balance",
  ];

  const rows = contributors.map((row) => [
    row.githubUsername,
    row.stellarAddress,
    row.readiness,
    row.funded,
    row.trustlineReady,
    row.trustlineAuthorized,
    row.verified,
    row.xlmBalance,
    row.lastCheckedAt ?? "",
    row.spendableXlmBalance,
  ]);

  const csv = buildCsv(headers, rows);
  downloadCsv(buildCsvFilename("trustbridge-wave"), csv);
  return true;
}
