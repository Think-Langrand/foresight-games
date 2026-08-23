"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { CardsView, SessionView, Team, TeamStatus } from "@/lib/workshop-types";
import type { RippleCard, RipplesView } from "@/lib/ripples-types";

// Tables whose changes should refresh each view (filtered by session code).
const SESSION_TABLES = ["sessions", "submissions", "responses"] as const;
const CARDS_TABLES = ["sessions", "teams"] as const;
const RIPPLES_TABLES = [
  "sessions",
  "ripple_teams",
  "ripple_players",
  "ripple_cards",
  "ripple_chips",
  "ripple_card_votes",
] as const;

// Shared live-view engine: one initial fetch of the aggregated API payload, then
// refetch whenever Supabase realtime reports a change to the session's rows. No
// steady polling — an idle room costs nothing. Falls back to a slow poll only if
// realtime isn't configured (missing anon key).
function useLiveView<T>(
  code: string,
  path: string,
  tables: readonly string[]
) {
  const [view, setView] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const alive = useRef(true);

  const fetchOnce = useCallback(async () => {
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(code)}${path}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Error ${res.status}`);
      }
      const data = (await res.json()) as T;
      if (alive.current) {
        setView(data);
        setError(null);
      }
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [code, path]);

  useEffect(() => {
    alive.current = true;
    fetchOnce();

    const sb = supabaseBrowser();
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const kick = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(fetchOnce, 250); // coalesce bursts of row changes
    };

    let cleanup = () => {};
    if (sb) {
      const channel = sb.channel(`live:${code}`);
      for (const table of tables) {
        channel.on(
          "postgres_changes",
          { event: "*", schema: "public", table, filter: `code=eq.${code}` },
          kick
        );
      }
      channel.subscribe();
      cleanup = () => {
        sb.removeChannel(channel);
      };
    } else {
      // Degraded mode: no realtime → gentle 8s poll so the view still updates.
      const t = setInterval(() => {
        if (document.visibilityState !== "hidden") fetchOnce();
      }, 8000);
      cleanup = () => clearInterval(t);
    }

    // Catch up on anything missed while the tab was backgrounded.
    const onVis = () => {
      if (document.visibilityState === "visible") fetchOnce();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      alive.current = false;
      if (debounce) clearTimeout(debounce);
      cleanup();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [fetchOnce, code, tables]);

  return { view, error, loading, refresh: fetchOnce };
}

// Stable anonymous participant identity, persisted per device.
export function useParticipant() {
  const [pid, setPid] = useState<string>("");
  const [nick, setNick] = useState<string>("");

  useEffect(() => {
    let id = localStorage.getItem("fpw:pid");
    if (!id) {
      id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem("fpw:pid", id);
    }
    setPid(id);
    setNick(localStorage.getItem("fpw:nick") ?? "");
  }, []);

  const saveNick = useCallback((n: string) => {
    setNick(n);
    localStorage.setItem("fpw:nick", n);
  }, []);

  return { pid, nick, saveNick };
}

// Live session view (uncertainty modes) — realtime-driven, no steady polling.
// intervalMs is accepted for call-site compatibility but ignored (realtime).
export function useSessionView(code: string, _intervalMs = 5000) {
  return useLiveView<SessionView>(code, "", SESSION_TABLES);
}

// Live Cards view (teams) — realtime-driven. intervalMs ignored (kept for compat).
export function useCardsView(code: string, _intervalMs = 5000) {
  return useLiveView<CardsView>(code, "/teams", CARDS_TABLES);
}

// Live Ripples view (the whole board) — realtime-driven.
export function useRipplesView(code: string) {
  return useLiveView<RipplesView>(code, "/ripples", RIPPLES_TABLES);
}

// Optimistic overlay for the card board. The realtime view is eventually-consistent
// but laggy (network → Postgres → broadcast → 250ms debounce → refetch), so writes
// feel slow and the tree re-renders only after the round-trip. This layers instant
// local mutations on top of the server list and reconciles them away as the refetch
// catches up. When nothing is pending it returns the server array *by reference*, so
// downstream memos (buildChildrenMap) don't churn.
export function useOptimisticCards(serverCards: RippleCard[]) {
  const [adds, setAdds] = useState<RippleCard[]>([]);
  const [deletes, setDeletes] = useState<Set<string>>(() => new Set());
  const [sorts, setSorts] = useState<Map<string, number>>(() => new Map());
  const [edits, setEdits] = useState<Map<string, string>>(() => new Map());
  const [seen, setSeen] = useState(serverCards);

  // Reconcile overlays the instant a fresh server list arrives — a render-time state
  // adjustment (not an effect, so no cascading double-paint): drop adds the server
  // now has, deletes it has honored, and sort overrides it has caught up to. Pruning
  // confirmed adds is what stops a since-deleted card from being resurrected by its
  // own stale optimistic entry. React re-runs this render with the pruned state
  // before committing, so `cards` below never flashes the unreconciled set.
  if (seen !== serverCards) {
    setSeen(serverCards);
    const ids = new Set(serverCards.map((c) => c.id));
    setAdds((prev) => (prev.some((a) => ids.has(a.id)) ? prev.filter((a) => !ids.has(a.id)) : prev));
    setDeletes((prev) => {
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
    setSorts((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const [id, s] of prev) {
        const server = serverCards.find((c) => c.id === id);
        if (!server || server.sort === s) {
          next.delete(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    setEdits((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const [id, t] of prev) {
        const server = serverCards.find((c) => c.id === id);
        if (!server || server.text === t) {
          next.delete(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }

  const cards = useMemo(() => {
    const serverIds = new Set(serverCards.map((c) => c.id));
    const merged = adds.length
      ? [...serverCards, ...adds.filter((a) => !serverIds.has(a.id))]
      : serverCards;
    if (!deletes.size && !sorts.size && !edits.size) return merged;
    return merged
      .filter((c) => !deletes.has(c.id))
      .map((c) => {
        if (!sorts.has(c.id) && !edits.has(c.id)) return c;
        return {
          ...c,
          ...(sorts.has(c.id) ? { sort: sorts.get(c.id)! } : {}),
          ...(edits.has(c.id) ? { text: edits.get(c.id)! } : {}),
        };
      });
  }, [serverCards, adds, deletes, sorts, edits]);

  const addLocal = useCallback((c: RippleCard) => setAdds((p) => [...p, c]), []);
  const removeLocal = useCallback((id: string) => setDeletes((p) => new Set(p).add(id)), []);
  const unremoveLocal = useCallback(
    (id: string) =>
      setDeletes((p) => {
        if (!p.has(id)) return p;
        const next = new Set(p);
        next.delete(id);
        return next;
      }),
    []
  );
  const reorderLocal = useCallback(
    (id: string, sort: number) => setSorts((p) => new Map(p).set(id, sort)),
    []
  );
  const editLocal = useCallback(
    (id: string, text: string) => setEdits((p) => new Map(p).set(id, text)),
    []
  );

  return { cards, addLocal, removeLocal, unremoveLocal, reorderLocal, editLocal };
}

// ---- Ripples write helpers ----
export async function postRipplePlayer(
  code: string,
  body: { participantId: string; displayName: string; teamId?: string; teamName?: string }
) {
  const res = await fetch(`/api/sessions/${encodeURIComponent(code)}/ripples/players`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
  return res.json();
}

export async function postRippleCard(
  code: string,
  body: {
    participantId: string;
    cardOrder: string;
    parentCardId?: string | null;
    text: string;
    sort?: number;
    section?: string | null;
  }
) {
  const res = await fetch(`/api/sessions/${encodeURIComponent(code)}/ripples/cards`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
  return res.json();
}

export async function reorderRippleCard(
  code: string,
  cardId: string,
  body: { participantId: string; sort: number }
) {
  const res = await fetch(
    `/api/sessions/${encodeURIComponent(code)}/ripples/cards/${encodeURIComponent(cardId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reorder", ...body }),
    }
  );
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
  return res.json();
}

export async function editRippleCard(
  code: string,
  cardId: string,
  body: { participantId: string; text: string }
) {
  const res = await fetch(
    `/api/sessions/${encodeURIComponent(code)}/ripples/cards/${encodeURIComponent(cardId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "text", ...body }),
    }
  );
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
  return res.json();
}

export async function patchRippleCard(
  code: string,
  cardId: string,
  body: { action: "flag" | "vote"; participantId: string }
) {
  const res = await fetch(
    `/api/sessions/${encodeURIComponent(code)}/ripples/cards/${encodeURIComponent(cardId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
  return res.json();
}

export async function deleteRippleCard(
  code: string,
  cardId: string,
  body: { participantId: string }
) {
  const res = await fetch(
    `/api/sessions/${encodeURIComponent(code)}/ripples/cards/${encodeURIComponent(cardId)}`,
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
  return res.json();
}

export async function postRippleChip(
  code: string,
  body: { participantId: string; cardId: string }
) {
  const res = await fetch(`/api/sessions/${encodeURIComponent(code)}/ripples/chips`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
  return res.json();
}

export async function deleteRippleChip(
  code: string,
  body: { participantId: string; cardId: string }
) {
  const res = await fetch(`/api/sessions/${encodeURIComponent(code)}/ripples/chips`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
  return res.json();
}

export async function postRippleSubmit(
  code: string,
  body: { participantId: string; answers: string[] }
) {
  const res = await fetch(`/api/sessions/${encodeURIComponent(code)}/ripples/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
  return res.json();
}

export async function postTeam(code: string, body: { name?: string }): Promise<{ team: Team }> {
  const res = await fetch(`/api/sessions/${encodeURIComponent(code)}/teams`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
  return res.json();
}

export async function patchTeam(
  code: string,
  teamId: string,
  body: {
    name?: string;
    assignSeed?: string;
    seedCardId?: string;
    keptIds?: string[];
    convergence?: string;
    worldTitle?: string;
    worldDescription?: string;
    primaryCondition?: string;
    definingCharacteristics?: string;
    centralTension?: string;
    newNormal?: string;
    brokenAssumption?: string;
    status?: TeamStatus;
    drawWildcard?: boolean;
  }
): Promise<{ team: Team }> {
  const res = await fetch(
    `/api/sessions/${encodeURIComponent(code)}/teams/${encodeURIComponent(teamId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
  return res.json();
}

// ---- write helpers ----
export async function postSubmission(
  code: string,
  body: {
    text: string;
    author: string;
    lean: string | null;
    participantId: string;
    scenarioUncertaintyId?: string;
  }
) {
  const res = await fetch(`/api/sessions/${encodeURIComponent(code)}/submissions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
  return res.json();
}

export async function postResponse(
  code: string,
  body: {
    kind: string;
    participantId: string;
    submissionId?: string | null;
    scenarioUncertaintyId?: string;
    pollKey?: string;
    value?: string;
    valueNumber?: number | null;
    label?: string;
  }
) {
  const res = await fetch(`/api/sessions/${encodeURIComponent(code)}/responses`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
  return res.json();
}

export async function deleteUpvote(
  code: string,
  body: { participantId: string; submissionId: string }
) {
  const res = await fetch(`/api/sessions/${encodeURIComponent(code)}/responses`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
  return res.json();
}

export async function patchSession(
  code: string,
  body: {
    status?: string;
    prompt?: string;
    currentUncertaintyId?: string;
    phase?: string;
    phaseEndsAt?: string | null;
    config?: Record<string, unknown>;
  }
) {
  const res = await fetch(`/api/sessions/${encodeURIComponent(code)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
  return res.json();
}
