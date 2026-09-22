"use client";

import { FuturesWheel } from "@/components/workshop/FuturesWheel";
import { ImplicationTree } from "@/components/workshop/ImplicationTree";
import { ImplicationList } from "@/components/workshop/ImplicationList";
import type { RippleCard } from "@/lib/ripples-types";

// Read-only renderings of one design-group week's answers, shaped server-side by
// lib/group-answers.ts. Shared by the admin answers viewer (with authors, kind badges and
// optional delete) and the member session page's earlier-week tabs (plain, no controls).

export interface AnswerRow {
  id: string; // ripple_card id (for admin delete / seeding)
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
  questions: QuestionBlock[]; // section-tagged question/brainstorm blocks, if the week carries any
}
export interface PlaceholderExercise {
  kind: "placeholder";
  exerciseId: string;
  title: string;
  unavailable?: boolean; // its board failed to load (vs. simply not built yet)
}
export type ExerciseAnswers = WorksheetExercise | ImplicationsExercise | PlaceholderExercise;

export const MAP_VIEWS = ["wheel", "tree", "list"] as const;
export type MapView = (typeof MAP_VIEWS)[number];
const MAP_LABELS: Record<MapView, string> = { wheel: "Wheel", tree: "Tree", list: "List" };

// `showMeta` = admin chrome: question-kind and "removed question" badges.
interface PanelOpts {
  onDelete?: (row: AnswerRow) => void;
  showMeta?: boolean;
}

export function AnswerList({ answers, onDelete }: { answers: AnswerRow[] } & PanelOpts) {
  // Bullets when there are several answers; a lone answer reads as a plain paragraph.
  const single = answers.length === 1;
  return (
    <ul className="mt-2 flex flex-col gap-1.5">
      {answers.map((a) => (
        <li key={a.id} className="group flex items-start gap-2">
          {!single && (
            <span aria-hidden className="mt-[2px] shrink-0 select-none text-[13.5px] leading-[1.4] text-muted">
              •
            </span>
          )}
          <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
            {/* No byline: an answer sheet reads as the group's answers, not a list of who
                said what. `author` is still carried on the row for the CSV export. */}
            <div className="min-w-0 text-[13.5px] leading-[1.4]">{a.text}</div>
            {onDelete && (
              <button
                onClick={() => onDelete(a)}
                aria-label="Delete answer"
                title="Delete answer"
                className="shrink-0 rounded-[2px] px-1 text-[12px] font-bold text-muted opacity-0 outline-none hover:text-coral focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ink group-hover:opacity-100 group-focus-within:opacity-100"
              >
                ✕
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function WorksheetPanel({ ex, ...opts }: { ex: WorksheetExercise } & PanelOpts) {
  if (ex.questions.length === 0)
    return <p className="text-[13px] italic text-muted">No questions defined for this week.</p>;
  return <QuestionBlocks questions={ex.questions} {...opts} />;
}

// One or more section-tagged Q&A blocks (question prompts + brainstorm areas), read-only.
// Shared by worksheet weeks and implications weeks (which can carry blocks too).
export function QuestionBlocks({ questions, onDelete, showMeta = true }: { questions: QuestionBlock[] } & PanelOpts) {
  return (
    <div className="flex flex-col gap-5">
      {questions.map((q) => (
        <div key={q.key}>
          <div className="flex items-center gap-2">
            <h3 className="text-[14px] font-bold">{q.label || q.key}</h3>
            {showMeta && (
              <span className="rounded-[2px] bg-[var(--hairline)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em] text-muted">
                {q.kind}
              </span>
            )}
            {showMeta && q.removed && (
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

// An implications week: the map (Wheel / Tree / List switch), then any question blocks
// and the brainstorm notes. `seed` is an optional slot above the map (admin seeding).
export function ImplicationsPanel({
  ex,
  view,
  setView,
  seed,
  ...opts
}: {
  ex: ImplicationsExercise;
  view: MapView;
  setView: (v: MapView) => void;
  seed?: React.ReactNode;
} & PanelOpts) {
  const hasTree = ex.cards.some((c) => c.order !== "STICKY");
  return (
    <div className="flex flex-col gap-6">
      {seed}
      <div>
        <div className="mb-3 flex items-center gap-1">
          {MAP_VIEWS.map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              aria-pressed={v === view}
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

      {ex.questions.length > 0 && (
        <div>
          <h3 className="mb-2 text-[13px] font-bold uppercase tracking-[0.08em] text-muted">Questions</h3>
          <QuestionBlocks questions={ex.questions} {...opts} />
        </div>
      )}

      <div>
        <h3 className="mb-2 text-[13px] font-bold uppercase tracking-[0.08em] text-muted">Brainstorm notes</h3>
        {ex.brainstorm.length === 0 ? (
          <p className="text-[13px] italic text-muted">No brainstorm notes.</p>
        ) : (
          <AnswerList answers={ex.brainstorm} {...opts} />
        )}
      </div>
    </div>
  );
}
