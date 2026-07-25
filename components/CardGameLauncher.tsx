"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Home-page entry for the card game: start a fresh deal (creates a Cards session
// and jumps to the projector), or join an existing table with its code.
// Mirrors startCards()/join() from the workshop landing.
export function CardGameLauncher() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [facilitator, setFacilitator] = useState("");
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
        body: JSON.stringify({ scope: "Cards", facilitator }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start card game");
      router.push(`/workshop/s/${data.code}/present`);
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
      <span className="eyebrow">Play the card game</span>
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

      <input
        value={facilitator}
        onChange={(e) => setFacilitator(e.target.value)}
        placeholder="Facilitator name (optional)"
        className="mt-4 w-full max-w-xs rounded-[2px] border border-[var(--hairline)] bg-paper px-3 py-2.5 text-[14px] outline-none focus:border-ink"
      />

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
