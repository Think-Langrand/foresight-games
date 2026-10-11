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

// ---------------------------------------------------------------------------
// A per-browser SET of ids — "which of these has this person dismissed"
// ---------------------------------------------------------------------------

const NO_IDS: ReadonlySet<string> = new Set();

export interface SetPrefStore {
  read: () => ReadonlySet<string>;
  subscribe: (cb: () => void) => () => void;
  add: (v: string) => void;
  remove: (...vs: string[]) => void;
  server: () => ReadonlySet<string>;
}

// makePrefStore holds one value from a closed whitelist. These values are uuids nobody can
// enumerate in advance, so the whitelist becomes "an array of strings" and the validation
// becomes a shape check.
//
// `read` caches its parse against the raw string, and that caching is the whole reason
// this cannot be `new Set(JSON.parse(...))` inline: useSyncExternalStore calls getSnapshot
// on every render and throws if it is handed a fresh object each time.
//
// `cap` is not decoration. These ids come from every board this browser ever opens and
// nothing on earth deletes them, so the list is bounded and evicts oldest-first.
export function makeSetPrefStore(key: string, cap = 200): SetPrefStore {
  let memory: string | null = null;
  let raw: string | null = null;
  let parsed: ReadonlySet<string> = NO_IDS;
  const listeners = new Set<() => void>();

  // `!== null`, not truthy: "" is a real stored value meaning "nothing dismissed".
  const current = (): string => {
    if (memory !== null) return memory;
    try {
      return window.localStorage.getItem(key) ?? "";
    } catch {
      return "";
    }
  };

  const decode = (s: string): ReadonlySet<string> => {
    if (!s) return NO_IDS;
    try {
      const v: unknown = JSON.parse(s);
      return Array.isArray(v)
        ? new Set(v.filter((x): x is string => typeof x === "string"))
        : NO_IDS;
    } catch {
      return NO_IDS; // garbage in storage reads as "nothing dismissed"
    }
  };

  const list = (): string[] => {
    const s = current();
    if (!s) return [];
    try {
      const v: unknown = JSON.parse(s);
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
    } catch {
      return [];
    }
  };

  const commit = (next: string[]) => {
    memory = JSON.stringify(next.slice(-cap)); // append-ordered, so this evicts oldest
    try {
      window.localStorage.setItem(key, memory);
    } catch {
      // Not remembered past this page, still dismissed.
    }
    for (const l of listeners) l();
  };

  return {
    read: () => {
      const s = current();
      if (s !== raw) {
        raw = s;
        parsed = decode(s);
      }
      return parsed;
    },
    subscribe: (cb) => {
      listeners.add(cb);
      window.addEventListener("storage", cb);
      return () => {
        listeners.delete(cb);
        window.removeEventListener("storage", cb);
      };
    },
    add: (v) => {
      const next = list();
      if (!next.includes(v)) commit([...next, v]);
    },
    remove: (...vs) => {
      const next = list();
      if (next.some((x) => vs.includes(x))) commit(next.filter((x) => !vs.includes(x)));
    },
    server: () => NO_IDS,
  };
}

export function useSetPref(store: SetPrefStore): ReadonlySet<string> {
  return useSyncExternalStore(store.subscribe, store.read, store.server);
}
