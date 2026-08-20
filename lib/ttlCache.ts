// ──────────────────────────────────────────────────────────────────────────
// Tiny in-process TTL cache for low-churn server data (org singleton,
// resolved permission sets, fee setups).
//
// React's cache() only memoizes WITHIN one request. This Map survives
// ACROSS requests inside one server process (a warm Vercel Lambda, a
// `next dev` worker, a self-hosted Node server), so repeated dashboard
// navigations skip the remote-DB round trips for data that rarely changes.
//
// Invalidation strategy:
//   1. Mutation call sites call the exported clear()/delete() — instant on
//      the instance that handled the mutation.
//   2. The TTL is the safety net: on multi-instance deploys only the
//      handling instance can be invalidated, so other warm instances
//      converge within one TTL window.
//
// Keep TTLs SHORT (seconds, not minutes) — this trades at most one TTL of
// staleness for a large per-navigation latency win.
// ──────────────────────────────────────────────────────────────────────────

export interface TtlCache<T> {
  get(key: string): T | undefined
  set(key: string, value: T): void
  delete(key: string): void
  clear(): void
}

export function createTtlCache<T>(ttlMs: number, maxEntries = 500): TtlCache<T> {
  const store = new Map<string, { value: T; expires: number }>()

  return {
    get(key: string): T | undefined {
      const hit = store.get(key)
      if (!hit) return undefined
      if (hit.expires <= Date.now()) {
        store.delete(key)
        return undefined
      }
      return hit.value
    },
    set(key: string, value: T): void {
      // Simple bound: permission sets are per-admin (dozens), org is a
      // singleton key — hitting 500 entries means something is wrong, so a
      // full clear is the safe recovery.
      if (store.size >= maxEntries) store.clear()
      store.set(key, { value, expires: Date.now() + ttlMs })
    },
    delete(key: string): void {
      store.delete(key)
    },
    clear(): void {
      store.clear()
    },
  }
}
