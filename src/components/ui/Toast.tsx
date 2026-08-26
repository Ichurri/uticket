"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { CheckIcon, XIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

/**
 * Feedback for async actions. Before this, confirming a payment refreshed the
 * page and said nothing at all, while failures showed up as a 12px red line
 * in a corner — the two outcomes that matter most were the two least visible.
 */
export type ToastTone = "success" | "warning" | "danger";

export interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

const DEFAULT_DURATION_MS = 5000;

interface ToastStore {
  toasts: Toast[];
  push: (tone: ToastTone, message: string) => void;
  dismiss: (id: number) => void;
}

let nextId = 0;

// Selectors return `state.toasts` / the actions directly — stable references,
// as useSyncExternalStore requires.
const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push: (tone, message) =>
    set((state) => ({
      toasts: [...state.toasts, { id: nextId++, tone, message }],
    })),
  dismiss: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    })),
}));

/** Fire-and-forget from anywhere, including outside React. */
export const toast = {
  success: (message: string) => useToastStore.getState().push("success", message),
  warning: (message: string) => useToastStore.getState().push("warning", message),
  error: (message: string) => useToastStore.getState().push("danger", message),
};

const toneClasses: Record<ToastTone, string> = {
  success: "border-success/40 bg-card text-foreground",
  warning: "border-warning/50 bg-card text-foreground",
  danger: "border-danger/50 bg-card text-foreground",
};

const iconClasses: Record<ToastTone, string> = {
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  danger: "bg-danger/15 text-danger",
};

function ToastRow({ toast: item }: { toast: Toast }) {
  const dismiss = useToastStore((state) => state.dismiss);

  useEffect(() => {
    const id = setTimeout(() => dismiss(item.id), DEFAULT_DURATION_MS);
    return () => clearTimeout(id);
  }, [item.id, dismiss]);

  return (
    <div
      className={cn(
        "pointer-events-auto flex items-start gap-3 rounded-xl border p-3.5 shadow-card-hover",
        "animate-toast-in motion-reduce:animate-none",
        toneClasses[item.tone],
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
          iconClasses[item.tone],
        )}
      >
        {item.tone === "success" ? (
          <CheckIcon className="h-3.5 w-3.5" />
        ) : (
          <XIcon className="h-3.5 w-3.5" />
        )}
      </span>
      <p className="flex-1 text-sm leading-snug">{item.message}</p>
      <button
        type="button"
        aria-label="Cerrar aviso"
        onClick={() => dismiss(item.id)}
        className="-m-1 shrink-0 cursor-pointer rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
      >
        <XIcon className="h-4 w-4" />
      </button>
    </div>
  );
}

/** Mounted once in the root layout. */
export function Toaster() {
  const toasts = useToastStore((state) => state.toasts);
  if (toasts.length === 0) return null;

  return (
    <div
      // aria-live so a screen reader hears the outcome too — the old inline
      // <p> errors were never announced.
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col gap-2 sm:inset-x-auto sm:right-6 sm:w-80"
    >
      {toasts.map((item) => (
        <ToastRow key={item.id} toast={item} />
      ))}
    </div>
  );
}
