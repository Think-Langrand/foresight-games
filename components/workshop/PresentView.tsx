"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSessionView, patchSession } from "@/components/workshop/hooks";
import { PoleBar } from "@/components/workshop/bits";
import type { SessionStatus, ScenarioLite, UncertaintyResult } from "@/lib/workshop-types";

const EMPTY: UncertaintyResult = {
  submissions: [],
  poleLean: { "Toward Pole A": 0, "Toward Pole B": 0, "Neither / both": 0 },
  submissionCount: 0,
};

export function PresentView({
  code,
  scenarios,
}: {
  code: string;
  scenarios: ScenarioLite[];
}) {
  const { view, error, loading, refresh } = useSessionView(code, 2000);
  const [origin, setOrigin] = useState("");
  const [busy, setBusy] = useState(false);

  const byId = useMemo(() => new Map(scenarios.map((s) => [s.id, s])), [scenarios]);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  if (loading && !view) return <Centered>Loading session…</Centered>;
  if (error && !view) return <Centered>Session {code}: {error}</Centered>;
  if (!view) return null;

  const { session } = view;
  const isFull = session.scope === "Full";
  const participantPaced = isFull && session.pacing === "Participant-paced";
  const joinUrl = origin ? `${origin}/workshop/s/${code}` : `/workshop/s/${code}`;

  async function setStatus(status: SessionStatus) {
    setBusy(true);
    try {
      await patchSession(code, { status });
      await refresh();
    } finally {
      setBusy(false);
    }
  }
  async function goTo(id: string) {
    setBusy(true);
    try {
      await patchSession(code, { currentUncertaintyId: id });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  // Focused (Single or facilitator-paced): the current uncertainty.
  const activeId = session.uncertaintyId ?? "";
  const active = byId.get(activeId);
  const results = view.byUncertainty[activeId] ?? EMPTY;
  const position = scenarios.findIndex((s) => s.id === activeId);

  return (
    <main className="min-h-screen">
      {/* Facilitator control strip */}
      <div className="sticky top-0 z-30 flex flex-wrap items-center gap-2 border-b border-[var(--rule)] bg-paper px-6 py-2.5">
        <Link href="/explore" className="eyebrow blue">
          ← Explore
        </Link>
        <span className="mx-2 text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
          {isFull ? (participantPaced ? "Full · participant-paced" : "Full · facilitator-paced") : "Single"}
        </span>
        {isFull && !participantPaced && (
          <span className="flex items-center gap-2">
            <button
              disabled={busy || position <= 0}
              onClick={() => goTo(scenarios[position - 1].id)}
              className="chip"
            >
              ← Prev
            </button>
            <span className="text-[11px] font-bold tabular-nums text-muted">
              {position + 1} / {scenarios.length}
            </span>
            <button
              disabled={busy || position >= scenarios.length - 1}
              onClick={() => goTo(scenarios[position + 1].id)}
              className="chip"
            >
              Next →
            </button>
          </span>
        )}
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
            <span className="eyebrow blue">
              {participantPaced
                ? "The room is working through all uncertainties"
                : active?.capabilityDomain || active?.driverNames[0]}
            </span>
            <h1 className="mt-2 text-[38px] font-extrabold uppercase leading-[1.02] tracking-tight">
              {participantPaced ? "Live board" : active?.label}
            </h1>
            <p className="serif mt-3 text-[22px] italic leading-[1.3] text-ink">
              {participantPaced ? `${scenarios.length} scenario uncertainties` : active?.question}
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

        {participantPaced ? (
          <DashboardGrid scenarios={scenarios} byUncertainty={view.byUncertainty} />
        ) : (
          active && (
            <>
              <Panel title="Where the room lands">
                <PoleBar
                  a={results.poleLean["Toward Pole A"]}
                  neither={results.poleLean["Neither / both"]}
                  b={results.poleLean["Toward Pole B"]}
                  labelA={active.poleA}
                  labelB={active.poleB}
                />
              </Panel>
              <Panel title={`Ideas from the room (${results.submissionCount})`}>
                {results.submissions.length === 0 ? (
                  <Empty>Waiting for the first idea…</Empty>
                ) : (
                  <div className="flex flex-col gap-2">
                    {results.submissions.slice(0, 12).map((s, i) => (
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
            </>
          )
        )}
      </div>
    </main>
  );
}

function DashboardGrid({
  scenarios,
  byUncertainty,
}: {
  scenarios: ScenarioLite[];
  byUncertainty: Record<string, UncertaintyResult>;
}) {
  // Group by capability domain, preserving the (already domain-ordered) list.
  const groups: { domain: string; rows: ScenarioLite[] }[] = [];
  for (const s of scenarios) {
    const g = groups.find((x) => x.domain === s.capabilityDomain);
    if (g) g.rows.push(s);
    else groups.push({ domain: s.capabilityDomain, rows: [s] });
  }
  return (
    <div className="mt-8">
      {groups.map((g) => (
        <section key={g.domain} className="mb-7">
          <div className="mb-3 text-[12px] font-bold uppercase tracking-[0.14em]">
            {g.domain}
          </div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {g.rows.map((s) => {
              const r = byUncertainty[s.id] ?? EMPTY;
              const total =
                r.poleLean["Toward Pole A"] +
                r.poleLean["Toward Pole B"] +
                r.poleLean["Neither / both"];
              return (
                <div
                  key={s.id}
                  className="rounded-[2px] border border-[var(--hairline)] bg-card px-3 py-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-[13px] font-bold leading-[1.2]">
                      <span className="text-muted">{s.workshopId}</span> {s.label}
                    </div>
                    <div className="flex-none rounded-[2px] bg-lime px-2 py-0.5 text-[12px] font-extrabold tabular-nums">
                      {r.submissionCount}
                    </div>
                  </div>
                  <div className="mt-2 text-[10px] font-bold uppercase tracking-[0.06em] text-muted">
                    {r.submissionCount} idea{r.submissionCount === 1 ? "" : "s"} · {total} vote
                    {total === 1 ? "" : "s"}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
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
