"use client";

import React from "react";
import { BadgeCheck, ShieldAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface VerifiedBadgeProps {
  verified: boolean;
  className?: string;
  /** Render a compact icon-only badge (used inside dense tables). */
  compact?: boolean;
}

/**
 * On-chain verified badge: shown when an account is funded with an authorized
 * trustline for the payout asset. Derived from Horizon checks (issue #11).
 */
export function VerifiedBadge({
  verified,
  className,
  compact = false,
}: VerifiedBadgeProps) {
  if (verified) {
    return (
      <Badge
        variant="ready"
        className={cn("gap-1", className)}
        title="On-chain verified: funded with an authorized trustline"
        aria-label={compact ? "On-chain verified: funded with an authorized trustline" : undefined}
      >
        <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
        {compact ? (
          <span className="sr-only">On-chain verified: funded with an authorized trustline</span>
        ) : (
          "Verified"
        )}
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className={cn("gap-1 text-muted-foreground", className)}
      title="Not yet verified on-chain"
      aria-label={compact ? "Not yet verified on-chain" : undefined}
    >
      <ShieldAlert className="h-3.5 w-3.5" aria-hidden />
      {compact ? (
        <span className="sr-only">Not yet verified on-chain</span>
      ) : (
        "Unverified"
      )}
    </Badge>
  );
}
