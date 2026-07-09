"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Polls the server data (router.refresh) on an interval while the tab is
 * visible, so lists that other people mutate — e.g. incoming payment
 * proofs — update live. Hidden tabs skip the tick; RefreshOnFocus catches
 * them up when they return.
 */
export function AutoRefresh({ intervalMs = 15000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    }, intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);

  return null;
}
