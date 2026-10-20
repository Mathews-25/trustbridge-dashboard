"use client";

import { useMemo, useState } from "react";
import { Activity, Download, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buildCsv, buildCsvFilename, downloadCsv } from "@/lib/csv";
import {
  filterSorobanEvents,
  sortSorobanEventsByLedger,
  SOROBAN_EVENT_FILTERS,
  type SorobanEventFilter,
} from "@/lib/soroban-events";
import { cn, formatRelativeTime, shortenAddress } from "@/lib/utils";
import type { SorobanEventRow } from "@/types";

interface SorobanEventTimelineProps {
  events: SorobanEventRow[];
  errors?: string[];
  isLoading?: boolean;
  className?: string;
}

const FILTER_LABELS: Record<SorobanEventFilter, string> = {
  all: "All",
  contract: "Contract",
  system: "System",
  diagnostic: "Diagnostic",
};

const TYPE_BADGE_VARIANT: Record<
  SorobanEventRow["type"],
  "ready" | "warning" | "secondary"
> = {
  contract: "ready",
  system: "secondary",
  diagnostic: "warning",
};

function SorobanEventsZeroEmptyState() {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="soroban-events-zero-empty"
      className="rounded-xl border border-dashed bg-muted/20 px-6 py-12 text-center"
    >
      <Activity
        className="mx-auto h-10 w-10 text-muted-foreground"
        aria-hidden="true"
      />
      <h3 className="mt-4 text-lg font-semibold">No Soroban events yet</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        The registry contract is configured, but no events were returned from
        the recent ledger window.
      </p>
      <p className="mx-auto mt-3 max-w-md text-sm font-medium">
        What to do next: wait for contributor registrations to mirror on-chain,
        or verify <code className="text-xs">SOROBAN_CONTRACT_ID</code> points
        at the correct contract on the same network as{" "}
        <code className="text-xs">SOROBAN_RPC_URL</code>.
      </p>
    </div>
  );
}

function SorobanEventsErrorEmptyState() {
  return (
    <div
      role="status"
      data-testid="soroban-events-error-empty"
      className="px-4 py-8 text-center text-sm text-muted-foreground"
    >
      Events could not be loaded. Resolve the errors above, then refresh the
      timeline.
    </div>
  );
}

function SorobanEventsFilteredEmptyState() {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="soroban-events-filtered-empty"
      className="px-4 py-8 text-center text-sm text-muted-foreground"
    >
      No Soroban events match this filter. Try another event type or export
      all events once data is available.
    </div>
  );
}

export function SorobanEventTimeline({
  events,
  errors = [],
  isLoading = false,
  className,
}: SorobanEventTimelineProps) {
  const [filter, setFilter] = useState<SorobanEventFilter>("all");

  const filtered = useMemo(() => {
    const rows = filterSorobanEvents(events, filter);
    return sortSorobanEventsByLedger(rows);
  }, [events, filter]);

  if (isLoading) {
    return (
      <div className={cn("space-y-4", className)} aria-busy="true">
        <div
          className="flex items-center justify-center py-20 text-muted-foreground"
          role="status"
          data-testid="soroban-events-loading"
        >
          <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
          Loading Soroban events...
        </div>
      </div>
    );
  }

  const hasErrors = errors.length > 0;
  const isTrulyEmpty = events.length === 0 && !hasErrors;

  return (
    <div className={cn("space-y-4", className)}>
      {!isTrulyEmpty && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {SOROBAN_EVENT_FILTERS.map((value) => (
              <Button
                key={value}
                size="sm"
                variant={filter === value ? "stellar" : "outline"}
                onClick={() => setFilter(value)}
                aria-pressed={filter === value}
              >
                {FILTER_LABELS[value]}
              </Button>
            ))}
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={filtered.length === 0}
            onClick={() => exportSorobanEventsCsv(filtered)}
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>
      )}

      {hasErrors && (
        <ul
          className="rounded-lg border border-destructive/60 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          role="alert"
          data-testid="soroban-events-errors"
        >
          {errors.map((error) => (
            <li key={error}>• {error}</li>
          ))}
        </ul>
      )}

      {isTrulyEmpty ? (
        <SorobanEventsZeroEmptyState />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border-strong">
          <table className="w-full min-w-[720px] text-sm">
            <caption className="sr-only">
              Soroban contract events, newest ledger first.
            </caption>
            <thead className="border-b-2 border-border-strong bg-muted/50">
              <tr className="text-left">
                <th scope="col" className="px-4 py-3 font-medium">
                  Type
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Ledger
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Contract
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Topic
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Closed
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-0">
                    {hasErrors ? (
                      <SorobanEventsErrorEmptyState />
                    ) : (
                      <SorobanEventsFilteredEmptyState />
                    )}
                  </td>
                </tr>
              ) : (
                filtered.map((event) => (
                  <tr
                    key={event.id}
                    className="border-t border-border-strong bg-card/50"
                  >
                    <td className="px-4 py-3">
                      <Badge variant={TYPE_BADGE_VARIANT[event.type]}>
                        {event.type}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {event.ledger}
                    </td>
                    <td
                      className="px-4 py-3 font-mono text-xs"
                      title={event.contractId}
                    >
                      {shortenAddress(event.contractId)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {event.topic.join(", ") || "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatRelativeTime(event.ledgerClosedAt)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function exportSorobanEventsCsv(events: SorobanEventRow[]): void {
  const headers = [
    "id",
    "type",
    "ledger",
    "ledger_closed_at",
    "contract_id",
    "topic",
    "value",
    "tx_hash",
  ];

  const rows = events.map((event) => [
    event.id,
    event.type,
    event.ledger,
    event.ledgerClosedAt,
    event.contractId,
    event.topic.join(" | "),
    event.value,
    event.txHash,
  ]);

  const csv = buildCsv(headers, rows);
  downloadCsv(buildCsvFilename("trustbridge-soroban-events"), csv);
}
