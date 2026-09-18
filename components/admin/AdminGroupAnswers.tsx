"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { csvCell, download } from "@/components/admin/exportUtils";
import { ConfirmModal } from "@/components/ConfirmModal";
import {
  ImplicationsPanel,
  WorksheetPanel,
  type AnswerRow,
  type ExerciseAnswers,
  type MapView,
  type QuestionBlock,
} from "@/components/design-groups/AnswerPanels";
import { enumerateChains } from "@/lib/ripples-types";

// Admin view of a design group's answers, one tab per exercise (week). Each tab renders in
// its exercise's natural shape (the shared read-only panels in AnswerPanels) — worksheet
// Q&A, implication futures-wheel, or a "not built yet" note. Admins can delete a single
// answer, clear a week's board, or reset the whole group (each behind a confirm; card
// deletes are irreversible), seed an implications map from earlier weeks, and export.

export interface GroupAnswersData {
  groupName: string;
  scenarioTitle: string | null;
  exercises: ExerciseAnswers[];
}

// Max answers per seed request — must match MAX_SEED in the .../design-groups/[groupId]/seed route.
const SEED_BATCH = 50;

type Pending =
  | { kind: "answer"; exerciseId: string; cardId: string; label: string }
  | { kind: "clear"; exerciseId: string; label: string }
  | { kind: "reset"; label: string };

const btn =
  "rounded-[2px] border border-ink bg-paper px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.06em] hover:bg-lime disabled:opacity-40";
const dangerBtn =
  "rounded-[2px] border border-coral px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-coral hover:bg-coral hover:text-white disabled:opacity-40";

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "group";
}

