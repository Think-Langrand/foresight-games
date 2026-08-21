"use client";

import { useState } from "react";
import { ScenarioBody } from "@/components/foresight/ScenarioBody";
import { ImplicationTree } from "@/components/workshop/ImplicationTree";
import { RippleHero } from "@/components/workshop/RippleArt";
import { downloadRipplesExport } from "@/components/workshop/ripplesExport";
import { useRipplesView, patchSession } from "@/components/workshop/hooks";
import {
  PHASE_LABELS,
  RIPPLE_PHASES,
  stepPhase,
  type RippleArtImage,
  type RipplePhase,
} from "@/lib/ripples-types";

export function RipplesPresentView({
  code,
  basePath = "",
  art = [],
}: {
  code: string;
  basePath?: string;
  art?: RippleArtImage[];
}) {
  const { view, error, loading, refresh } = useRipplesView(code);
  const [busy, setBusy] = useState(false);

  if (loading && !view) return <Centered>Loading…</Centered>;
  if (error && !view) return <Centered>{error}</Centered>;
  if (!view) return null;

  const { session, config, teams, players, cards } = view;
  const phase = session.phase as RipplePhase;
  const closed = session.status === "Closed";
  const submittedCount = players.filter((p) => p.submittedAt).length;
  const joinUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}${basePath}/workshop/s/${code}`
      : `${basePath}/workshop/s/${code}`;

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      refresh();
    } finally {
      setBusy(false);
    }
  }

  const goPhase = (target: RipplePhase) => act(() => patchSession(code, { phase: target }));
  const setStatus = (status: "Open" | "Closed") => act(() => patchSession(code, { status }));

  const phaseIdx = RIPPLE_PHASES.indexOf(phase);

  return (
    <main className="mx-auto min-h-screen max-w-[1200px] px-6 py-8">
      {/* header */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--rule)] pb-5">
        <div>
          <span className="eyebrow blue">Implication mapping · live</span>
          <h1 className="mt-2 text-[28px] font-extrabold uppercase leading-[1.05] tracking-tight">
            {config.scenarioTitle || "Implication mapping"}
          </h1>
        </div>
        <div className="text-right">
          <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">Join at</div>
          <a
            href={joinUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[15px] font-semibold text-blue underline underline-offset-2 hover:text-ink"
          >
            {joinUrl}
          </a>
          <div className="mt-2 inline-block rounded-[3px] border border-ink bg-lime px-4 py-2 text-[28px] font-extrabold uppercase tracking-[0.2em]">
            {code}
          </div>
        </div>
      </div>

      {/* facilitator control bar */}
      <div className="mt-4 flex flex-wrap items-center gap-2 border-b border-[var(--hairline)] pb-4">
        <button
          onClick={() => goPhase(stepPhase(phase, -1))}
          disabled={busy || phaseIdx <= 0}
          className="rounded-[2px] border border-ink bg-paper px-3 py-2 text-[11px] font-bold uppercase tracking-[0.08em] hover:bg-lime disabled:opacity-40"
        >
          ◀ Back
        </button>
        <span className="rounded-[2px] border border-ink bg-card px-3 py-2 text-[12px] font-bold uppercase tracking-[0.08em]">
          {PHASE_LABELS[phase]}
        </span>
        <button
          onClick={() => goPhase(stepPhase(phase, 1))}
          disabled={busy || phaseIdx >= RIPPLE_PHASES.length - 1}
          className="rounded-[2px] border border-ink bg-lime px-3 py-2 text-[11px] font-bold uppercase tracking-[0.08em] hover:bg-lime-deep disabled:opacity-40"
        >
          Next ▶
        </button>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => downloadRipplesExport(view)}
            className="rounded-[2px] border border-ink bg-paper px-3 py-2 text-[11px] font-bold uppercase tracking-[0.08em] hover:bg-lime"
          >
            ↓ Export JSON
          </button>
          {closed ? (
            <button
              onClick={() => setStatus("Open")}
              disabled={busy}
              className="rounded-[2px] border border-ink bg-paper px-3 py-2 text-[11px] font-bold uppercase tracking-[0.08em] hover:bg-lime disabled:opacity-40"
            >
              Re-open
            </button>
          ) : (
            <button
              onClick={() => setStatus("Closed")}
              disabled={busy}
              className="rounded-[2px] border border-ink bg-paper px-3 py-2 text-[11px] font-bold uppercase tracking-[0.08em] hover:bg-coral hover:text-white disabled:opacity-40"
            >
              Close
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 text-[12px] font-semibold text-muted">
        {teams.length} teams · {players.length} players · {cards.length} implications ·{" "}
        {submittedCount} submitted
      </div>

      {/* body */}
      {phase === "PREMISE" ? (
        <section className="mt-6 rounded-[3px] border border-[var(--hairline)] bg-card p-6">
          {art[0] && (
            <div className="mb-5">
              <RippleHero image={art[0]} alt={config.scenarioTitle} />
            </div>
          )}
          {config.premise ? (
            <ScenarioBody body={config.premise} />
          ) : (
            <p className="italic text-muted">No premise text.</p>
          )}
          {config.resolutions.length > 0 && (
            <dl className="mt-6 grid gap-2 border-t border-[var(--hairline)] pt-4 sm:grid-cols-2">
              {config.resolutions.map((r) => (
                <div key={r.uncertaintyId || r.title} className="border-l-2 border-[var(--lime-deep)] pl-3">
                  <dt className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted">{r.title}</dt>
                  <dd className="text-[13px]">{r.resolution}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>
      ) : teams.length === 0 ? (
        <div className="mt-10 text-center text-[15px] text-muted">
          Waiting for teams to join… Share the code <span className="font-bold text-ink">{code}</span>.
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-5">
          {teams.map((t) => {
            const tc = cards.filter((c) => c.teamId === t.id);
            const roster = players.filter((p) => p.teamId === t.id);
            const subs = roster.filter((p) => p.submittedAt).length;
            return (
              <section
                key={t.id}
                className="rounded-[3px] border border-[var(--hairline)] bg-card p-4"
                style={{ borderTop: `4px solid ${t.color}` }}
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-[15px] font-extrabold">{t.name}</span>
                  <span className="text-[11px] text-muted">
                    {roster.length} player{roster.length === 1 ? "" : "s"} · {tc.length} implications ·{" "}
                    {subs}/{roster.length} submitted
                  </span>
                </div>
                <ImplicationTree cards={tc} scenarioTitle={config.scenarioTitle} />
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 text-[15px] text-muted">
      {children}
    </main>
  );
}
