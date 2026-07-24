"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { CardsView, SessionView, Team, TeamStatus } from "@/lib/workshop-types";

// Tables whose changes should refresh each view (filtered by session code).
const SESSION_TABLES = ["sessions", "submissions", "responses"] as const;
const CARDS_TABLES = ["sessions", "teams"] as const;

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
  body: { status?: string; prompt?: string; currentUncertaintyId?: string }
) {
  const res = await fetch(`/api/sessions/${encodeURIComponent(code)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
  return res.json();
}
