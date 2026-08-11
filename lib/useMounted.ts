"use client"

import { useSyncExternalStore } from "react"

// Tracks whether the component has mounted on the client. Returns false during
// SSR and the initial hydration render, then true afterwards. This is the
// React-recommended way to gate client-only UI (e.g. next-themes toggle) without
// triggering hydration mismatches or calling setState inside an effect.
const emptySubscribe = () => () => {}

export function useMounted(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true, // client snapshot: mounted
    () => false, // server snapshot: not mounted
  )
}
