"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MarkText } from "@/components/Mark";
import type { Pacing } from "@/lib/workshop-types";

export default function WorkshopLanding() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [pacing, setPacing] = useState<Pacing>("Facilitator-paced");
  const [facilitator, setFacilitator] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function join(e: React.FormEvent) {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (c) router.push(`/workshop/s/${encodeURIComponent(c)}`);
  }

  async function startFull() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "Full", pacing, facilitator }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start workshop");
      router.push(`/workshop/s/${data.code}/present`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-[720px] px-6 py-16 md:py-24">
      <Link href="/" className="eyebrow blue">
        ← Home
      </Link>
      <h1 className="mt-4 text-[40px] font-extrabold uppercase leading-[1.02] tracking-tight">
        <MarkText>Workshop</MarkText>
      </h1>
      <p className="serif mt-5 text-[22px] leading-[1.35] text-ink">
        Run the whole set of scenario uncertainties live, or join a session on your phone.
      </p>

      <form
        onSubmit={join}
        className="mt-10 rounded-[3px] border border-[var(--hairline)] bg-card p-6"
      >
        <label className="eyebrow" htmlFor="code">
          Join with a code
        </label>
        <div className="mt-3 flex gap-2">
          <input
            id="code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABCD"
            maxLength={6}
            autoCapitalize="characters"
            autoCorrect="off"
            className="w-40 rounded-[2px] border border-ink bg-paper px-4 py-3 text-[24px] font-bold uppercase tracking-[0.2em] outline-none"
          />
          <button
            type="submit"
            className="rounded-[2px] border border-ink bg-lime px-6 py-3 text-[12px] font-bold uppercase tracking-[0.1em] hover:bg-lime-deep"
          >
            Join →
          </button>
        </div>
      </form>

      <div className="mt-6 rounded-[3px] border border-[var(--hairline)] bg-card p-6">
        <span className="eyebrow">Start the full workshop</span>
        <p className="mt-2 text-[14px] leading-[1.55] text-muted">
          One session that walks the room through all the scenario uncertainties, grouped by
          capability. You&apos;ll get a projection screen and a join code to share.
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {(
            [
              {
                key: "Facilitator-paced",
                title: "Facilitator-paced",
                body: "You drive. Everyone's phone follows the uncertainty on the screen as you step through them.",
              },
              {
                key: "Participant-paced",
                title: "Participant-paced",
                body: "Each person moves through the uncertainties themselves. The screen shows a live board of activity.",
              },
            ] as { key: Pacing; title: string; body: string }[]
          ).map((m) => (
            <button
              key={m.key}
              onClick={() => setPacing(m.key)}
              className={
                "rounded-[3px] border p-4 text-left transition-colors " +
                (pacing === m.key
                  ? "border-ink bg-lime"
                  : "border-[var(--hairline)] bg-paper hover:border-muted")
              }
            >
              <div className="text-[13px] font-bold uppercase tracking-[0.05em]">{m.title}</div>
              <div className="mt-1.5 text-[12px] leading-[1.45] text-muted">{m.body}</div>
            </button>
          ))}
        </div>

        <input
          value={facilitator}
          onChange={(e) => setFacilitator(e.target.value)}
          placeholder="Facilitator name (optional)"
          className="mt-4 w-full max-w-xs rounded-[2px] border border-[var(--hairline)] bg-paper px-3 py-2.5 text-[14px] outline-none focus:border-ink"
        />

        {error && <div className="mt-3 text-[13px] font-semibold text-coral">{error}</div>}

        <button
          onClick={startFull}
          disabled={busy}
          className="mt-5 rounded-[2px] border border-ink bg-lime px-7 py-3 text-[13px] font-bold uppercase tracking-[0.1em] hover:bg-lime-deep disabled:opacity-50"
        >
          {busy ? "Opening…" : "Start workshop →"}
        </button>
      </div>

      <div className="mt-6 rounded-[3px] border border-[var(--hairline)] bg-card p-6">
        <span className="eyebrow">Or run a single uncertainty</span>
        <p className="mt-2 text-[14px] leading-[1.55] text-muted">
          Open{" "}
          <Link href="/explore" className="font-semibold text-blue underline">
            Explore
          </Link>{" "}
          and hit <span className="font-semibold">Run workshop →</span> on any one scenario
          uncertainty for a focused session.
        </p>
      </div>
    </main>
  );
}
