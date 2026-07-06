"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Counts down to the order expiry. Refreshes the page when it hits zero
 * (lazy expiration cancels the order server-side) and every 15 s while
 * waiting, so a manual confirmation by the organizer shows up live.
 */
export function OrderCountdown({ expiresAt }: { expiresAt: string }) {
  const router = useRouter();
  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  useEffect(() => {
    const expiry = new Date(expiresAt).getTime();
    let ticks = 0;
    const id = setInterval(() => {
      const remaining = Math.max(0, expiry - Date.now());
      setRemainingMs(remaining);
      ticks += 1;
      if (remaining === 0) {
        clearInterval(id);
        router.refresh();
      } else if (ticks % 15 === 0) {
        router.refresh();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [expiresAt, router]);

  const totalSeconds =
    remainingMs === null ? null : Math.floor(remainingMs / 1000);
  const display =
    totalSeconds === null
      ? "--:--"
      : `${String(Math.floor(totalSeconds / 60)).padStart(2, "0")}:${String(totalSeconds % 60).padStart(2, "0")}`;
  const urgent = totalSeconds !== null && totalSeconds < 180;

  return (
    <div className="flex flex-col items-center gap-1">
      <span
        className={cn(
          "font-mono text-3xl font-bold tabular-nums",
          urgent ? "text-danger" : "text-foreground",
        )}
      >
        {display}
      </span>
      <span className="text-xs text-muted-foreground">
        para completar el pago
      </span>
    </div>
  );
}
