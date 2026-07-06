"use client";

import { useSyncExternalStore } from "react";

const emptySubscribe = () => () => {};

/**
 * False during SSR and the hydration render, true afterwards.
 * Lets components that read persisted client state (e.g. the cart)
 * render a neutral shell first so the HTML matches the server.
 */
export function useHydrated() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}
