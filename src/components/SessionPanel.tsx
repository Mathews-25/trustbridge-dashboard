"use client";

import { useQuery } from "@tanstack/react-query";
import { signOut } from "next-auth/react";
import { useSession } from "next-auth/react";
import { AlertTriangle, Loader2, LogOut, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { describeRemaining, type SessionInfo } from "@/lib/session-info";

interface SessionInfoResponse {
  session: SessionInfo;
}

/**
 * Absolute timestamp, in the reader's own locale and zone.
 *
 * A session's issued-at is a genuine instant (unlike an outreach deadline,
 * which is a calendar date), so it is correct to render it where the reader
 * is — that is the whole point of "was this me, last Tuesday?".
 */
function formatInstant(iso: string | null): string {
  if (!iso) return "Unknown";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 py-2">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{value}</dd>
    </div>
  );
}

/**
 * Current-session panel — issue #148.
 *
 * Shows what a JWT deployment can honestly show: this session's issued-at and
 * expiry. It does not show a device list, because there is nothing to list —
 * see `docs/SESSIONS.md`. Pretending otherwise would be worse than the gap it
 * covers: someone whose laptop was stolen would read an incomplete list as
 * reassurance.
 */
export function SessionPanel() {
  const { data: session } = useSession();

  const sessionQuery = useQuery({
    queryKey: ["session-info"],
    queryFn: async () => {
      const response = await fetch("/api/auth/session-info");
      if (!response.ok) throw new Error("Failed to load session info");
      return (await response.json()) as SessionInfoResponse;
    },
    // The countdown drifts if it is cached; it is cheap to recompute.
    staleTime: 0,
  });

  const info = sessionQuery.data?.session;
  const maxAgeDays = info ? Math.round(info.maxAgeSeconds / 86_400) : null;

  return (
    <Card data-testid="session-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          Your session
        </CardTitle>
        <CardDescription>
          You are signed in as{" "}
          <span className="font-medium text-foreground">
            @{session?.user?.githubUsername ?? "unknown"}
          </span>{" "}
          with GitHub.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {sessionQuery.isLoading ? (
          <div
            className="flex items-center gap-2 py-4 text-sm text-muted-foreground"
            role="status"
          >
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Loading session details…
          </div>
        ) : sessionQuery.isError ? (
          <p
            className="rounded-md border border-destructive/60 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            role="alert"
          >
            Could not load session details.
          </p>
        ) : info ? (
          <dl className="divide-y divide-border" data-testid="session-details">
            <Row label="Signed in at" value={formatInstant(info.issuedAt)} />
            <Row label="Expires at" value={formatInstant(info.expiresAt)} />
            <Row
              label="Time remaining"
              value={describeRemaining(info.expiresInSeconds)}
            />
            <Row
              label="Session type"
              value={
                info.strategy === "jwt"
                  ? "Signed token (JWT)"
                  : "Server-stored session"
              }
            />
          </dl>
        ) : null}

        {/*
          The honest part. Stating the limitation next to the sign-out button
          is the point — a user who thinks "Sign out" covered their stolen
          laptop will not take the step that actually does.
        */}
        <div
          className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-800 dark:border-amber-600 dark:bg-amber-950/40 dark:text-amber-200"
          data-testid="jwt-limitation-notice"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div className="space-y-2">
            <p className="font-medium">
              Other devices cannot be listed or signed out from here.
            </p>
            <p>
              TrustBridge uses signed session tokens, which the server does not
              keep a record of. That means this page cannot show your other
              signed-in browsers, and signing out below ends{" "}
              <strong>this browser&apos;s session only</strong>. Existing
              sessions elsewhere stay valid until they expire
              {maxAgeDays ? ` (up to ${maxAgeDays} days after sign-in)` : ""}.
            </p>
            <p>
              If a device is lost or you suspect your account is compromised,
              revoke TrustBridge&apos;s access in{" "}
              <a
                href="https://github.com/settings/applications"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium underline underline-offset-2"
              >
                your GitHub authorized OAuth apps
              </a>
              , then change your GitHub password. That stops TrustBridge from
              being able to act on your behalf.
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          onClick={() => void signOut({ callbackUrl: "/" })}
          data-testid="sign-out"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Sign out of this browser
        </Button>
      </CardContent>
    </Card>
  );
}
