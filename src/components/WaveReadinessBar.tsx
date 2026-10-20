"use client";

import { calculatePercent, cn } from "@/lib/utils";

interface WaveReadinessBarProps {
  readyCount: number;
  totalCount: number;
  className?: string;
}

export function WaveReadinessBar({
  readyCount,
  totalCount,
  className,
}: WaveReadinessBarProps) {
  const percent = calculatePercent(readyCount, totalCount);

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">Wave payout readiness</span>
        <span className="text-muted-foreground">
          {readyCount}/{totalCount} ready ({percent}%)
        </span>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
        <div
          data-testid="wave-readiness-fill"
          className="h-full rounded-full bg-gradient-to-r from-stellar-purple to-stellar-cyan transition-all duration-500 motion-reduce:transition-none"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
