"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Clock, CheckCircle2 } from "lucide-react";

interface SlaCountdownProps {
  readiness: "ready" | "low_reserve" | "not_ready";
  lastCheckedAt: Date | null;
  slaHours?: number;
}

export function SlaCountdown({
  readiness,
  lastCheckedAt,
  slaHours = 24,
}: SlaCountdownProps) {
  const [timeLeft, setTimeLeft] = useState<string | null>(null);
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    if (!lastCheckedAt) {
      setTimeLeft("Unknown");
      return;
    }

    const update = () => {
      const now = new Date();
      const slaDeadline = new Date(
        lastCheckedAt.getTime() + slaHours * 60 * 60 * 1000
      );
      const diffMs = slaDeadline.getTime() - now.getTime();

      if (diffMs <= 0) {
        setTimeLeft("Expired");
        setIsExpired(true);
      } else {
        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        setTimeLeft(`${hours}h ${minutes}m`);
        setIsExpired(false);
      }
    };

    update();
    const interval = setInterval(update, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [lastCheckedAt, slaHours]);

  if (!lastCheckedAt) {
    return (
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Clock className="h-3.5 w-3.5" />
        Never checked
      </div>
    );
  }

  if (readiness === "ready") {
    return (
      <div className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Ready
      </div>
    );
  }

  const isUrgent = timeLeft && !isExpired && parseInt(timeLeft) < 6;

  return (
    <div
      className={`flex items-center gap-1 text-xs ${
        isExpired
          ? "text-red-600 dark:text-red-400 font-medium"
          : isUrgent
            ? "text-amber-600 dark:text-amber-400 font-medium"
            : "text-muted-foreground"
      }`}
    >
      {isExpired ? (
        <>
          <AlertCircle className="h-3.5 w-3.5" />
          SLA expired
        </>
      ) : (
        <>
          <Clock className="h-3.5 w-3.5" />
          {timeLeft}
        </>
      )}
    </div>
  );
}
