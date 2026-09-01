"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { csvCell, download } from "@/components/admin/exportUtils";
import { ConfirmModal } from "@/components/ConfirmModal";
import { FuturesWheel } from "@/components/workshop/FuturesWheel";
import { ImplicationTree } from "@/components/workshop/ImplicationTree";
import { ImplicationList } from "@/components/workshop/ImplicationList";
import { enumerateChains, type RippleCard } from "@/lib/ripples-types";

// Read-only admin view of a design group's answers, one tab per exercise (week). Each tab
// renders in its exercise's natural shape — worksheet Q&A, implication futures-wheel, or a
// "not built yet" note. Admins can delete a single answer, clear a week's board, or reset
// the whole group (each behind a confirm; card deletes are irreversible). JSON/CSV export.

export interface AnswerRow {
  id: string; // ripple_card id (for admin delete)
  text: string;
  author: string;
  createdAt: string;
}
export interface QuestionBlock {
  key: string;
  label: string;
  kind: "brainstorm" | "question";
  removed?: boolean; // answers under a section key no longer in the spec
  answers: AnswerRow[];
}

export interface WorksheetExercise {
  kind: "worksheet";
  exerciseId: string;
  title: string;
  questions: QuestionBlock[];
}
export interface ImplicationsExercise {
  kind: "implications";
  exerciseId: string;
  title: string;
  scenarioTitle: string;
  cards: RippleCard[]; // all of the shared team's cards (drives the wheel/tree/list)
  brainstorm: AnswerRow[]; // the section=null STICKY notes
}
export interface PlaceholderExercise {
  kind: "placeholder";
  exerciseId: string;
  title: string;
}
export type ExerciseAnswers = WorksheetExercise | ImplicationsExercise | PlaceholderExercise;

export interface GroupAnswersData {
  groupName: string;
  scenarioTitle: string | null;
  exercises: ExerciseAnswers[];
}

const MAP_VIEWS = ["wheel", "tree", "list"] as const;
type MapView = (typeof MAP_VIEWS)[number];
const MAP_LABELS: Record<MapView, string> = { wheel: "Wheel", tree: "Tree", list: "List" };

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

  const active = exercises.find((e) => e.exerciseId === activeId) ?? initial;
  const cardsBase = `/api/admin/projects/${projectId}/design-groups/${groupId}/cards`;

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
      }
    }
    download("﻿" + lines.join("\r\n"), `${base}.csv`, "text/csv;charset=utf-8;");
  };

  const hasContent = exercises.some(
    (ex) =>
      (ex.kind === "worksheet" && ex.questions.some((q) => q.answers.length > 0)) ||
      (ex.kind === "implications" && (ex.cards.length > 0 || ex.brainstorm.length > 0))
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
                  onClick={() => setActiveId(ex.exerciseId)}
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
            <ImplicationsPanel ex={active} view={mapView} setView={setMapView} onDelete={onDeleteAnswer} />
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

function AnswerList({ answers, onDelete }: { answers: AnswerRow[]; onDelete?: (row: AnswerRow) => void }) {
  return (
    <ul className="mt-2 flex flex-col gap-1.5">
      {answers.map((a) => (
        <li
          key={a.id}
          className="group flex items-start justify-between gap-3 rounded-[2px] border border-[var(--hairline)] bg-paper px-3 py-2"
        >
          <div className="min-w-0 text-[13.5px] leading-[1.4]">
            {a.text}
            {a.author && <span className="ml-2 text-[10px] uppercase tracking-[0.06em] text-muted">— {a.author}</span>}
          </div>
          {onDelete && (
            <button
              onClick={() => onDelete(a)}
              aria-label="Delete answer"
              title="Delete answer"
              className="shrink-0 rounded-[2px] px-1 text-[12px] font-bold text-muted opacity-0 hover:text-coral group-hover:opacity-100"
            >
              ✕
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

function WorksheetPanel({ ex, onDelete }: { ex: WorksheetExercise; onDelete?: (row: AnswerRow) => void }) {
  return (
    <div className="flex flex-col gap-5">
      {ex.questions.length === 0 && (
        <p className="text-[13px] italic text-muted">No questions defined for this week.</p>
      )}
      {ex.questions.map((q) => (
        <div key={q.key}>
          <div className="flex items-center gap-2">
            <h3 className="text-[14px] font-bold">{q.label || q.key}</h3>
            <span className="rounded-[2px] bg-[var(--hairline)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em] text-muted">
              {q.kind}
            </span>
            {q.removed && (
              <span className="rounded-[2px] bg-coral px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em] text-white">
                removed question
              </span>
            )}
          </div>
          {q.answers.length === 0 ? (
            <p className="mt-1 text-[13px] italic text-muted">No answers.</p>
          ) : (
            <AnswerList answers={q.answers} onDelete={onDelete} />
          )}
        </div>
      ))}
    </div>
  );
}

function ImplicationsPanel({
  ex,
  view,
  setView,
  onDelete,
}: {
  ex: ImplicationsExercise;
  view: MapView;
  setView: (v: MapView) => void;
  onDelete?: (row: AnswerRow) => void;
}) {
  const hasTree = ex.cards.some((c) => c.order !== "STICKY");
  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="mb-3 flex items-center gap-1">
          {MAP_VIEWS.map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={
                "rounded-[2px] border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.06em] " +
                (v === view ? "border-ink bg-ink text-white" : "border-[var(--rule)] bg-paper text-muted hover:border-ink")
              }
            >
              {MAP_LABELS[v]}
            </button>
          ))}
        </div>
        {!hasTree ? (
          <p className="text-[13px] italic text-muted">No implications mapped yet.</p>
        ) : (
          <div className="overflow-x-auto">
            {view === "wheel" && <FuturesWheel cards={ex.cards} centerLabel={ex.scenarioTitle} />}
            {view === "tree" && <ImplicationTree cards={ex.cards} scenarioTitle={ex.scenarioTitle} />}
            {view === "list" && <ImplicationList cards={ex.cards} scenarioTitle={ex.scenarioTitle} />}
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-[13px] font-bold uppercase tracking-[0.08em] text-muted">Brainstorm notes</h3>
        {ex.brainstorm.length === 0 ? (
          <p className="text-[13px] italic text-muted">No brainstorm notes.</p>
        ) : (
          <AnswerList answers={ex.brainstorm} onDelete={onDelete} />
        )}
      </div>
    </div>
  );
}
