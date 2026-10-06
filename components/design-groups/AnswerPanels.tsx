"use client";

import { useMemo, useRef, useState } from "react";
import { FuturesWheel } from "@/components/workshop/FuturesWheel";
import { ImplicationTree } from "@/components/workshop/ImplicationTree";
import { ImplicationList } from "@/components/workshop/ImplicationList";
import {
  KeyChangeChips,
  MapToolbar,
  OrderChips,
  orderColor,
  stepZoom,
  type Zoom,
} from "@/components/workshop/MapControls";
import { buildChildrenMap, depthByCard, type RippleCard } from "@/lib/ripples-types";
import { sortRootsByRank } from "@/lib/ripples-scoring";
import { branchOf, keyChangeLabel } from "@/lib/synthesis-shape";
import type { ThemeAnswerKind } from "@/lib/synthesis-shape";
import type { SynthesisSummary } from "@/lib/synthesis-summary-shape";

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
// A hope or fear in a chain, flattened with its depth so the panel can indent it. The
// board's own (step 3, flipped in step 4) or — on older boards — a theme's.
export interface ChainRow extends AnswerRow {
  // Deliberately narrow: assumptions hang OFF a chain row rather than becoming a third
  // kind in it, so the colour maps and the CSV's Kind column stay honest.
  cardKind: "hope" | "fear";
  depth: number; // 1 = written straight on (the board, or an older board's theme), 2 = its flip side, …
  concerns: string | null; // who it concerns — the `concerns` card under it (older boards)
  value: string | null; // why it matters — the card's description (older boards)
  assumptions: AnswerRow[]; // assumptions written under it (older boards)
}

// One answer to one question — on a theme, or (the role step) for the whole board. `kind`
// is the card kind, `label` the question as the group saw it (lib/synthesis-shape
// ANSWER_LABELS).
export interface ThemeAnswerRow extends AnswerRow {
  kind: ThemeAnswerKind;
  label: string;
}

// A risk or opportunity on a theme (step 2's two walls), or a preserved
// surprise/disagreement from the retired sandbox (older boards).
export interface StakeRow extends AnswerRow {
  mechanism: string | null;
  shortlisted: boolean;
}
export interface SynthesisTheme {
  id: string;
  text: string;
  description: string | null; // what the group means by this theme
  implications: AnswerRow[]; // the Week 2 implications clustered into this theme
  answers: ThemeAnswerRow[]; // every answered question, in step order
  risks: StakeRow[]; // step 2's risks wall
  opportunities: StakeRow[]; // step 2's opportunities wall
  chain: ChainRow[]; // LEGACY: hopes & fears written on the theme by an older board
  tensions: StakeRow[]; // older boards' sandbox notes, preserved rather than resolved
}
export interface SynthesisExercise {
  kind: "synthesis";
  exerciseId: string;
  title: string;
  cards: RippleCard[]; // the whole shared board (themes, implications, hopes/fears)
  themes: SynthesisTheme[];
  // The board's hopes and fears (step 3), each flipped card right after the one it came
  // from (step 4) — depth-first, so indentation reads as the pair.
  hopesFears: ChainRow[];
  role: ThemeAnswerRow[]; // LEGACY: the retired role step's answers — one set for the board
  unclustered: AnswerRow[]; // implications never sorted into a theme
  parked: AnswerRow[]; // set aside by the group, kept for the record
  // Cards the board could not place — a hope with no theme above it. Surfaced so nothing
  // is ever silently lost; an empty list is the normal case.
  orphans: AnswerRow[];
  questions: QuestionBlock[]; // the Sandbox
  // The facilitator's executive summary of steps 1–2, if one has been generated.
  summary: SynthesisSummary | null;
}
export interface PlaceholderExercise {
  kind: "placeholder";
  exerciseId: string;
  title: string;
  unavailable?: boolean; // its board failed to load (vs. simply not built yet)
}
export type ExerciseAnswers =
  | WorksheetExercise
  | ImplicationsExercise
  | SynthesisExercise
  | PlaceholderExercise;

export const MAP_VIEWS = ["wheel", "tree", "list"] as const;
export type MapView = (typeof MAP_VIEWS)[number];
const MAP_LABELS: Record<MapView, string> = { wheel: "Wheel", tree: "Tree", list: "List" };

// `showMeta` = admin chrome: question-kind and "removed question" badges.
export interface PanelOpts {
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
//
// The map carries the same controls as the Week 3 cluster board's — which key change,
// which order, zoom and fit — so a group reading last session's map back sees it the way
// it sees it while clustering: one branch at a time, or all of them, in the order colours.
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
  // The tree alone (no brainstorm stickies), its depths, its key changes in rank order,
  // and what hangs under each — the counts the chips show.
  const model = useMemo(() => {
    const tree = ex.cards.filter((c) => c.order !== "STICKY");
    const depths = depthByCard(tree);
    const children = buildChildrenMap(tree);
    const everyRoot = sortRootsByRank((children.get(null) ?? []).filter((c) => depths.has(c.id)));
    const countUnder = (id: string): number => {
      let n = 0;
      const walk = (x: string) => {
        for (const k of children.get(x) ?? []) {
          if (!depths.has(k.id)) continue;
          n += 1;
          walk(k.id);
        }
      };
      walk(id);
      return n;
    };
    // Only key changes the group actually mapped under — a chip reading "0" is noise, and a
    // branch with nothing in it is a hub and no wheel. The whole map still draws them all.
    const roots = everyRoot.filter((r) => countUnder(r.id) > 0);
    const keyChanges = roots.map((r) => ({ key: r.id, label: keyChangeLabel(r.text), title: r.text, count: countUnder(r.id) }));
    const orderCounts = new Map<number, number>();
    for (const c of tree) {
      const d = depths.get(c.id);
      if (d !== undefined && d > 0) orderCounts.set(d, (orderCounts.get(d) ?? 0) + 1);
    }
    const orders = [...orderCounts.keys()].sort((a, b) => a - b).map((o) => ({ order: o, count: orderCounts.get(o)! }));
    const total = orders.reduce((n, o) => n + o.count, 0);
    return { tree, depths, roots, keyChanges, orders, total };
  }, [ex.cards]);
  const hasTree = model.tree.length > 0;

