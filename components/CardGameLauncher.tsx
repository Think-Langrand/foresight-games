"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// Home-page entry for the card game: start a fresh deal (creates a Cards session
// and jumps to the projector), or join an existing table with its code.
// Mirrors startCards()/join() from the workshop landing. A project can be selected
// so the game runs on that project's Carmelita deck with results isolated to it
// ("" = the global game); the global /workshop route redirects project sessions
// to their gated project route, so joining by code stays correct either way.
export function CardGameLauncher({
  projects = [],
  lockedProject,
}: {
  projects?: { slug: string; name: string }[];
  // When set (project admin dashboard), the game always runs under this project —
  // no selector, no "Global" option.
  lockedProject?: { slug: string; name: string };
}) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [facilitator, setFacilitator] = useState("");
  const [projectSlug, setProjectSlug] = useState(lockedProject?.slug ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function join(e: React.FormEvent) {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (c) router.push(`/workshop/s/${encodeURIComponent(c)}`);
  }

  async function startCards() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: "Cards",
          facilitator,
          projectSlug: projectSlug || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start card game");
      const base = projectSlug ? `/project/${projectSlug}` : "";
      router.push(`${base}/workshop/s/${data.code}/present`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setBusy(false);
    }
  }

  return (
    <div
      className="rounded-[3px] border border-[var(--hairline)] bg-card p-6"
      style={{ borderTop: "3px solid var(--lime-deep)" }}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="eyebrow">Play the card game</span>
        <Link
          href="/scenario-molecules"
          className="text-[11px] font-bold uppercase tracking-[0.06em] text-blue underline hover:text-ink"
        >
          View entries →
        </Link>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="font-sans text-[26px] font-extrabold uppercase tracking-tight">
          Card Game
        </span>
      </div>
      <p className="mt-3 text-[13.5px] leading-[1.55] text-muted">
        Deal a new deck: teams get a seed outcome card and a hand to choose from, then combine three
        cards from different dimensions into a mini future scenario. Finished worlds land on the
        projector.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          value={facilitator}
          onChange={(e) => setFacilitator(e.target.value)}
          placeholder="Facilitator name (optional)"
          className="w-full max-w-xs rounded-[2px] border border-[var(--hairline)] bg-paper px-3 py-2.5 text-[14px] outline-none focus:border-ink"
        />
        {lockedProject ? (
          <span className="text-[12px] font-semibold text-muted">
            Project: <span className="text-ink">{lockedProject.name}</span>
          </span>
        ) : projects.length > 0 ? (
          <label className="flex items-center gap-2 text-[12px] font-semibold text-muted">
            Project
            <select
              value={projectSlug}
              onChange={(e) => setProjectSlug(e.target.value)}
              className="rounded-[2px] border border-[var(--hairline)] bg-paper px-2 py-2 text-[13px] text-ink outline-none focus:border-ink"
            >
              <option value="">Global (shared deck)</option>
              {projects.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {error && <div className="mt-3 text-[13px] font-semibold text-coral">{error}</div>}

      <div className="mt-4 flex flex-wrap items-end gap-6">
        <button
          onClick={startCards}
          disabled={busy}
          className="rounded-[2px] border border-ink bg-lime px-7 py-3 text-[13px] font-bold uppercase tracking-[0.1em] hover:bg-lime-deep disabled:opacity-50"
        >
          {busy ? "Dealing…" : "Start card game →"}
        </button>

        <form onSubmit={join} className="flex items-end gap-2">
          <div>
            <label className="eyebrow" htmlFor="code">
              Join a table
            </label>
            <input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABCD"
              maxLength={6}
              autoCapitalize="characters"
              autoCorrect="off"
              className="mt-2 block w-32 rounded-[2px] border border-ink bg-paper px-3 py-2.5 text-[18px] font-bold uppercase tracking-[0.2em] outline-none"
            />
          </div>
          <button
            type="submit"
            className="rounded-[2px] border border-ink bg-paper px-5 py-2.5 text-[12px] font-bold uppercase tracking-[0.1em] hover:bg-lime"
          >
            Join →
          </button>
        </form>
      </div>
    </div>
  );
}
