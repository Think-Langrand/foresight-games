import "server-only";

// Tiny in-process TTL cache for STATIC content (the deck, drivers, model).
// These rarely change, yet the workshop re-reads them constantly — every team
// save re-validates against the deck, and every live refetch pulls content.
// Caching them in server memory removes most of that Supabase read load, which
// is what tips the free-tier instance into transient 520/525s under burst.
//
// Per-instance and best-effort: a rejected fetch is never cached, and the TTL
// is short enough that edits to the underlying tables show up promptly.

type Entry<T> = { exp: number; val: Promise<T> };
const store = new Map<string, Entry<unknown>>();

export function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && hit.exp > now) return hit.val;

  const val = fn().catch((err) => {
    // Don't cache failures — let the next caller retry the source.
    if (store.get(key)?.val === val) store.delete(key);
    throw err;
  });
  store.set(key, { exp: now + ttlMs, val });
  return val;
}
