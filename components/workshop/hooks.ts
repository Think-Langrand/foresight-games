"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { CardsView, SessionView, Team, TeamStatus } from "@/lib/workshop-types";
import type { CardKind, CardOrder, RippleCard, RipplesView } from "@/lib/ripples-types";
import type { CanvasCardPos, Pos, Region } from "@/lib/canvas-shape";

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
// steady polling — an idle room costs nothing. Falls back to a slow poll when realtime
// is not configured (missing anon key) OR when the channel cannot carry events.
const LIVE_POLL_MS = 8000;

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

    // The degraded-mode poll, shared by both branches: realtime not configured at all,
    // or a channel that exists but cannot carry events.
    let poll: ReturnType<typeof setInterval> | null = null;
    const startPoll = () => {
      if (poll) return; // idempotent: several CHANNEL_ERRORs must not stack intervals
      poll = setInterval(() => {
        if (document.visibilityState !== "hidden") fetchOnce();
      }, LIVE_POLL_MS);
    };
    const stopPoll = () => {
      if (poll) clearInterval(poll);
      poll = null;
    };

    if (sb) {
      const channel = sb.channel(`live:${code}`);
      for (const table of tables) {
        channel.on(
          "postgres_changes",
          { event: "*", schema: "public", table, filter: `code=eq.${code}` },
          kick
        );
      }
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          // Re-read on every (re)subscribe. supabase-js rejoins a dropped socket on its
          // own, but nothing replays the rows that changed while it was down, so without
          // this the board sits at its pre-drop state until the next change event happens
          // to land on it. The member's OWN writes still paint through the optimistic
          // overlay, which is what makes the stall invisible: nothing looks broken, they
          // simply stop seeing everyone else. Same pattern as useCanvasLayout below.
          stopPoll();
          fetchOnce();
          return;
        }
        // A socket that can never be established — hotel wifi, a guest VPN that blocks
        // wss:// — never reaches SUBSCRIBED, so healing on resubscribe does not help it.
        // Fall back to the same slow poll the no-realtime branch uses, and give it up if
        // the channel recovers.
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          startPoll();
        }
      });
      cleanup = () => {
        stopPoll();
        sb.removeChannel(channel);
      };
    } else {
      // No realtime configured (missing anon key): the poll is the only sync path.
      startPoll();
      cleanup = stopPoll;
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
  // Week 4's timeline: which two-year period a milestone was just dragged into. The
  // period lives in `section`, so this overlays that column rather than a dedicated one.
  const [sections, setSections] = useState<Map<string, string>>(() => new Map());
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
    setSections((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const [id, v] of prev) {
        const server = serverCards.find((c) => c.id === id);
        if (!server || server.section === v) {
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
      !shorts.size &&
      !sections.size
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
          !shorts.has(c.id) &&
          !sections.has(c.id)
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
          ...(sections.has(c.id) ? { section: sections.get(c.id)! } : {}),
        };
      });
  }, [serverCards, adds, deletes, sorts, edits, scores, reparents, parks, descs, shorts, sections]);

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
  const sectionLocal = useCallback(
    (id: string, section: string) => setSections((p) => new Map(p).set(id, section)),
    []
  );
  const dropSectionLocal = useCallback(
    (id: string) =>
      setSections((p) => {
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
    sectionLocal,
    dropSectionLocal,
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
    // Week 4 step 5: the earlier week's card a `pick` or `settled` mark is about.
    sourceCardId?: string;
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
// Move a Week 4 milestone to another two-year period. `period` is one of PERIODS' keys
// (lib/commitments-shape); the route refuses anything else with a 400 rather than storing
// a milestone that belongs to no column.
export async function periodRippleCard(
  code: string,
  cardId: string,
  body: { participantId: string; period: string }
) {
  const res = await fetch(`/api/sessions/${code}/ripples/cards/${cardId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "period", ...body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Could not move that milestone.");
  return data as { ok: true; period: string };
}

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

// ---------------------------------------------------------------------------
// The Session 3 clustering canvas (0028)
// ---------------------------------------------------------------------------

// Its own tables, and deliberately NOT in RIPPLES_TABLES. useLiveView answers any change
// by refetching the whole /ripples payload (five queries, every row, no limit) behind a
// 250ms debounce — fine for a card edit, ruinous for a position, which is the highest-
// frequency write on the board. One drag-end would cost every client in the room a full
// board refetch.
const CANVAS_TABLES = ["ripple_canvas_cards", "ripple_canvas_regions"] as const;

// How often to re-read the whole layout as a safety net. Applying realtime payloads
// directly is a round trip faster than refetching, but it is NOT self-healing the way
// refetch-on-anything is: a dropped event stays wrong forever. So the layout is re-read
// on reconnect, on tab focus, and on this heartbeat. ~150 small rows, so it is cheap.
const CANVAS_HEAL_MS = 60000;

export interface CanvasLayoutApi {
  positions: Map<string, Pos>;
  regions: Map<string, Region>;
  // False until the first fetch lands. The caller must not draw before it is true:
  // positions fall back to the wheel while `saved` is empty, so painting early shows the
  // map arrangement and then visibly snaps once the real layout arrives.
  ready: boolean;
  loading: boolean;
  error: string | null;
  // Pointer-down tier: while a card is held, incoming positions for it are kept out of
  // the way rather than yanking it from under the finger.
  hold: (itemId: string, pos: Pos | null) => void;
  // Write positions and/or regions, optimistically first. Batched because one gesture can
  // touch many rows (drawing a region, "Spread out").
  save: (cards: CanvasCardPos[], regions?: Region[]) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useCanvasLayout(
  code: string,
  participantId: string,
  enabled: boolean
): CanvasLayoutApi {
  const [serverCards, setServerCards] = useState<Map<string, Pos>>(() => new Map());
  const [serverRegions, setServerRegions] = useState<Map<string, Region>>(() => new Map());
  // Starts true only if the canvas is already open. There is no loading GATE on the
  // canvas: resolvePositions gives every card a seat without the server, so an unsettled
  // fetch shows cards at their fallback positions rather than an empty page.
  const [loading, setLoading] = useState(enabled);
  // Set once, on the first layout that arrives, and left set: reopening the canvas still
  // has the last layout in state, so only the very first open needs holding back.
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Three tiers, read in this order: held > pending > server.
  const [held, setHeld] = useState<Map<string, Pos>>(() => new Map());
  const [pending, setPending] = useState<Map<string, { pos: Pos; inflight: number }>>(
    () => new Map()
  );
  const [pendingRegions, setPendingRegions] = useState<Map<string, { region: Region; inflight: number }>>(
    () => new Map()
  );
  const alive = useRef(true);

  const fetchOnce = useCallback(async () => {
    if (!enabled) return;
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(code)}/ripples/canvas`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Error ${res.status}`);
      const data = (await res.json()) as { cards: CanvasCardPos[]; regions: Region[] };
      if (!alive.current) return;
      setServerCards(new Map(data.cards.map((c) => [c.itemId, { x: c.x, y: c.y }])));
      setServerRegions(new Map(data.regions.map((r) => [r.themeId, r])));
      setReady(true);
      setError(null);
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : "Failed to load the canvas");
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [code, enabled]);

  useEffect(() => {
    if (!enabled) return;
    alive.current = true;
    fetchOnce();

    const sb = supabaseBrowser();
    let cleanup = () => {};

    if (sb) {
      // A distinct topic from useLiveView's `live:${code}`. Two channels on one topic over
      // the same browser client is at best undefined behaviour in supabase-js.
      const channel = sb.channel(`live:${code}:canvas`);
      for (const table of CANVAS_TABLES) {
        channel.on(
          "postgres_changes",
          { event: "*", schema: "public", table, filter: `code=eq.${code}` },
          // Apply the payload rather than refetching. These rows are flat and tiny, so
          // `new` IS the whole truth — which is what makes a teammate's drag land in one
          // round trip with no debounce, and lets drag-end-only writes feel live.
          (payload: {
            eventType: string;
            new: Record<string, unknown>;
            old: Record<string, unknown>;
          }) => {
            if (!alive.current) return;
            const gone = payload.eventType === "DELETE";
            const row = (gone ? payload.old : payload.new) ?? {};
            if (table === "ripple_canvas_cards") {
              const id = row.item_id as string | undefined;
              if (!id) return;
              setServerCards((prev) => {
                const next = new Map(prev);
                if (gone) next.delete(id);
                else next.set(id, { x: Number(row.x), y: Number(row.y) });
                return next;
              });
            } else {
              const id = row.theme_id as string | undefined;
              if (!id) return;
              setServerRegions((prev) => {
                const next = new Map(prev);
                if (gone) next.delete(id);
                else
                  next.set(id, {
                    themeId: id,
                    x: Number(row.x),
                    y: Number(row.y),
                    w: Number(row.w),
                    h: Number(row.h),
                    shape: row.shape === "ellipse" ? "ellipse" : "rect",
                  });
                return next;
              });
            }
          }
        );
      }
      channel.subscribe((status) => {
        // Re-read on every (re)subscribe, so a reconnect cannot leave us holding a layout
        // that drifted while the socket was down.
        if (status === "SUBSCRIBED") fetchOnce();
      });
      cleanup = () => {
        sb.removeChannel(channel);
      };
    } else {
      const t = setInterval(() => {
        if (document.visibilityState !== "hidden") fetchOnce();
      }, 8000);
      cleanup = () => clearInterval(t);
    }

    const heartbeat = setInterval(() => {
      if (document.visibilityState !== "hidden") fetchOnce();
    }, CANVAS_HEAL_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") fetchOnce();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      alive.current = false;
      clearInterval(heartbeat);
      cleanup();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [code, enabled, fetchOnce]);

  // Reconcile the pending overlay against each fresh server map. `inflight === 0` is the
  // escape hatch, for the same reason the score overlay needs one: on a shared board a
  // teammate can write the same card after us, the server settles on THEIR value, ours
  // never comes back, and a match-only test would pin the card under this viewer's cursor
  // at a position nobody else can see.
  const [seenCards, setSeenCards] = useState(serverCards);
  if (seenCards !== serverCards) {
    setSeenCards(serverCards);
    setPending((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const [id, { pos, inflight }] of prev) {
        const server = serverCards.get(id);
        if (inflight === 0 || !server || (server.x === pos.x && server.y === pos.y)) {
          next.delete(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }

  // The same reconciliation, and the same escape hatch, for a theme's BOX.
  //
  // It had no `inflight` test for a long time and cleared only on an exact match, which
  // pinned a box in one viewer's window for good. The echo that would have matched can
  // simply never arrive: a backgrounded tab misses realtime frames — and backgrounding is
  // exactly what someone does when they move a theme in their other window — a write can
  // fail, the route clamps, or a teammate writes the same box after us and the server
  // settles on THEIR value. After that the overlay masks every refetch, so the box sat
  // where that window last dropped it and no later move could shift it.
  const [seenRegions, setSeenRegions] = useState(serverRegions);
  if (seenRegions !== serverRegions) {
    setSeenRegions(serverRegions);
    setPendingRegions((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const [id, { region: r, inflight }] of prev) {
        const server = serverRegions.get(id);
        if (
          inflight === 0 ||
          !server ||
          (server.x === r.x && server.y === r.y && server.w === r.w && server.h === r.h)
        ) {
          next.delete(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }

  // Return the server map BY REFERENCE when nothing is pending, so the containment memo
  // downstream doesn't churn on every unrelated render.
  const positions = useMemo(() => {
    if (!held.size && !pending.size) return serverCards;
    const merged = new Map(serverCards);
    for (const [id, { pos }] of pending) merged.set(id, pos);
    for (const [id, pos] of held) merged.set(id, pos);
    return merged;
  }, [serverCards, pending, held]);

  const regions = useMemo(() => {
    if (!pendingRegions.size) return serverRegions;
    const merged = new Map(serverRegions);
    for (const [id, { region }] of pendingRegions) merged.set(id, region);
    return merged;
  }, [serverRegions, pendingRegions]);

  const hold = useCallback((itemId: string, pos: Pos | null) => {
    setHeld((prev) => {
      const next = new Map(prev);
      if (pos) next.set(itemId, pos);
      else next.delete(itemId);
      return next;
    });
  }, []);

  const save = useCallback(
    async (cards: CanvasCardPos[], regionList?: Region[]) => {
      if (!cards.length && !regionList?.length) return;

      setPending((prev) => {
        const next = new Map(prev);
        for (const c of cards) {
          const was = next.get(c.itemId);
          next.set(c.itemId, {
            pos: { x: c.x, y: c.y },
            inflight: (was?.inflight ?? 0) + 1,
          });
        }
        return next;
      });
      if (regionList?.length) {
        setPendingRegions((prev) => {
          const next = new Map(prev);
          for (const r of regionList) {
            const was = next.get(r.themeId);
            next.set(r.themeId, { region: r, inflight: (was?.inflight ?? 0) + 1 });
          }
          return next;
        });
      }

      // Both overlays come off hold when the round trip ends, whether it worked or not.
      // Regions used to be left out of this, which is what stranded them.
      const settle = () => {
        setPending((prev) => {
          const next = new Map(prev);
          for (const c of cards) {
            const was = next.get(c.itemId);
            if (!was) continue;
            next.set(c.itemId, { ...was, inflight: Math.max(0, was.inflight - 1) });
          }
          return next;
        });
        if (regionList?.length) {
          setPendingRegions((prev) => {
            const next = new Map(prev);
            for (const r of regionList) {
              const was = next.get(r.themeId);
              if (!was) continue;
              next.set(r.themeId, { ...was, inflight: Math.max(0, was.inflight - 1) });
            }
            return next;
          });
        }
      };

      try {
        const res = await fetch(`/api/sessions/${encodeURIComponent(code)}/ripples/canvas`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ participantId, cards, regions: regionList ?? [] }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
        settle();
      } catch (e) {
        settle();
        throw e;
      }
    },
    [code, participantId]
  );

  return { positions, regions, ready, loading, error, hold, save, refresh: fetchOnce };
}