  // Which branch (null = every key change), which order, and how close.
  const [branch, setBranch] = useState<string | null>(null);
  const [orderFilter, setOrderFilter] = useState<number | null>(null);
  const [zoom, setZoom] = useState<Zoom>("fit");
  const fitScaleRef = useRef(1);
  // A stale id (the branch was deleted) falls back to the whole map.
  const branchAt = branch === null ? -1 : model.roots.findIndex((r) => r.id === branch);
  const branchRoot = branchAt >= 0 ? model.roots[branchAt] : null;
  const sub = branchRoot ? branchOf(model.tree, branchRoot.id) : null;
  // The branch variant takes the key change as its hub, so the root is cut away and its
  // children become the first ring.
  const wheelCards = sub
    ? sub.subtree.filter((c) => c.id !== sub.root.id).map((c) => (c.parentId === sub.root.id ? { ...c, parentId: null } : c))
    : model.tree;
  // A card's order is its depth on the WHOLE map (the key change is 0, so no order).
  const orderOf = (id: string) => {
    const d = model.depths.get(id);
    return d === undefined || d === 0 ? null : d;
  };
  const dimmed = (id: string) => orderFilter !== null && orderOf(id) !== orderFilter;
  const stepBranch = (step: -1 | 1) => {
    const stops: (string | null)[] = [null, ...model.roots.map((r) => r.id)];
    const cur = Math.max(0, stops.indexOf(branchRoot?.id ?? null));
    setBranch(stops[(cur + step + stops.length) % stops.length]);
    setZoom("fit"); // branches differ in size; a held zoom misleads
  };
  const onZoom = (dir: "in" | "out" | "fit") =>
    setZoom(dir === "fit" ? "fit" : (z) => stepZoom(z, dir, fitScaleRef.current));
  const spatial = view !== "list";

  return (
    <div className="flex flex-col gap-6">
      {seed}
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1">
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
          </span>
          {hasTree && model.keyChanges.length > 1 && (
            <KeyChangeChips
              items={model.keyChanges}
              allCount={model.total}
              value={branchRoot?.id ?? null}
              onChange={(k) => {
                setBranch(k);
                setZoom("fit");
              }}
            />
          )}
        </div>
        {hasTree && spatial && model.orders.length > 1 && (
          <div className="mb-2">
            <OrderChips orders={model.orders} allCount={model.total} value={orderFilter} onChange={setOrderFilter} />
          </div>
        )}
        {!hasTree ? (
          <p className="text-[13px] italic text-muted">No implications mapped yet.</p>
        ) : (
          <div className={spatial ? "rounded-[3px] border border-dashed border-black/15 p-3" : ""}>
            {spatial && (
              <MapToolbar
                zoom={zoom}
                onZoom={onZoom}
                orders={model.orders.map((o) => o.order)}
                branch={{
                  label: branchRoot ? branchRoot.text : "All key changes",
                  index: branchRoot ? branchAt : null,
                  total: model.roots.length,
                  onStep: stepBranch,
                }}
              />
            )}
            <div className={spatial ? "max-h-[75vh] overflow-auto" : "overflow-x-auto"}>
              {view === "wheel" && (
                <FuturesWheel
                  key={branchRoot?.id ?? "all"}
                  cards={wheelCards}
                  centerLabel={branchRoot ? branchRoot.text : ex.scenarioTitle}
                  variant={branchRoot ? "branch" : "map"}
                  zoom={zoom}
                  onFitScale={(v) => (fitScaleRef.current = v)}
                  ringFor={(id) => {
                    const o = orderOf(id);
                    return o === null ? null : { color: orderColor(o) };
                  }}
                  nodeProps={(id) => (dimmed(id) ? { style: { opacity: 0.3 } } : {})}
                />
              )}
              {view === "tree" && (
                <ImplicationTree
                  cards={model.tree}
                  scenarioTitle={ex.scenarioTitle}
                  rootIds={branchRoot ? new Set([branchRoot.id]) : undefined}
                  dimDepth={(d) => d > 0 && orderFilter !== null && d !== orderFilter}
                  zoom={zoom}
                  onFitScale={(v) => (fitScaleRef.current = v)}
                />
              )}
              {view === "list" && (
                <ImplicationList cards={sub ? sub.subtree : model.tree} scenarioTitle={ex.scenarioTitle} />
              )}
            </div>
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
