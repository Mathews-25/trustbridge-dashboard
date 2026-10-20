"use client";

import React from "react";

import { Badge } from "@/components/ui/badge";
import { getReadinessConfig } from "@/lib/readiness";
import { cn } from "@/lib/utils";
import type { ReadinessStatus } from "@/types";

interface TrustlineStatusBadgeProps {
  status: ReadinessStatus;
  className?: string;
  /**
   * Render the plain-language explanation and the next step underneath the
   * badge. Off in dense contexts (tables), on wherever a contributor is being
   * asked to act on the status.
   */
  showDescription?: boolean;
}

export function TrustlineStatusBadge({
  status,
  className,
  showDescription = false,
}: TrustlineStatusBadgeProps) {
  const config = getReadinessConfig(status);

  const badge = (
    <Badge
      variant={config.variant}
      className={showDescription ? undefined : className}
      // The tooltip carries the explanation everywhere the badge appears on its
      // own — a table cell reading "Not ready yet" is otherwise a dead end.
      title={config.description}
      data-testid={`readiness-badge-${status}`}
    >
      <span className="mr-1" aria-hidden="true">
        {config.icon}
      </span>
      {config.label}
    </Badge>
  );

  if (!showDescription) return badge;

  return (
    <div className={cn("space-y-2", className)}>
      {badge}
      <p className="text-sm text-muted-foreground" data-testid="readiness-description">
        {config.description}
      </p>
      <p className="text-sm font-medium" data-testid="readiness-next-step">
        What to do next: {config.nextStep}
      </p>
    </div>
  );
}
