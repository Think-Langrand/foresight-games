"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { CardsView, SessionView, Team, TeamStatus } from "@/lib/workshop-types";
import type { CardKind, CardOrder, RippleCard, RipplesView } from "@/lib/ripples-types";

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

// One or both axes of a key change's shared score. Partial throughout — the two 1–5
// button rows each send (and each optimistically apply) only their own axis.
export type ScorePatch = { plausibility?: number | null; impact?: number | null };

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
  // Week 3 clustering: where a dragged card now hangs, and its new depth-encoding order.
  // Only the MOVED card is overlaid — every view derives depth by WALKING parents
  // (depthByCard / indexSynthesisBoard), so its whole subtree re-renders at the new depth
  // for free and there is nothing per-descendant to track here.
  const [reparents, setReparents] = useState<
    Map<string, { parentId: string | null; order: CardOrder }>
  >(() => new Map());
  const [parks, setParks] = useState<Map<string, boolean>>(() => new Map());
  const [descs, setDescs] = useState<Map<string, string | null>>(() => new Map());
  const [shorts, setShorts] = useState<Map<string, boolean>>(() => new Map());
  // `inflight` counts this card's score writes that haven't come back yet. While any is
  // outstanding the overlay has to stand, because the server list in hand may predate it.
  const [scores, setScores] = useState<Map<string, { patch: ScorePatch; inflight: number }>>(
    () => new Map()
  );
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
    setReparents((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const [id, move] of prev) {
        const server = serverCards.find((c) => c.id === id);
        if (!server || (server.parentId ?? null) === move.parentId) {
          next.delete(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    setParks((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const [id, parked] of prev) {
        const server = serverCards.find((c) => c.id === id);
        if (!server || server.parked === parked) {
          next.delete(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    setDescs((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const [id, d] of prev) {
        const server = serverCards.find((c) => c.id === id);
        if (!server || server.description === d) {
          next.delete(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    setShorts((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const [id, v] of prev) {
        const server = serverCards.find((c) => c.id === id);
        if (!server || server.shortlisted === v) {
          next.delete(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    // Per-AXIS, not per-object: the two score rows write independently, so a
    // plausibility round-trip landing first must not drop a still-pending impact.
    //
    // `inflight === 0` is the escape hatch that keeps an overlay from sticking forever.
    // On a shared board another member can write the same axis after us; the server then
    // settles on THEIR value, ours never comes back, and a match-only test would pin this
    // viewer's rank badges and matrix chip to a number nobody else sees. So once our own
    // writes have all returned, the first server list after them wins whatever it says.
    setScores((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const [id, { patch, inflight }] of prev) {
        const server = serverCards.find((c) => c.id === id);
        const settled =
          !server ||
          inflight === 0 ||
          (Object.keys(patch) as (keyof ScorePatch)[]).every((axis) => server[axis] === patch[axis]);
        if (settled) {
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
    if (
      !deletes.size &&
      !sorts.size &&
      !edits.size &&
      !scores.size &&
      !reparents.size &&
      !parks.size &&
      !descs.size &&
      !shorts.size
    )
      return merged;
    return merged
      .filter((c) => !deletes.has(c.id))
      .map((c) => {
        if (
          !sorts.has(c.id) &&
          !edits.has(c.id) &&
          !scores.has(c.id) &&
          !reparents.has(c.id) &&
          !parks.has(c.id) &&
          !descs.has(c.id) &&
          !shorts.has(c.id)
        )
          return c;
        const move = reparents.get(c.id);
        return {
          ...c,
          ...(sorts.has(c.id) ? { sort: sorts.get(c.id)! } : {}),
          ...(edits.has(c.id) ? { text: edits.get(c.id)! } : {}),
          ...(scores.get(c.id)?.patch ?? {}),
          ...(move ? { parentId: move.parentId, order: move.order } : {}),
          ...(parks.has(c.id) ? { parked: parks.get(c.id)! } : {}),
          ...(descs.has(c.id) ? { description: descs.get(c.id)! } : {}),
          ...(shorts.has(c.id) ? { shortlisted: shorts.get(c.id)! } : {}),
        };
      });
  }, [serverCards, adds, deletes, sorts, edits, scores, reparents, parks, descs, shorts]);

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
  const reparentLocal = useCallback(
    (id: string, parentId: string | null, order: CardOrder) =>
      setReparents((p) => new Map(p).set(id, { parentId, order })),
    []
  );
  const dropReparentLocal = useCallback(
    (id: string) =>
      setReparents((p) => {
        if (!p.has(id)) return p;
        const next = new Map(p);
        next.delete(id);
        return next;
      }),
    []
  );
  const shortlistLocal = useCallback(
    (id: string, shortlisted: boolean) => setShorts((p) => new Map(p).set(id, shortlisted)),
    []
  );
  const dropShortlistLocal = useCallback(
    (id: string) =>
      setShorts((p) => {
        if (!p.has(id)) return p;
        const next = new Map(p);
        next.delete(id);
        return next;
      }),
    []
  );
  const describeLocal = useCallback(
    (id: string, description: string | null) => setDescs((p) => new Map(p).set(id, description)),
    []
  );
  const parkLocal = useCallback(
    (id: string, parked: boolean) => setParks((p) => new Map(p).set(id, parked)),
    []
  );
  const dropParkLocal = useCallback(
    (id: string) =>
      setParks((p) => {
        if (!p.has(id)) return p;
        const next = new Map(p);
        next.delete(id);
        return next;
      }),
    []
  );
  // MERGES rather than replaces, so setting impact doesn't wipe a plausibility write
  // that hasn't come back from the server yet. Call it as the write leaves; pair every
  // call with exactly one settleScoreLocal / dropScoreLocal when it comes back.
  const scoreLocal = useCallback(
    (id: string, patch: ScorePatch) =>
      setScores((p) => {
        const pending = p.get(id);
        return new Map(p).set(id, {
          patch: { ...pending?.patch, ...patch },
          inflight: (pending?.inflight ?? 0) + 1,
        });
      }),
    []
  );
  // The write came back OK. Hold the value one more beat — the server list in hand may
  // predate it — then let the next one settle the card, with our value or a teammate's.
  const settleScoreLocal = useCallback(
    (id: string) =>
      setScores((p) => {
        const pending = p.get(id);
        if (!pending) return p;
        return new Map(p).set(id, { ...pending, inflight: Math.max(0, pending.inflight - 1) });
      }),
    []
  );
  // The write was refused. Drop its axes outright so they fall back to the server's
  // value — never to a locally reconstructed "previous", which on a shared board is
  // itself just an older optimistic guess. Axes still in flight are left alone.
  const dropScoreLocal = useCallback(
    (id: string, axes: (keyof ScorePatch)[]) =>
      setScores((p) => {
        const pending = p.get(id);
        if (!pending) return p;
        const patch = { ...pending.patch };
        for (const axis of axes) delete patch[axis];
        const next = new Map(p);
        const inflight = Math.max(0, pending.inflight - 1);
        if (Object.keys(patch).length === 0) next.delete(id);
        else next.set(id, { patch, inflight });
        return next;
      }),
    []
  );

  return {
    cards,
    addLocal,
    removeLocal,
    unremoveLocal,
    reorderLocal,
    editLocal,
    reparentLocal,
    dropReparentLocal,
    parkLocal,
    dropParkLocal,
    describeLocal,
    shortlistLocal,
    dropShortlistLocal,
    scoreLocal,
    settleScoreLocal,
    dropScoreLocal,
  };
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
    // Omitted when copying — the route reads the text from the original (0023).
    text?: string;
    sort?: number;
    section?: string | null;
    cardKind?: CardKind | null; // Week 3: theme / hope / fear. Omit for an implication.
    description?: string | null;
    // Week 3: put an implication that is already on this board into another theme too.
    copyOfCardId?: string;
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

// Re-hang a card: cluster it into a theme, or pass parentCardId: null to send it back to
// the unclustered tray. The route recomputes the card_order of the whole moved subtree.
export async function reparentRippleCard(
  code: string,
  cardId: string,
  body: { participantId: string; parentCardId: string | null }
) {
  const res = await fetch(
    `/api/sessions/${encodeURIComponent(code)}/ripples/cards/${encodeURIComponent(cardId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reparent", ...body }),
    }
  );
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
  return res.json();
}

// Set (or, with an empty string, clear) a theme's description.
export async function describeRippleCard(
  code: string,
  cardId: string,
  body: { participantId: string; description: string }
) {
  const res = await fetch(
    `/api/sessions/${encodeURIComponent(code)}/ripples/cards/${encodeURIComponent(cardId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "description", ...body }),
    }
  );
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
  return res.json();
}

// Pick a risk or opportunity out for the committee shortlist, or unpick it.
export async function shortlistRippleCard(
  code: string,
  cardId: string,
  body: { participantId: string; shortlisted: boolean }
) {
  const res = await fetch(
    `/api/sessions/${encodeURIComponent(code)}/ripples/cards/${encodeURIComponent(cardId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "shortlist", ...body }),
    }
  );
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
  return res.json();
}

// Park a card in Week 3's tray, or unpark it. Nothing is deleted either way.
export async function parkRippleCard(
  code: string,
  cardId: string,
  body: { participantId: string; parked: boolean }
) {
  const res = await fetch(
    `/api/sessions/${encodeURIComponent(code)}/ripples/cards/${encodeURIComponent(cardId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "park", ...body }),
    }
  );
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
  return res.json();
}

// Set a key change's shared plausibility/impact score. Send only the axis that changed;
// the route leaves an absent axis alone.
export async function scoreRippleCard(
  code: string,
  cardId: string,
  body: { participantId: string } & ScorePatch
) {
  const res = await fetch(
    `/api/sessions/${encodeURIComponent(code)}/ripples/cards/${encodeURIComponent(cardId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "score", ...body }),
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
