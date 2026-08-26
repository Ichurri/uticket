"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { CheckIcon, XIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

const AUTO_DISMISS_MS = 4000;
const AUTO_DISMISS_S = Math.round(AUTO_DISMISS_MS / 1000);

/**
 * Full-screen door verdict (spec #7a): a solid color fill, a 148px icon in a
 * white ring, and the binary VÁLIDO/NO PASA word — the specific reason
 * (already used, cancelled, wrong event...) shows in the pill below, with an
 * optional secondary line (ticket reference, seat) underneath it.
 * VÁLIDO shows an explicit "Escanear siguiente" button (the confirm step)
 * plus a draining progress bar that auto-advances if staff don't tap;
 * anything else waits for the door staff to press "Escanear otro".
 * A mis-scan can be reverted right here with "Deshacer" — the auto-advance
 * pauses as soon as staff reach for it, so the fix isn't a race.
 */
export function ScannerVerdict({
  accepted,
  reason,
  detail,
  onDismiss,
  onUndo,
}: {
  accepted: boolean;
  reason: string;
  detail?: string;
  onDismiss: () => void;
  /** Reverts the check-in that just happened; absent when there's nothing
   * to revert (a rejected scan never consumed anything). */
  onUndo?: () => Promise<string | null>;
}) {
  const [draining, setDraining] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(AUTO_DISMISS_S);
  const [undoState, setUndoState] = useState<"idle" | "working" | "done">(
    "idle",
  );
  const [undoError, setUndoError] = useState<string | null>(null);
  const undoing = undoState !== "idle";

  async function handleUndo() {
    if (!onUndo || undoing) return;
    setUndoState("working");
    setUndoError(null);
    const error = await onUndo();
    if (error) {
      setUndoState("idle");
      setUndoError(error);
      return;
    }
    setUndoState("done");
  }

  useEffect(() => {
    // Staff reaching for "Deshacer" must not have the screen yanked away.
    if (!accepted || undoing) return;
    const startId = requestAnimationFrame(() => setDraining(true));
    const dismissId = setTimeout(onDismiss, AUTO_DISMISS_MS);
    const tickId = setInterval(() => {
      setSecondsLeft((value) => Math.max(0, value - 1));
    }, 1000);
    return () => {
      cancelAnimationFrame(startId);
      clearTimeout(dismissId);
      clearInterval(tickId);
    };
  }, [accepted, undoing, onDismiss]);

  return (
    <div
      role="alert"
      className={cn(
        "fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 px-6 text-center",
        accepted ? "bg-success" : "bg-danger",
      )}
    >
      <div className="flex h-[148px] w-[148px] items-center justify-center rounded-full bg-white">
        {accepted ? (
          <CheckIcon className="h-20 w-20 text-success" strokeWidth={2.5} />
        ) : (
          <XIcon className="h-20 w-20 text-danger" strokeWidth={2.5} />
        )}
      </div>

      <p className="text-[46px] font-extrabold leading-none tracking-tight text-white">
        {undoState === "done" ? "DESHECHO" : accepted ? "VÁLIDO" : "NO PASA"}
      </p>

      <div className="flex flex-col items-center gap-1.5">
        <span className="max-w-full truncate rounded-full bg-white/20 px-4 py-1.5 text-sm font-medium text-white">
          {undoState === "done"
            ? "El boleto vuelve a estar válido"
            : reason}
        </span>
        {detail && (
          <span className="max-w-full truncate font-mono text-xs font-medium uppercase tracking-[0.08em] text-white/70">
            {detail}
          </span>
        )}
      </div>

      {accepted ? (
        <div className="mt-2 flex flex-col items-center gap-3">
          <Button
            type="button"
            size="lg"
            className="h-[52px] bg-white text-success hover:bg-white/90"
            onClick={onDismiss}
          >
            {undoState === "done" ? "Escanear otro" : "Escanear siguiente"}
          </Button>
          {onUndo && undoState !== "done" && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-11 text-white underline underline-offset-4 hover:bg-white/15 hover:text-white"
              disabled={undoing}
              onClick={handleUndo}
            >
              {undoState === "working"
                ? "Deshaciendo..."
                : "Deshacer — escaneé por error"}
            </Button>
          )}
          {undoError && (
            <span className="max-w-xs text-xs font-medium text-white">
              {undoError}
            </span>
          )}
          {undoState === "idle" && (
            <div className="flex flex-col items-center gap-1.5">
              <span className="h-1 w-40 overflow-hidden rounded-full bg-white/25">
                <span
                  className={cn(
                    "block h-full rounded-full bg-white ease-linear motion-reduce:transition-none",
                    draining ? "w-0" : "w-full",
                  )}
                  style={{ transition: `width ${AUTO_DISMISS_MS}ms linear` }}
                />
              </span>
              <span className="text-xs text-white/70">
                Avanza solo en {secondsLeft}s si no tocás
              </span>
            </div>
          )}
        </div>
      ) : (
        <Button
          type="button"
          size="lg"
          className="mt-2 h-[52px] bg-white text-danger hover:bg-white/90"
          onClick={onDismiss}
        >
          Escanear otro
        </Button>
      )}
    </div>
  );
}
