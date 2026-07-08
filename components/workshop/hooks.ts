"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SessionView } from "@/lib/workshop-types";

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

// Poll a session's live view.
export function useSessionView(code: string, intervalMs = 2500) {
  const [view, setView] = useState<SessionView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const alive = useRef(true);

  const fetchOnce = useCallback(async () => {
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(code)}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Error ${res.status}`);
      }
      const data = (await res.json()) as SessionView;
      if (alive.current) {
        setView(data);
        setError(null);
      }
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [code]);

  useEffect(() => {
    alive.current = true;
    fetchOnce();
    const t = setInterval(fetchOnce, intervalMs);
    return () => {
      alive.current = false;
      clearInterval(t);
    };
  }, [fetchOnce, intervalMs]);

  return { view, error, loading, refresh: fetchOnce };
}

// ---- write helpers ----
export async function postSubmission(
  code: string,
  body: { text: string; author: string; lean: string | null; participantId: string }
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
    outcomeId?: string | null;
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

export async function patchSession(
  code: string,
  body: { mode?: string; status?: string; prompt?: string }
) {
  const res = await fetch(`/api/sessions/${encodeURIComponent(code)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
  return res.json();
}
