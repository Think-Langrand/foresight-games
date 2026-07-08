"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSessionView, patchSession } from "@/components/workshop/hooks";
import { Avg, Dist, PoleBar } from "@/components/workshop/bits";
import { dirColor } from "@/lib/ui";
import type { WorkshopMode, SessionStatus } from "@/lib/workshop-types";

export function PresentView({ code }: { code: string }) {
  const { view, error, loading, refresh } = useSessionView(code, 2000);
  const [origin, setOrigin] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  if (loading && !view) return <Centered>Loading session…</Centered>;
  if (error && !view) return <Centered>Session {code}: {error}</Centered>;
  if (!view) return null;

  const { session, context } = view;
  const showDivergent = session.mode === "Divergent" || session.mode === "Both";
  const showConvergent = session.mode === "Convergent" || session.mode === "Both";
  const joinUrl = origin ? `${origin}/workshop/s/${code}` : `/workshop/s/${code}`;

  async function setMode(mode: WorkshopMode) {
    setBusy(true);
    try {
      await patchSession(code, { mode });
      await refresh();
    } finally {
      setBusy(false);
    }
  }
  async function setStatus(status: SessionStatus) {
    setBusy(true);
    try {
      await patchSession(code, { status });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen">
      {/* Facilitator control strip */}
      <div className="sticky top-0 z-30 flex flex-wrap items-center gap-2 border-b border-[var(--rule)] bg-paper px-6 py-2.5">
        <Link href="/explore" className="eyebrow blue">
          ← Explore
        </Link>
        <span className="mx-2 text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
          Mode
        </span>
        {(["Divergent", "Convergent", "Both"] as WorkshopMode[]).map((m) => (
          <button
            key={m}
            disabled={busy}
            onClick={() => setMode(m)}
            className={
              "chip" + (session.mode === m ? " active" : "")
            }
            style={session.mode === m ? { background: "var(--ink)", borderColor: "var(--ink)" } : {}}
          >
            {m}
          </button>
        ))}
        <span className="ml-auto flex items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em]"
            style={{ color: session.status === "Open" ? "var(--green)" : "var(--muted)" }}
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: session.status === "Open" ? "var(--green)" : "var(--gray)" }}
            />
            {session.status}
          </span>
          {session.status === "Open" ? (
            <button disabled={busy} onClick={() => setStatus("Closed")} className="chip">
              Close
            </button>
          ) : (
            <button disabled={busy} onClick={() => setStatus("Open")} className="chip">
              Re-open
            </button>
          )}
        </span>
      </div>

      <div className="mx-auto max-w-[1100px] px-6 py-8">
        {/* Header + join */}
        <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-start">
          <div>
            <span className="eyebrow blue">{context?.driverName}</span>
            <h1 className="mt-2 text-[38px] font-extrabold uppercase leading-[1.02] tracking-tight">
              {context?.uncertaintyLabel}
            </h1>
            <p className="serif mt-3 text-[22px] italic leading-[1.3] text-ink">
              {session.prompt}
            </p>
          </div>
          <div className="rounded-[3px] border border-ink bg-card px-6 py-5 text-center">
            <div className="eyebrow">Join at</div>
            <div className="mt-1 text-[14px] font-semibold text-ink">
              {joinUrl.replace(/^https?:\/\//, "")}
            </div>
            <div className="mt-3 eyebrow">Code</div>
            <div className="mt-1 text-[46px] font-extrabold uppercase leading-none tracking-[0.14em]">
              {code}
            </div>
            <div className="mt-3 text-[12px] font-bold text-muted">
              {view.participantCount} in the room
            </div>
          </div>
        </div>

        {/* Pole lean */}
        {context && (
          <Panel title="Where the room lands">
            <PoleBar
              a={view.poleLean["Toward Pole A"]}
              neither={view.poleLean["Neither / both"]}
              b={view.poleLean["Toward Pole B"]}
              labelA={context.poleA}
              labelB={context.poleB}
            />
          </Panel>
        )}

        {/* Divergent: ranked ideas */}
        {showDivergent && (
          <Panel title={`Ideas from the room (${view.submissionCount})`}>
            {view.submissions.length === 0 ? (
              <Empty>Waiting for the first idea…</Empty>
            ) : (
              <div className="flex flex-col gap-2">
                {view.submissions.slice(0, 12).map((s, i) => (
                  <div
                    key={s.id}
                    className="flex items-start gap-4 rounded-[2px] border border-[var(--hairline)] bg-card p-3"
                  >
                    <div className="flex min-w-[46px] flex-none flex-col items-center rounded-[2px] bg-lime px-2 py-1">
                      <span className="text-[18px] font-extrabold leading-none tabular-nums">
                        {s.upvotes}
                      </span>
                      <span className="text-[8px] font-bold uppercase tracking-[0.08em]">
                        votes
                      </span>
                    </div>
                    <div className="min-w-0">
                      <div className="text-[15px] leading-[1.4]">
                        <span className="mr-2 text-muted">{i + 1}.</span>
                        {s.text}
                      </div>
                      <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.06em] text-muted">
                        {s.author || "Anonymous"}
                        {s.lean ? ` · ${s.lean.replace("Toward ", "")}` : ""}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        )}

        {/* Convergent: outcome reactions */}
        {showConvergent && context && (
          <Panel title="How the room reads the outcomes">
            <div className="grid gap-3 md:grid-cols-2">
              {context.outcomes.map((o) => {
                const stat = view.outcomeStats[o.id];
                const dc = dirColor(o.direction);
                return (
                  <div
                    key={o.id}
                    className="rounded-r-[2px] bg-card px-4 py-3"
                    style={{ borderLeft: `3px solid ${dc}` }}
                  >
                    <div className="text-[15px] font-bold">{o.label}</div>
                    <div className="mt-1 text-[12.5px] leading-[1.4] text-muted">
                      {o.narrative}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <MiniStat
                        label="Plausible"
                        avg={stat?.plausibility.avg ?? null}
                        dist={stat?.plausibility.dist ?? {}}
                        color="var(--blue)"
                      />
                      <MiniStat
                        label="Good for PH"
                        avg={stat?.desirability.avg ?? null}
                        dist={stat?.desirability.dist ?? {}}
                        color="var(--green)"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>
        )}
      </div>
    </main>
  );
}

function MiniStat({
  label,
  avg,
  dist,
  color,
}: {
  label: string;
  avg: number | null;
  dist: Record<number, number>;
  color: string;
}) {
  return (
    <div>
      <div className="mb-1 text-[9.5px] font-bold uppercase tracking-[0.07em] text-muted">
        {label}
      </div>
      <Avg value={avg} />
      <div className="mt-2">
        <Dist dist={dist} color={color} />
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <div className="mb-3 text-[12px] font-bold uppercase tracking-[0.14em]">{title}</div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-[14px] text-muted">{children}</div>;
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 text-[15px] text-muted">
      {children}
    </main>
  );
}
