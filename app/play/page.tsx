"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { postTeam } from "@/components/workshop/hooks";
import type { Team } from "@/lib/workshop-types";

// The device's private "world-book": every scenario this person has built solo.
// Worlds are teams in a per-device Solo session whose code lives in localStorage;
// there's no lobby and no code to share — just build, and build another.
const SOLO_CODE_KEY = "fpw:solo:code";

export default function PlayPage() {
  const router = useRouter();
  const [code, setCode] = useState<string | null>(null);
  const [worlds, setWorlds] = useState<Team[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load this device's solo session code, then its worlds.
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(SOLO_CODE_KEY);
    } catch {
      stored = null;
    }
    setCode(stored);
    if (!stored) {
      setWorlds([]);
      return;
    }
    (async () => {
      try {
        const res = await fetch(`/api/sessions/${encodeURIComponent(stored)}/teams`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { teams: Team[] };
        setWorlds(data.teams ?? []);
      } catch {
        // Session gone (e.g. cleaned up in admin) — start fresh next build.
        setWorlds([]);
      }
    })();
  }, []);

  // Create a solo session on demand, remember its code.
  const ensureSession = useCallback(async (): Promise<string> => {
    if (code) return code;
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope: "Solo" }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to start");
    try {
      localStorage.setItem(SOLO_CODE_KEY, data.code);
    } catch {
      // Non-fatal: the session still works this visit; it just won't be recalled.
    }
    setCode(data.code);
    return data.code as string;
  }, [code]);

  async function buildNew() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const c = await ensureSession();
      const n = (worlds?.length ?? 0) + 1;
      const { team } = await postTeam(c, { name: `World ${n}` });
      router.push(`/workshop/s/${c}?team=${encodeURIComponent(team.id)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to deal a new world");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-[720px] px-6 py-12 md:py-16">
      <Link href="/" className="eyebrow blue">
        ← Home
      </Link>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-b border-[var(--rule)] pb-5">
        <div>
          <span className="eyebrow ink">Solo play</span>
          <h1 className="mt-2 text-[34px] font-extrabold uppercase leading-[1.03] tracking-tight md:text-[40px]">
            Your Worlds
          </h1>
        </div>
        <Link
          href="/scenario-molecules"
          className="text-[11px] font-bold uppercase tracking-[0.06em] text-blue underline hover:text-ink"
        >
          View all entries →
        </Link>
      </div>
      <p className="serif mt-4 max-w-[560px] text-[18px] leading-[1.35] text-ink">
        Deal yourself a hand of outcomes and build a small future scenario. Worlds you finish also
        land in the shared gallery.
      </p>

      {error && <div className="mt-5 text-[13px] font-semibold text-coral">{error}</div>}

      <div className="mt-6">
        <button
          onClick={buildNew}
          disabled={busy}
          className="rounded-[2px] border border-ink bg-lime px-7 py-3 text-[13px] font-bold uppercase tracking-[0.1em] hover:bg-lime-deep disabled:opacity-50"
        >
          {busy ? "Dealing…" : "+ Build a new world"}
        </button>
      </div>

      {worlds === null ? (
        <p className="mt-10 text-[15px] text-muted">Loading your worlds…</p>
      ) : worlds.length === 0 ? (
        <p className="mt-10 text-[15px] text-muted">
          No worlds yet on this device. Deal your first one above.
        </p>
      ) : (
        <div className="mt-8">
          <span className="eyebrow ink">On this device · {worlds.length}</span>
          <div className="mt-3 flex flex-col gap-2">
            {worlds.map((w) => {
              const submitted = w.status === "Submitted";
              return (
                <Link
                  key={w.id}
                  href={`/workshop/s/${code}?team=${encodeURIComponent(w.id)}`}
                  className="group flex items-start gap-3 rounded-[3px] border border-[var(--hairline)] bg-card p-4 transition-shadow hover:border-ink hover:shadow-[0_2px_0_var(--ink)]"
                  style={{ borderLeft: `4px solid ${w.color}` }}
                >
                  <span
                    className="mt-1 inline-block h-3.5 w-3.5 flex-none rounded-[2px] border border-ink"
                    style={{ background: w.color }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[16px] font-extrabold leading-[1.15]">
                      {w.worldTitle || (
                        <span className="italic text-muted">{w.name || "Untitled world"}</span>
                      )}
                    </span>
                    {w.convergence && (
                      <span className="serif mt-1 line-clamp-2 block text-[13px] italic leading-[1.4] text-muted">
                        {w.convergence}
                      </span>
                    )}
                  </span>
                  <span className="flex-none text-[10px] font-bold uppercase tracking-[0.08em] text-muted">
                    {submitted ? "✓ Done" : "Draft"}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </main>
  );
}