export function AdminGroupAnswers({
  data,
  backHref,
  projectId,
  groupId,
  initialExerciseId,
}: {
  data: GroupAnswersData;
  backHref: string;
  projectId: string;
  groupId: string;
  initialExerciseId?: string;
}) {
  const router = useRouter();
  const exercises = data.exercises;
  const initial = exercises.find((e) => e.exerciseId === initialExerciseId) ?? exercises[0];
  const [activeId, setActiveId] = useState<string | undefined>(initial?.exerciseId);
  const [mapView, setMapView] = useState<MapView>("wheel");
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [seedMsg, setSeedMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const active = exercises.find((e) => e.exerciseId === activeId) ?? initial;
  const cardsBase = `/api/admin/projects/${projectId}/design-groups/${groupId}/cards`;

  // Copy earlier-week answers onto the active implications map as key changes (FIRST).
  // Never throws — reports the outcome inline under the seed panel.
  async function runSeed(sourceCardIds: string[]): Promise<boolean> {
    if (!active || sourceCardIds.length === 0) return false;
    setSeeding(true);
    setSeedMsg(null);
    let added = 0;
    let skipped = 0;
    try {
      // The route caps one request at SEED_BATCH answers; "Add all" can exceed that.
      for (let i = 0; i < sourceCardIds.length; i += SEED_BATCH) {
        const res = await fetch(`/api/admin/projects/${projectId}/design-groups/${groupId}/seed`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ exerciseId: active.exerciseId, sourceCardIds: sourceCardIds.slice(i, i + SEED_BATCH) }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string; added?: number; skipped?: number };
        if (!res.ok) throw new Error(data.error || "Seeding failed.");
        added += data.added ?? 0;
        skipped += data.skipped ?? 0;
      }
      setSeedMsg({
        tone: "ok",
        text:
          `Added ${added} key change${added === 1 ? "" : "s"} to the map.` +
          (skipped ? ` ${skipped} already there.` : ""),
      });
      router.refresh();
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Seeding failed — please try again.";
      // Earlier batches may already have landed — say so and show them.
      setSeedMsg({ tone: "err", text: added ? `${msg} (${added} added before the error.)` : msg });
      if (added) router.refresh();
      return false;
    } finally {
      setSeeding(false);
    }
  }

  // Seed candidates: section-tagged answers from every other week of this group.
  const seedSources: SeedSource[] = exercises
    .flatMap((ex) =>
      ex.exerciseId === active?.exerciseId || ex.kind === "placeholder"
        ? []
        : ex.questions
            .filter((q) => q.answers.length > 0)
            .map((q) => ({ key: `${ex.exerciseId}:${q.key}`, weekTitle: ex.title, question: q }))
    )
    .sort((a, b) => Number(isKeyChanges(b.question)) - Number(isKeyChanges(a.question)));

  // Never throws — on failure it keeps the modal open and surfaces a message rather than
  // leaving an unhandled rejection.
  async function runDelete(p: Pending) {
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (p.kind !== "reset") params.set("exerciseId", p.exerciseId);
      if (p.kind === "answer") params.set("cardId", p.cardId);
      const qs = params.toString();
      const res = await fetch(qs ? `${cardsBase}?${qs}` : cardsBase, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Delete failed.");
      }
      router.refresh(); // re-shape from the server
      setPending(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed — please try again.");
    } finally {
      setBusy(false);
    }
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const base = `answers-${slugify(data.groupName)}-${stamp}`;
  const exportJson = () => download(JSON.stringify(data, null, 2), `${base}.json`, "application/json");
  const exportCsv = () => {
    const lines = [["Week", "Section", "Kind", "Content", "Author", "Created"].map(csvCell).join(",")];
    for (const ex of exercises) {
      if (ex.kind === "worksheet") {
        for (const q of ex.questions)
          for (const a of q.answers)
            lines.push([ex.title, q.label || q.key, q.kind, a.text, a.author, a.createdAt].map(csvCell).join(","));
      } else if (ex.kind === "implications") {
        const teamId = ex.cards[0]?.teamId ?? "";
        for (const c of enumerateChains(ex.cards, [], teamId))
          lines.push([ex.title, "Implication chain", "implications", c.chain.join(" → "), "", ""].map(csvCell).join(","));
        for (const n of ex.brainstorm)
          lines.push([ex.title, "Brainstorm", "brainstorm", n.text, n.author, n.createdAt].map(csvCell).join(","));
        for (const q of ex.questions)
          for (const a of q.answers)
            lines.push([ex.title, q.label || q.key, q.kind, a.text, a.author, a.createdAt].map(csvCell).join(","));
      }
    }
    download("﻿" + lines.join("\r\n"), `${base}.csv`, "text/csv;charset=utf-8;");
  };

  const hasContent = exercises.some(
    (ex) =>
      (ex.kind === "worksheet" && ex.questions.some((q) => q.answers.length > 0)) ||
      (ex.kind === "implications" &&
        (ex.cards.length > 0 || ex.brainstorm.length > 0 || ex.questions.some((q) => q.answers.length > 0)))
  );
  const activeBoardBacked = active && active.kind !== "placeholder";
  const onDeleteAnswer =
    active && active.kind !== "placeholder"
      ? (row: AnswerRow) =>
          setPending({ kind: "answer", exerciseId: active.exerciseId, cardId: row.id, label: row.text })
      : undefined;

  return (
    <main className="mx-auto min-h-screen max-w-[1100px] px-5 py-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-[var(--rule)] pb-3">
        <div className="min-w-0">
          <Link href={backHref} className="eyebrow blue">
            ← Project admin
          </Link>
          <h1 className="mt-1 text-[24px] font-extrabold uppercase leading-[1.05] tracking-tight">
            {data.groupName} — Answers
          </h1>
          {data.scenarioTitle && <p className="mt-0.5 text-[13px] text-muted">{data.scenarioTitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportJson} disabled={!hasContent} className={btn}>
            ↓ JSON
          </button>
          <button onClick={exportCsv} disabled={!hasContent} className={btn}>
            ↓ CSV
          </button>
          <button
            onClick={() => setPending({ kind: "reset", label: data.groupName })}
            disabled={busy || !hasContent}
            className={dangerBtn}
          >
            Reset group
          </button>
        </div>
      </div>

      {exercises.length === 0 ? (
        <p className="text-[14px] italic text-muted">This group has no exercises yet.</p>
      ) : (
        <>
          <div role="tablist" aria-label="Exercises" className="mb-4 flex flex-wrap gap-1 border-b border-[var(--rule)]">
            {exercises.map((ex) => {
              const on = ex.exerciseId === active?.exerciseId;
              return (
                <button
                  key={ex.exerciseId}
                  role="tab"
                  aria-selected={on}
                  onClick={() => {
                    setActiveId(ex.exerciseId);
                    setSeedMsg(null);
                  }}
                  className={
                    "-mb-px border-b-2 px-3 py-2 text-[12px] font-bold uppercase tracking-[0.06em] transition-colors " +
                    (on ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink")
                  }
                >
                  {ex.title}
                </button>
              );
            })}
          </div>

          {activeBoardBacked && (
            <div className="mb-4 flex justify-end">
              <button
                onClick={() => active && setPending({ kind: "clear", exerciseId: active.exerciseId, label: active.title })}
                disabled={busy}
                className={dangerBtn}
              >
                Clear this week
              </button>
            </div>
          )}

          {active && active.kind === "worksheet" && <WorksheetPanel ex={active} onDelete={onDeleteAnswer} />}
          {active && active.kind === "implications" && (
            <ImplicationsPanel
              ex={active}
              view={mapView}
              setView={setMapView}
              onDelete={onDeleteAnswer}
              seed={
                <SeedKeyChangesPanel
                  key={active.exerciseId}
                  sources={seedSources}
                  seededIds={new Set(active.cards.map((c) => c.sourceCardId).filter((x): x is string => !!x))}
                  defaultOpen={!active.cards.some((c) => c.order === "FIRST")}
                  busy={seeding}
                  message={seedMsg}
                  onSeed={runSeed}
                />
              }
            />
          )}
          {active && active.kind === "placeholder" && (
            <p className="text-[14px] italic text-muted">This week hasn&rsquo;t been built yet.</p>
          )}
        </>
      )}

      <ConfirmModal
        open={pending !== null}
        busy={busy}
        title={
          pending?.kind === "reset" ? "Reset group answers" : pending?.kind === "clear" ? "Clear this week" : "Delete answer"
        }
        confirmLabel={pending?.kind === "reset" ? "Reset" : pending?.kind === "clear" ? "Clear" : "Delete"}
        message={
          <>
            {pending?.kind === "reset" ? (
              <>
                Delete <strong>every answer</strong> on all of {pending.label}&rsquo;s boards? This can&rsquo;t be undone.
              </>
            ) : pending?.kind === "clear" ? (
              <>
                Clear all answers on <strong>{pending.label}</strong>&rsquo;s board? This can&rsquo;t be undone.
              </>
            ) : pending?.kind === "answer" ? (
              <>
                Delete this answer{pending.label ? <> — “{pending.label}”</> : ""}? This can&rsquo;t be undone.
              </>
            ) : (
              ""
            )}
            {error && <span className="mt-2 block font-semibold text-coral">{error}</span>}
          </>
        }
        onCancel={() => {
          setPending(null);
          setError(null);
        }}
        onConfirm={() => pending && runDelete(pending)}
      />
    </main>
  );
}

interface SeedSource {
  key: string; // `${exerciseId}:${sectionKey}`
  weekTitle: string;
  question: QuestionBlock;
}

// Week 1's "Our 6 key changes" is the canonical seed; sort it first and open it.
function isKeyChanges(q: QuestionBlock): boolean {
  return q.key === "six-changes";
}

// Seed an implications map's key changes from the group's answers on other weeks. Pick
// answers by checkbox (or "Add all" per question); ones already on the map are ticked
// and disabled. Seeded cards are ordinary, editable FIRST cards on the shared board.
function SeedKeyChangesPanel({
  sources,
  seededIds,
  defaultOpen,
  busy,
  message,
  onSeed,
}: {
  sources: SeedSource[];
  seededIds: Set<string>;
  defaultOpen: boolean;
  busy: boolean;
  message: { tone: "ok" | "err"; text: string } | null;
  onSeed: (sourceCardIds: string[]) => Promise<boolean>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const seed = async (ids: string[]) => {
    if (await onSeed(ids)) setSelected(new Set());
  };
  const picked = [...selected].filter((id) => !seededIds.has(id));
  // Latch the initial open state so the panel doesn't snap shut once the first seed lands.
  const [initiallyOpen] = useState(defaultOpen);

  return (
    <details open={initiallyOpen} className="rounded-[4px] border border-[var(--rule)] bg-paper p-3">
      <summary className="cursor-pointer select-none text-[13px] font-bold uppercase tracking-[0.08em] text-muted">
        Seed key changes from earlier weeks
      </summary>
      <p className="mt-2 text-[12.5px] text-muted">
        Copies answers onto this map as key changes (&ldquo;In this world…&rdquo;). The group can reword, delete, or
        build on them like any card.
      </p>
      {sources.length === 0 ? (
        <p className="mt-3 text-[13px] italic text-muted">No answers on this group&rsquo;s other weeks yet.</p>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          {sources.map((s) => {
            const remaining = s.question.answers.filter((a) => !seededIds.has(a.id)).map((a) => a.id);
            return (
              <details key={s.key} open={isKeyChanges(s.question)} className="border-t border-[var(--rule)] pt-2">
                <summary className="flex cursor-pointer select-none flex-wrap items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-muted">{s.weekTitle} ›</span>
                  <span className="text-[13.5px] font-bold">{s.question.label || s.question.key}</span>
                  <span className="text-[11px] text-muted">
                    {s.question.answers.length - remaining.length}/{s.question.answers.length} on map
                  </span>
                  <button
                    onClick={(e) => {
                      e.preventDefault(); // don't toggle the <details>
                      seed(remaining);
                    }}
                    disabled={busy || remaining.length === 0}
                    className={btn + " ml-auto"}
                  >
                    Add all
                  </button>
                </summary>
                <ul className="mt-2 flex flex-col gap-1">
                  {s.question.answers.map((a) => {
                    const done = seededIds.has(a.id);
                    return (
                      <li key={a.id}>
                        <label className={"flex items-start gap-2 text-[13.5px] leading-[1.4] " + (done ? "text-muted" : "cursor-pointer")}>
                          <input
                            type="checkbox"
                            className="mt-[3px] shrink-0"
                            checked={done || selected.has(a.id)}
                            disabled={done || busy}
                            onChange={() => toggle(a.id)}
                          />
                          <span className="min-w-0">
                            {a.text}
                            {a.author && (
                              <span className="ml-2 text-[10px] uppercase tracking-[0.06em] text-muted">— {a.author}</span>
                            )}
                            {done && (
                              <span className="ml-2 text-[10px] font-bold uppercase tracking-[0.06em] text-muted">✓ on map</span>
                            )}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </details>
            );
          })}
          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[var(--rule)] pt-3">
            {message && (
              <span className={"text-[12.5px] " + (message.tone === "err" ? "font-semibold text-coral" : "text-muted")}>
                {message.text}
              </span>
            )}
            <button onClick={() => seed(picked)} disabled={busy || picked.length === 0} className={btn}>
              {busy ? "Adding…" : picked.length ? `Add ${picked.length} selected →` : "Add selected →"}
            </button>
          </div>
        </div>
      )}
    </details>
  );
}
