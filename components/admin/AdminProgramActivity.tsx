"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ImplicationsPanel,
  WorksheetPanel,
  type ExerciseAnswers,
  type MapView,
} from "@/components/design-groups/AnswerPanels";
import { emptyTally, sumTallies, type CardTally } from "@/lib/design-activity-shape";
import type { ProgramDTO } from "@/lib/design-program-shape";

// The project's program week-first: a weeks × groups grid of what each group has added,
// and — when a week is open — that week's boards across every group behind a tab strip.
// Everything here is read-only. Deleting answers, seeding a map and export stay on the
// per-group answers page, which each tab links out to.

export interface WeekDetail {
  index: number; // 0-based into program.weeks
  title: string;
  groups: { groupId: string; exerciseId: string; answers: ExerciseAnswers }[];
}

// The four buckets, in the order they're built on a board.
const KINDS = [
  { key: "keyChanges", label: "key changes" },
  { key: "implications", label: "implications" },
  { key: "brainstorm", label: "brainstorm" },
  { key: "answers", label: "answers" },
] as const;

// `now` is stamped ONCE by the server page and passed down as a prop, never read from the
// clock during render: this component is server-rendered and then hydrated, and a lazy
// useState initializer runs again on the client, so a bucket boundary crossed between the
// two passes ("4m ago" → "5m ago") would be a hydration mismatch.
function relTime(iso: string | null, now: number): string {
  if (!iso) return "";
  const ms = now - Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  const mins = Math.round(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function AdminProgramActivity({
  slug,
  projectName,
  program,
  tallyByCode,
  peopleByCode,
  namesByPlayerId,
  weekDetail,
  now,
}: {
  slug: string;
  projectName: string;
  program: ProgramDTO;
  tallyByCode: Record<string, CardTally>;
  peopleByCode: Record<string, { players: number; submitted: number }>;
  namesByPlayerId: Record<string, string>;
  weekDetail?: WeekDetail;
  now: number; // epoch ms, stamped when the data was read (see relTime)
}) {
  const { weeks, groups } = program;

  // A group's board for a week — its code, tally and people — or null when it has no board.
  const cell = (weekIdx: number, groupId: string) => {
    const code = weeks[weekIdx]?.sessionByGroup[groupId] ?? null;
    if (!code) return null;
    const upper = code.toUpperCase();
    return {
      code,
      exerciseId: weeks[weekIdx].slots[groupId],
      tally: tallyByCode[upper] ?? emptyTally(),
      people: peopleByCode[upper] ?? { players: 0, submitted: 0 },
    };
  };

  const groupTotals = Object.fromEntries(
    groups.map((g) => [
      g.id,
      sumTallies(weeks.map((_, i) => cell(i, g.id)?.tally).filter((t): t is CardTally => !!t)),
    ])
  );
  const weekTotals = weeks.map((_, i) =>
    sumTallies(groups.map((g) => cell(i, g.id)?.tally).filter((t): t is CardTally => !!t))
  );
  const grandTotal = sumTallies(Object.values(groupTotals));

  return (
    <main className="mx-auto min-h-screen max-w-[1250px] px-5 py-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-[var(--rule)] pb-3">
        <div className="min-w-0">
          <Link href={`/admin/projects/${slug}`} className="eyebrow blue">
            ← Project admin
          </Link>
          <h1 className="mt-1 text-[24px] font-extrabold uppercase leading-[1.05] tracking-tight">
            {projectName} — Group activity
          </h1>
        </div>
        <span className="text-[12px] text-muted">
          {groups.length} group{groups.length === 1 ? "" : "s"} · {weeks.length} week
          {weeks.length === 1 ? "" : "s"} · {grandTotal.total} cards
        </span>
      </div>

      {groups.length === 0 || weeks.length === 0 ? (
        <p className="text-[14px] italic text-muted">
          This project has no design groups or weeks yet — set them up on the project admin page.
        </p>
      ) : (
        <ActivityGrid
          slug={slug}
          weeks={weeks}
          groups={groups}
          cell={cell}
          groupTotals={groupTotals}
          weekTotals={weekTotals}
          grandTotal={grandTotal}
          activeWeek={weekDetail?.index ?? null}
          now={now}
        />
      )}

      {weekDetail && (
        <WeekPanels
          slug={slug}
          detail={weekDetail}
          groups={groups}
          cell={cell}
          namesByPlayerId={namesByPlayerId}
        />
      )}
    </main>
  );
}

type CellFn = (weekIdx: number, groupId: string) => {
  code: string;
  exerciseId: string;
  tally: CardTally;
  people: { players: number; submitted: number };
} | null;

function ActivityGrid({
  slug,
  weeks,
  groups,
  cell,
  groupTotals,
  weekTotals,
  grandTotal,
  activeWeek,
  now,
}: {
  slug: string;
  weeks: ProgramDTO["weeks"];
  groups: ProgramDTO["groups"];
  cell: CellFn;
  groupTotals: Record<string, CardTally>;
  weekTotals: CardTally[];
  grandTotal: CardTally;
  activeWeek: number | null;
  now: number;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-[12px]">
        <thead>
          <tr className="border-b border-[var(--rule)] text-left">
            <th className="py-2 pr-3 font-bold uppercase tracking-[0.06em] text-muted">Group</th>
            {weeks.map((w, i) => (
              <th key={i} className="px-2 py-2 align-bottom">
                <Link
                  href={`/admin/projects/${slug}/activity?week=${i + 1}`}
                  scroll={false}
                  className={
                    "block rounded-[2px] px-2 py-1 transition-colors " +
                    (activeWeek === i ? "bg-ink text-paper" : "hover:bg-card")
                  }
                >
                  <span className="block text-[10px] font-bold uppercase tracking-[0.08em] opacity-70">
                    Week {i + 1}
                  </span>
                  <span className="block max-w-[130px] truncate font-bold">{w.title}</span>
                </Link>
              </th>
            ))}
            <th className="px-2 py-2 text-right font-bold uppercase tracking-[0.06em] text-muted">Total</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.id} className="border-b border-[var(--hairline)] align-top">
              <th className="py-2 pr-3 text-left font-normal">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-[2px] border border-ink"
                    style={{ background: g.color ?? "#ccc" }}
                  />
                  <span className="font-bold">{g.name}</span>
                </span>
                {g.scenarioTitle && (
                  <span className="mt-0.5 block max-w-[160px] truncate text-[11px] text-muted">
                    {g.scenarioTitle}
                  </span>
                )}
              </th>
              {weeks.map((_, i) => {
                const c = cell(i, g.id);
                return (
                  <td key={i} className="px-2 py-2">
                    {c ? (
                      <Cell
                        tally={c.tally}
                        people={c.people}
                        now={now}
                        href={`/admin/projects/${slug}/design-groups/${g.id}/answers?exercise=${c.exerciseId}`}
                      />
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                );
              })}
              <td className="px-2 py-2 text-right text-[15px] font-bold tabular-nums">
                {groupTotals[g.id]?.total ?? 0}
              </td>
            </tr>
          ))}
          <tr className="border-t-2 border-ink">
            <th className="py-2 pr-3 text-left font-bold uppercase tracking-[0.06em] text-muted">Total</th>
            {weekTotals.map((t, i) => (
              <td key={i} className="px-2 py-2 text-[15px] font-bold tabular-nums">
                {t.total}
              </td>
            ))}
            <td className="px-2 py-2 text-right text-[15px] font-bold tabular-nums">{grandTotal.total}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// One group's week: the total, then the four-way split so a pile of worksheet answers
// doesn't read like a deep implication map. Zero-count kinds are dropped to keep it quiet.
function Cell({
  tally,
  people,
  href,
  now,
}: {
  tally: CardTally;
  people: { players: number; submitted: number };
  href: string;
  now: number;
}) {
  const parts = KINDS.filter((k) => tally[k.key] > 0);
  return (
    <Link href={href} className="group block rounded-[2px] px-1 py-0.5 hover:bg-card">
      <span className="block text-[15px] font-bold tabular-nums group-hover:text-blue">
        {tally.total}
      </span>
      {parts.length > 0 ? (
        <span className="mt-0.5 block text-[10.5px] leading-[1.35] text-muted">
          {parts.map((k) => (
            <span key={k.key} className="block">
              <span className="tabular-nums">{tally[k.key]}</span> {k.label}
            </span>
          ))}
        </span>
      ) : (
        <span className="mt-0.5 block text-[10.5px] italic text-muted">nothing yet</span>
      )}
      <span className="mt-1 block text-[10px] uppercase tracking-[0.06em] text-muted">
        {people.players} {people.players === 1 ? "person" : "people"}
        {tally.lastAt && ` · ${relTime(tally.lastAt, now)}`}
      </span>
    </Link>
  );
}

// The open week across every group: pick a group, see its board exactly as the per-group
// answers viewer renders it (same shaping, same panels), read-only.
function WeekPanels({
  slug,
  detail,
  groups,
  cell,
  namesByPlayerId,
}: {
  slug: string;
  detail: WeekDetail;
  groups: ProgramDTO["groups"];
  cell: CellFn;
  namesByPlayerId: Record<string, string>;
}) {
  const [activeGroupId, setActiveGroupId] = useState(detail.groups[0]?.groupId);
  const [mapView, setMapView] = useState<MapView>("wheel");

  const active = detail.groups.find((d) => d.groupId === activeGroupId) ?? detail.groups[0];
  if (!active) {
    return (
      <section className="mt-10 border-t border-[var(--rule)] pt-5">
        <p className="text-[14px] italic text-muted">No group has this week yet.</p>
      </section>
    );
  }
  const activeGroup = groups.find((g) => g.id === active.groupId);
  const c = cell(detail.index, active.groupId);
  const contributors = Object.entries(c?.tally.byAuthor ?? {})
    .map(([id, n]) => ({ id, name: namesByPlayerId[id] ?? "Someone", n }))
    .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));

  return (
    <section className="mt-10 border-t border-[var(--rule)] pt-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-[18px] font-extrabold uppercase tracking-tight">
          Week {detail.index + 1} · {detail.title}
        </h2>
        {activeGroup && (
          <Link
            href={`/admin/projects/${slug}/design-groups/${active.groupId}/answers?week=${detail.index + 1}`}
            className="text-[11px] font-bold uppercase tracking-[0.08em] text-blue underline hover:text-ink"
          >
            Open {activeGroup.name}&rsquo;s answers →
          </Link>
        )}
      </div>

      <div role="tablist" aria-label="Groups" className="mt-3 mb-4 flex flex-wrap gap-1 border-b border-[var(--rule)]">
        {detail.groups.map((d) => {
          const g = groups.find((x) => x.id === d.groupId);
          const on = d.groupId === active.groupId;
          const total = cell(detail.index, d.groupId)?.tally.total ?? 0;
          return (
            <button
              key={d.groupId}
              role="tab"
              aria-selected={on}
              onClick={() => setActiveGroupId(d.groupId)}
              className={
                "-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-[12px] font-bold uppercase tracking-[0.06em] transition-colors " +
                (on ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink")
              }
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-[2px] border border-ink"
                style={{ background: g?.color ?? "#ccc" }}
              />
              {g?.name ?? "Group"}
              <span className="font-normal tabular-nums opacity-70">{total}</span>
            </button>
          );
        })}
      </div>

      {active.answers.kind === "worksheet" && <WorksheetPanel ex={active.answers} showMeta />}
      {active.answers.kind === "implications" && (
        <ImplicationsPanel ex={active.answers} view={mapView} setView={setMapView} showMeta />
      )}
      {active.answers.kind === "placeholder" && (
        <p className="text-[14px] italic text-muted">
          {active.answers.unavailable
            ? "This week's board couldn't be loaded."
            : "This week hasn't been built yet."}
        </p>
      )}

      {contributors.length > 0 && (
        <div className="mt-6 border-t border-[var(--hairline)] pt-3">
          <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted">Who added what</span>
          <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
            {contributors.map((p) => (
              <li key={p.id}>
                <span className="font-semibold">{p.name}</span>{" "}
                <span className="tabular-nums text-muted">{p.n}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
