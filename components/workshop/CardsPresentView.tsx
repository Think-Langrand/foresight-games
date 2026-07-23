"use client";

import { useEffect, useMemo, useState } from "react";
import { useCardsView, patchSession } from "@/components/workshop/hooks";
import { TeamResult } from "@/components/workshop/TeamResult";
import { CAPTURE_PROMPTS } from "@/lib/capture";
import { teamTriadIds, type Card, type Team } from "@/lib/workshop-types";
import type { DriverLite } from "@/lib/drivers-shared";

export function CardsPresentView({
  code,
  deck,
  drivers = [],
}: {
  code: string;
  deck: Card[];
  drivers?: DriverLite[];
}) {
  const { view, error, loading, refresh } = useCardsView(code, 4000);
  const byId = useMemo(() => new Map(deck.map((c) => [c.id, c])), [deck]);
  const driversBySlug = useMemo(() => new Map(drivers.map((d) => [d.slug, d])), [drivers]);
  const [busy, setBusy] = useState(false);
  const [spotlight, setSpotlight] = useState<number | null>(null);

  const teamCount = view?.teams.length ?? 0;
  useEffect(() => {
    if (spotlight === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSpotlight(null);
      else if (e.key === "ArrowRight")
        setSpotlight((i) => (i === null || teamCount === 0 ? i : (i + 1) % teamCount));
      else if (e.key === "ArrowLeft")
        setSpotlight((i) =>
          i === null || teamCount === 0 ? i : (i - 1 + teamCount) % teamCount
        );
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [spotlight, teamCount]);

  if (loading && !view) return <Centered>Loading…</Centered>;
  if (error && !view) return <Centered>{error}</Centered>;
  if (!view) return null;

  const { session, teams } = view;
  const closed = session.status === "Closed";
  const submitted = teams.filter((t) => t.status === "Submitted").length;
  const joinUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/workshop/s/${code}`
      : `/workshop/s/${code}`;

  async function setStatus(status: "Open" | "Closed") {
    setBusy(true);
    try {
      await patchSession(code, { status });
      refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-[1200px] px-6 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--rule)] pb-5">
        <div>
          <span className="eyebrow blue">Scenario cards · live</span>
          <h1 className="mt-2 text-[30px] font-extrabold uppercase leading-[1.05] tracking-tight">
            Build a future
          </h1>
          <p className="serif mt-1 text-[18px] italic text-muted">{session.prompt}</p>
        </div>
        <div className="text-right">
          <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
            Join at
          </div>
          <div className="text-[15px] font-semibold">{joinUrl}</div>
          <div className="mt-2 inline-block rounded-[3px] border border-ink bg-lime px-4 py-2 text-[28px] font-extrabold uppercase tracking-[0.2em]">
            {code}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px] text-muted">
        <span className="font-semibold">
          {teams.length} teams · {submitted} submitted
        </span>
        <div className="ml-auto flex items-center gap-2">
          {closed ? (
            <button
              onClick={() => setStatus("Open")}
              disabled={busy}
              className="rounded-[2px] border border-ink bg-paper px-4 py-2 text-[11px] font-bold uppercase tracking-[0.08em] hover:bg-lime disabled:opacity-50"
            >
              Re-open
            </button>
          ) : (
            <button
              onClick={() => setStatus("Closed")}
              disabled={busy}
              className="rounded-[2px] border border-ink bg-paper px-4 py-2 text-[11px] font-bold uppercase tracking-[0.08em] hover:bg-coral hover:text-white disabled:opacity-50"
            >
              Close session
            </button>
          )}
        </div>
      </div>

      {teams.length === 0 ? (
        <div className="mt-16 text-center text-[15px] text-muted">
          Waiting for teams to deal in… Share the code{" "}
          <span className="font-bold text-ink">{code}</span>.
        </div>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {teams.map((t, i) => (
            <TeamCard key={t.id} team={t} byId={byId} onOpen={() => setSpotlight(i)} />
          ))}
        </div>
      )}

      {spotlight !== null && teams[spotlight] && (
        <Spotlight
          team={teams[spotlight]}
          byId={byId}
          driversBySlug={driversBySlug}
          index={spotlight}
          total={teams.length}
          onPrev={() => setSpotlight((i) => (i === null ? i : (i - 1 + teams.length) % teams.length))}
          onNext={() => setSpotlight((i) => (i === null ? i : (i + 1) % teams.length))}
          onClose={() => setSpotlight(null)}
        />
      )}
    </main>
  );
}

function Spotlight({
  team,
  byId,
  driversBySlug,
  index,
  total,
  onPrev,
  onNext,
  onClose,
}: {
  team: Team;
  byId: Map<string, Card>;
  driversBySlug: Map<string, DriverLite>;
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  const triad = teamTriadIds(team)
    .map((id) => byId.get(id))
    .filter((c): c is Card => Boolean(c));
  const wildcard = team.wildcardId ? byId.get(team.wildcardId) ?? null : null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-paper">
      {/* top bar */}
      <div className="flex items-center justify-between border-b border-[var(--rule)] px-5 py-3">
        <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
          Team {index + 1} of {total}
        </span>
        <button
          onClick={onClose}
          className="rounded-[2px] border border-ink bg-paper px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] hover:bg-coral hover:text-white"
        >
          Close ✕
        </button>
      </div>

      {/* body */}
      <div className="animate-rise flex-1 overflow-y-auto px-6 py-8 md:px-12">
        <TeamResult
          team={team}
          triad={triad}
          wildcard={wildcard}
          driversBySlug={driversBySlug}
          size="lg"
        />
      </div>

      {/* nav */}
      <div className="flex items-center justify-between border-t border-[var(--rule)] px-5 py-3">
        <button
          onClick={onPrev}
          className="rounded-[2px] border border-ink bg-paper px-4 py-2 text-[12px] font-bold uppercase tracking-[0.08em] hover:bg-lime"
        >
          ‹ Prev
        </button>
        <span className="text-[11px] text-muted">← / → to move · Esc to close</span>
        <button
          onClick={onNext}
          className="rounded-[2px] border border-ink bg-paper px-4 py-2 text-[12px] font-bold uppercase tracking-[0.08em] hover:bg-lime"
        >
          Next ›
        </button>
      </div>
    </div>
  );
}

function TeamCard({
  team,
  byId,
  onOpen,
}: {
  team: Team;
  byId: Map<string, Card>;
  onOpen: () => void;
}) {
  const triad = teamTriadIds(team)
    .map((id) => byId.get(id))
    .filter((c): c is Card => Boolean(c));
  const wildcard = team.wildcardId ? byId.get(team.wildcardId) ?? null : null;
  const submitted = team.status === "Submitted";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="group flex cursor-pointer flex-col rounded-[3px] border border-[var(--hairline)] bg-card p-4 transition-shadow hover:border-ink hover:shadow-[0_2px_0_var(--ink)] focus:outline-none focus-visible:border-ink"
      style={{ borderTop: `4px solid ${team.color}` }}
    >
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-2">
          <span
            className="inline-block h-3.5 w-3.5 rounded-[2px] border border-ink"
            style={{ background: team.color }}
          />
          <span className="text-[14px] font-extrabold">{team.name}</span>
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted opacity-0 transition-opacity group-hover:opacity-100">
            Spotlight ⤢
          </span>
          <span
            className={
              "rounded-[2px] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] " +
              (submitted ? "bg-lime text-ink" : "border border-[var(--hairline)] text-muted")
            }
          >
            {submitted ? "Submitted" : "Drafting"}
          </span>
        </span>
      </div>

      {team.worldTitle ? (
        <div className="mt-3 text-[18px] font-extrabold uppercase leading-[1.1] tracking-tight">
          {team.worldTitle}
        </div>
      ) : (
        <div className="mt-3 text-[13px] italic text-muted">Untitled world</div>
      )}

      <div className="mt-2 flex flex-wrap gap-1.5">
        {triad.map((c) => (
          <span
            key={c.id}
            className="rounded-[2px] border border-[var(--hairline)] bg-paper px-2 py-1 text-[10.5px] font-semibold"
            style={{ borderLeft: `3px solid ${roleColor(c.role)}` }}
            title={c.dimension}
          >
            {c.title}
          </span>
        ))}
        {wildcard && (
          <span
            className="rounded-[2px] px-2 py-1 text-[10.5px] font-bold text-white"
            style={{ background: "var(--coral)" }}
            title={wildcard.dimension}
          >
            ⚡ {wildcard.title}
          </span>
        )}
      </div>

      {team.convergence && (
        <p className="serif mt-3 text-[13px] italic leading-[1.4] text-muted">
          {team.convergence}
        </p>
      )}
      {CAPTURE_PROMPTS.some((p) => team[p.key]) && (
        <dl className="mt-3 flex flex-col gap-2">
          {CAPTURE_PROMPTS.filter((p) => team[p.key]).map((p) => (
            <div key={p.key}>
              <dt className="text-[9px] font-bold uppercase tracking-[0.07em] text-muted">
                {p.label}
              </dt>
              <dd className="mt-0.5 text-[12.5px] leading-[1.4]">{team[p.key]}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function roleColor(role: Card["role"]): string {
  return role === "Wildcard"
    ? "var(--coral)"
    : role === "Edge"
      ? "var(--amber)"
      : "var(--lime-deep)";
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 text-[15px] text-muted">
      {children}
    </main>
  );
}
