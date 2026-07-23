"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { TeamResult } from "@/components/workshop/TeamResult";
import { roleHex } from "@/components/workshop/CardArt";
import { teamTriadIds, type Card, type Team } from "@/lib/workshop-types";
import type { DriverLite } from "@/lib/drivers-shared";

export function AdminCardsSession({
  code,
  teams,
  deck,
  drivers,
}: {
  code: string;
  teams: Team[];
  deck: Card[];
  drivers: DriverLite[];
}) {
  const router = useRouter();
  const byId = useMemo(() => new Map(deck.map((c) => [c.id, c])), [deck]);
  const driversBySlug = useMemo(() => new Map(drivers.map((d) => [d.slug, d])), [drivers]);
  const [spotlight, setSpotlight] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const total = teams.length;
  useEffect(() => {
    if (spotlight === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSpotlight(null);
      else if (e.key === "ArrowRight")
        setSpotlight((i) => (i === null || total === 0 ? i : (i + 1) % total));
      else if (e.key === "ArrowLeft")
        setSpotlight((i) => (i === null || total === 0 ? i : (i - 1 + total) % total));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [spotlight, total]);

  async function removeTeam(team: Team) {
    if (!confirm(`Delete team "${team.name || "Team"}"? This cannot be undone.`)) return;
    setDeleting(team.id);
    try {
      const res = await fetch(`/api/sessions/${code}/teams/${team.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Delete failed");
      setSpotlight(null);
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(null);
    }
  }

  if (teams.length === 0) {
    return <p className="mt-8 text-[14px] text-muted">No teams in this session.</p>;
  }

  return (
    <>
      <div className="mt-5 flex items-baseline justify-between">
        <span className="eyebrow ink">Teams</span>
        <span className="text-[12px] text-muted">
          {teams.filter((t) => t.status === "Submitted").length}/{teams.length} submitted
        </span>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {teams.map((t, i) => (
          <TeamTile
            key={t.id}
            team={t}
            byId={byId}
            onOpen={() => setSpotlight(i)}
            onDelete={() => removeTeam(t)}
            deleting={deleting === t.id}
          />
        ))}
      </div>

      {spotlight !== null && teams[spotlight] && (
        <Spotlight
          team={teams[spotlight]}
          byId={byId}
          driversBySlug={driversBySlug}
          index={spotlight}
          total={teams.length}
          onPrev={() => setSpotlight((i) => (i === null ? i : (i - 1 + total) % total))}
          onNext={() => setSpotlight((i) => (i === null ? i : (i + 1) % total))}
          onClose={() => setSpotlight(null)}
          onDelete={() => removeTeam(teams[spotlight])}
          deleting={deleting === teams[spotlight].id}
        />
      )}
    </>
  );
}

function TeamTile({
  team,
  byId,
  onOpen,
  onDelete,
  deleting,
}: {
  team: Team;
  byId: Map<string, Card>;
  onOpen: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const triad = teamTriadIds(team)
    .map((id) => byId.get(id))
    .filter((c): c is Card => Boolean(c));
  const submitted = team.status === "Submitted";
  return (
    <div
      className="flex flex-col rounded-[3px] border border-[var(--hairline)] bg-card p-4"
      style={{ borderTop: `4px solid ${team.color}` }}
    >
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-2">
          <span
            className="inline-block h-3.5 w-3.5 rounded-[2px] border border-ink"
            style={{ background: team.color }}
          />
          <span className="text-[14px] font-extrabold">{team.name || "Team"}</span>
        </span>
        <span
          className={
            "rounded-[2px] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] " +
            (submitted ? "bg-lime text-ink" : "border border-[var(--hairline)] text-muted")
          }
        >
          {submitted ? "Submitted" : "Drafting"}
        </span>
      </div>

      {team.worldTitle ? (
        <div className="mt-3 text-[17px] font-extrabold uppercase leading-[1.1] tracking-tight">
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
            style={{ borderLeft: `3px solid ${roleHex(c.role)}` }}
          >
            {c.title}
          </span>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-4 border-t border-[var(--hairline)] pt-3">
        <button
          onClick={onOpen}
          className="text-[11px] font-bold uppercase tracking-[0.06em] text-blue hover:underline"
        >
          View results →
        </button>
        <button
          onClick={onDelete}
          disabled={deleting}
          className="ml-auto text-[11px] font-bold uppercase tracking-[0.06em] text-coral hover:underline disabled:opacity-50"
        >
          {deleting ? "Deleting…" : "Delete"}
        </button>
      </div>
    </div>
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
  onDelete,
  deleting,
}: {
  team: Team;
  byId: Map<string, Card>;
  driversBySlug: Map<string, DriverLite>;
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const triad = teamTriadIds(team)
    .map((id) => byId.get(id))
    .filter((c): c is Card => Boolean(c));
  const wildcard = team.wildcardId ? byId.get(team.wildcardId) ?? null : null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-paper">
      <div className="flex items-center justify-between border-b border-[var(--rule)] px-5 py-3">
        <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
          Team {index + 1} of {total}
        </span>
        <div className="flex items-center gap-3">
          <button
            onClick={onDelete}
            disabled={deleting}
            className="text-[11px] font-bold uppercase tracking-[0.06em] text-coral hover:underline disabled:opacity-50"
          >
            {deleting ? "Deleting…" : "Delete team"}
          </button>
          <button
            onClick={onClose}
            className="rounded-[2px] border border-ink bg-paper px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] hover:bg-coral hover:text-white"
          >
            Close ✕
          </button>
        </div>
      </div>

      <div className="animate-rise flex-1 overflow-y-auto px-6 py-8 md:px-12">
        <TeamResult
          team={team}
          triad={triad}
          wildcard={wildcard}
          driversBySlug={driversBySlug}
          size="lg"
        />
      </div>

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
