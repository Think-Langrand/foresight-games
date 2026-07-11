"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function NewSessionForm({
  scenarioId,
  defaultPrompt,
}: {
  scenarioId: string;
  defaultPrompt: string;
  poleA: string;
  poleB: string;
}) {
  const router = useRouter();
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [facilitator, setFacilitator] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioId, mode: "Divergent", prompt, facilitator }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create session");
      router.push(`/workshop/s/${data.code}/present`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setBusy(false);
    }
  }

  return (
    <div className="mt-8">
      <div className="rounded-[3px] border border-[var(--hairline)] bg-card p-4">
        <div className="text-[14px] font-bold uppercase tracking-[0.05em]">Divergent</div>
        <div className="mt-1.5 text-[12px] leading-[1.45] text-muted">
          The room writes their own ways this could play out, then upvotes the sharpest.
        </div>
      </div>

      <label className="eyebrow mt-7 block" htmlFor="prompt">
        Prompt shown to the room
      </label>
      <textarea
        id="prompt"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={3}
        className="mt-2 w-full rounded-[2px] border border-[var(--hairline)] bg-card px-3 py-2.5 text-[14px] leading-[1.5] outline-none focus:border-ink"
      />

      <label className="eyebrow mt-5 block" htmlFor="fac">
        Facilitator (optional)
      </label>
      <input
        id="fac"
        value={facilitator}
        onChange={(e) => setFacilitator(e.target.value)}
        placeholder="Your name"
        className="mt-2 w-full max-w-xs rounded-[2px] border border-[var(--hairline)] bg-card px-3 py-2.5 text-[14px] outline-none focus:border-ink"
      />

      {error && <div className="mt-4 text-[13px] font-semibold text-coral">{error}</div>}

      <button
        onClick={create}
        disabled={busy}
        className="mt-8 rounded-[2px] border border-ink bg-lime px-7 py-3 text-[13px] font-bold uppercase tracking-[0.1em] hover:bg-lime-deep disabled:opacity-50"
      >
        {busy ? "Opening…" : "Open session →"}
      </button>
    </div>
  );
}
