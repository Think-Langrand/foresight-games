import { useSyncExternalStore } from "react";

// A per-browser UI preference — "is this panel folded" — read through useSyncExternalStore.
//
// Why not useState + an effect that reads localStorage: the server and the first client
// paint must agree (no hydration mismatch), and the React compiler lint rejects setState
// inside an effect. An external store gives both for free: the server snapshot is the
// fallback, the stored value lands in the hydration pass, and writes notify every reader.
//
// A copy is kept in memory so the toggle still works where storage is blocked (private
// mode, cleared site data); it is simply not remembered past the page.

export interface PrefStore<T extends string> {
  read: () => T;
  subscribe: (cb: () => void) => () => void;
  write: (v: T) => void;
  server: () => T;
}

export function makePrefStore<T extends string>(
  key: string,
  fallback: T,
  valid: readonly T[]
): PrefStore<T> {
  let memory: T | null = null;
  const listeners = new Set<() => void>();
  const isValid = (v: unknown): v is T => valid.includes(v as T);
  return {
    read: () => {
      if (memory) return memory;
      try {
        const v = window.localStorage.getItem(key);
        return isValid(v) ? v : fallback;
      } catch {
        return fallback;
      }
    },
    subscribe: (cb) => {
      listeners.add(cb);
      window.addEventListener("storage", cb);
      return () => {
        listeners.delete(cb);
        window.removeEventListener("storage", cb);
      };
    },
    write: (v) => {
      memory = v;
      try {
        window.localStorage.setItem(key, v);
      } catch {
        // Not remembered past this page, still toggled.
      }
      for (const l of listeners) l();
    },
    server: () => fallback,
  };
}

export function usePref<T extends string>(store: PrefStore<T>): T {
  return useSyncExternalStore(store.subscribe, store.read, store.server);
}
