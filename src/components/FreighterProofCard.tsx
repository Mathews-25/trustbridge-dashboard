"use client";

import React, { useEffect, useState } from "react";
import { Copy, PenLine, ShieldAlert, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { WalletProofInfo } from "@/types";

declare global {
  interface Window {
    freighter?: unknown;
    freighterApi?: unknown;
  }
}

interface FreighterProofCardProps {
  proof: WalletProofInfo;
  addressReady: boolean;
  className?: string;
}

export function FreighterProofCard({
  proof,
  addressReady,
  className,
}: FreighterProofCardProps) {
  const [freighterDetected, setFreighterDetected] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [signed, setSigned] = useState(false);
  const [signing, setSigning] = useState(false);
  const [signError, setSignError] = useState(false);

  useEffect(() => {
    setFreighterDetected(
      typeof window !== "undefined" &&
        Boolean(window.freighterApi || window.freighter)
    );
  }, []);

  async function copyChallenge() {
    try {
      await navigator.clipboard.writeText(proof.challenge);
      setCopyFailed(false);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // No Clipboard API (insecure origin, permission denied). The challenge is
      // on screen and selectable, so say so rather than failing silently.
      setCopyFailed(true);
    }
  }

  async function signChallenge() {
    setSigning(true);
    setSignError(false);
    try {
      const api = window.freighterApi as
        | { signMessage?: (message: string, options?: unknown) => Promise<unknown> }
        | undefined;
      if (!api?.signMessage) return;
      await api.signMessage(proof.challenge);
      setSigned(true);
    } catch {
      setSignError(true);
    } finally {
      setSigning(false);
    }
  }

  return (
    <Card
      className={cn("border-stellar-purple/20", className)}
      data-testid="freighter-proof-card"
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          {freighterDetected ? (
            <ShieldCheck className="h-5 w-5 text-emerald-500" />
          ) : (
            <ShieldAlert className="h-5 w-5 text-amber-500" />
          )}
          Freighter ownership proof
        </CardTitle>
        <CardDescription>
          Use Freighter&apos;s message-signing flow to document control of the
          payout wallet before maintainers approve Wave payouts.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p
          className={cn(
            "rounded-md border px-3 py-2",
            freighterDetected
              ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300"
              : "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300"
          )}
          role="status"
          data-testid="freighter-detection-status"
        >
          {freighterDetected
            ? "Freighter detected in this browser. You can use it to sign the ownership challenge."
            : "Freighter is not detected in this browser. You can still copy the challenge and sign it later from a Freighter-enabled session."}
        </p>

        <ol className="list-decimal space-y-2 pl-5">
          {proof.instructions.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>

        <div className="space-y-2">
          <p className="font-medium">Challenge text</p>
          <pre
            className="overflow-x-auto rounded-md border bg-muted/40 p-3 text-xs whitespace-pre-wrap"
            aria-label="Freighter ownership proof challenge"
            data-testid="freighter-challenge"
          >
            {proof.challenge}
          </pre>
        </div>

        <p className="text-muted-foreground">{proof.fallback}</p>

        <Button
          variant="outline"
          onClick={() => void copyChallenge()}
          disabled={!addressReady}
          aria-disabled={!addressReady}
          data-testid="copy-challenge"
        >
          <Copy className="h-4 w-4" />
          {copied ? "Copied challenge" : "Copy challenge"}
        </Button>
        {freighterDetected && (
          <Button
            variant="stellar"
            onClick={() => void signChallenge()}
            disabled={!addressReady || signing}
            data-testid="sign-challenge"
          >
            <PenLine className="h-4 w-4" />
            {signed ? "Challenge signed" : signing ? "Signing..." : "Sign challenge"}
          </Button>
        )}
        {copyFailed && (
          <p
            className="text-xs text-destructive"
            role="alert"
            data-testid="freighter-copy-error"
          >
            Could not reach the clipboard. Select the challenge text above and
            copy it manually.
          </p>
        )}
        {signError && (
          <p
            className="text-xs text-destructive"
            role="alert"
            data-testid="freighter-sign-error"
          >
            Freighter did not sign the challenge. You can still copy it for a fallback review.
          </p>
        )}

        {!addressReady && (
          <p className="text-xs text-muted-foreground">
            Enter a Stellar address first so the challenge references the payout
            wallet you are registering.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
