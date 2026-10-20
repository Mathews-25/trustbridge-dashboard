"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw } from "lucide-react";

import {
  ContributorTable,
  exportContributorsCsv,
} from "@/components/ContributorTable";
import { NetworkStatusPanel } from "@/components/NetworkStatusPanel";
import { SorobanEventTimeline } from "@/components/SorobanEventTimeline";
import { WaveReadinessBar } from "@/components/WaveReadinessBar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { countReadyContributors } from "@/lib/contributors";
import type {
  ContributorRow,
  NetworkConfig,
  SorobanEventTimelineResponse,
} from "@/types";

interface ContributorsResponse {
  contributors: ContributorRow[];
}

interface ContributorResponse {
  contributor: ContributorRow;
}

export default function DashboardPage() {
  const queryClient = useQueryClient();

  const contributorsQuery = useQuery({
    queryKey: ["contributors"],
    queryFn: async () => {
      const response = await fetch("/api/contributors");
      if (!response.ok) throw new Error("Failed to load contributors");
      return (await response.json()) as ContributorsResponse;
    },
  });

  const recheckMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/contributors", { method: "POST" });
      if (!response.ok) throw new Error("Re-check failed");
      return (await response.json()) as ContributorsResponse & {
        refreshed: number;
      };
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["contributors"], {
        contributors: data.contributors,
      });
    },
  });

  const recheckOneMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/contributors/${id}`, {
        method: "POST",
      });
      if (!response.ok) throw new Error("Re-check failed");
      return (await response.json()) as { contributor: ContributorRow };
    },
    onSuccess: (data) => {
      queryClient.setQueryData<ContributorsResponse>(
        ["contributors"],
        (current) => ({
          contributors: (current?.contributors ?? []).map((row) =>
            row.id === data.contributor.id ? data.contributor : row
          ),
        })
      );
    },
  });

  const sorobanQuery = useQuery({
    queryKey: ["soroban-events"],
    queryFn: async () => {
      const response = await fetch("/api/soroban/events");
      if (!response.ok) throw new Error("Failed to load Soroban events");
      return (await response.json()) as SorobanEventTimelineResponse;
    },
  });

  const networkQuery = useQuery({
    queryKey: ["network-config"],
    queryFn: async () => {
      const response = await fetch("/api/settings/network");
      if (!response.ok) throw new Error("Failed to load network config");
      return (await response.json()) as NetworkConfig;
    },
  });

  const contributors = contributorsQuery.data?.contributors ?? [];
  const readyCount = countReadyContributors(contributors);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Maintainer dashboard</h1>
          <p className="mt-2 text-muted-foreground">
            Wave payout readiness across all registered contributors. Re-check
            pulls fresh data from Horizon.
          </p>
        </div>
        <Button
          variant="stellar"
          onClick={() => recheckMutation.mutate()}
          disabled={recheckMutation.isPending}
        >
          {recheckMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Re-check all
        </Button>
      </div>

      {networkQuery.data && (
        <NetworkStatusPanel config={networkQuery.data} className="mb-8" />
      )}

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Wave overview</CardTitle>
          <CardDescription>
            Green = funded + USDC trustline + sufficient XLM. Yellow = low
            reserve. Red = missing trustline or unfunded.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WaveReadinessBar
            readyCount={readyCount}
            totalCount={contributors.length}
          />
        </CardContent>
      </Card>

      {contributorsQuery.isLoading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading contributors...
        </div>
      ) : contributorsQuery.isError ? (
        <p className="text-destructive">Failed to load contributor data.</p>
      ) : (
        <ContributorTable
          contributors={contributors}
          onExport={() => exportContributorsCsv(contributors)}
          onRecheck={(id) => recheckOneMutation.mutate(id)}
          recheckingId={
            recheckOneMutation.isPending
              ? (recheckOneMutation.variables ?? null)
              : null
          }
        />
      )}

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Soroban event timeline</CardTitle>
          <CardDescription>
            Recent on-chain events for the configured registry contract
            (<code>SOROBAN_CONTRACT_ID</code>). Filter by event type and
            export for auditing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sorobanQuery.isLoading ? (
            <div className="flex items-center justify-center py-20 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Loading Soroban events...
            </div>
          ) : sorobanQuery.isError ? (
            <p className="text-destructive">Failed to load Soroban events.</p>
          ) : (
            <SorobanEventTimeline
              events={sorobanQuery.data?.events ?? []}
              errors={sorobanQuery.data?.errors ?? []}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
