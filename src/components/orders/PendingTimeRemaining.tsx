"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** Compact live "mm:ss restante" chip for PENDING_PAYMENT rows in the
 * orders list — same 15-min deadline as OrderCountdown's ring, without
 * the full ring (spec #8a). Mirrors OrderCountdown's effect shape: state
 * only ever updates inside the interval callback, never synchronously on
 * mount, so it shows the neutral placeholder for the first tick. */
export function PendingTimeRemaining({ expiresAt }: { expiresAt: string }) {
  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  useEffect(() => {
    const expiry = new Date(expiresAt).getTime();
    const id = setInterval(() => {
      setRemainingMs(Math.max(0, expiry - Date.now()));
    }, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  const totalSeconds = remainingMs === null ? null : Math.floor(remainingMs / 1000);
  const display =
    totalSeconds === null
      ? "--:--"
      : `${String(Math.floor(totalSeconds / 60)).padStart(2, "0")}:${String(totalSeconds % 60).padStart(2, "0")}`;
  const urgent = totalSeconds !== null && totalSeconds > 0 && totalSeconds < 120;

  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums",
        urgent ? "bg-danger/15 text-danger" : "bg-warning/15 text-warning",
      )}
    >
      {display} restante
    </span>
  );
}
