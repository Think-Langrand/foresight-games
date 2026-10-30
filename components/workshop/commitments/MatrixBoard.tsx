"use client";

import { useMemo, useState } from "react";
import type { RippleCard } from "@/lib/ripples-types";
import type { ScorePatchInput } from "@/lib/ripples-scoring";
import type { Score } from "@/lib/ripples-scoring";
import { SCORE_AXES } from "@/lib/ripples-scoring";
import {
  PLACED_FLOOR_PER_KIND,
  PRIORITY_AXIS_ENDS,
  PRIORITY_AXIS_LABELS,
  PRIORITY_SCALES,
  priorities,
  prioritySlots,
  replaceCandidates,
  type CommitmentsBoard,
} from "@/lib/commitments-shape";
import { isUnnamedTheme, themeLabel, type SynthesisBoard } from "@/lib/synthesis-shape";
import { ImpactMatrix } from "@/components/workshop/ImpactMatrix";
import { ScoreScale } from "@/components/workshop/ScoreScale";
import { TONE } from "@/components/workshop/synthesis/CardWall";
import { ACTIVITY_META } from "@/components/workshop/commitments/activityMeta";
import { Callout } from "@/components/workshop/commitments/Callout";
import { PriorityPanel } from "@/components/workshop/commitments/PriorityPanel";
import { StarterQuestions } from "@/components/workshop/commitments/StarterQuestions";

// ACT 1.2 — what is at stake, scored, then three confirmed.
//
// Session 3 named the risks and opportunities; this step asks which of them matter and how,
// on an impact x likelihood matrix (the stored axis is still `plausibility`; see
// PRIORITY_AXIS_LABELS for why only the word changed).
//
// SCORING IS PLACING. Every card shows both scales from the first paint, and a card reaches
// the matrix when both are set. The pick a score needs is minted lazily on the first click.
//
// WHY A PICK CARRIES THE SCORE. Session 3's risks cannot be scored where they live: the
// score route refuses anything that is not a tree ROOT, resolves the card by the URL's
// session code, and needs a player identity on that same board. A `pick` is a Week 4 card
// pointing at that risk and carrying its words, and because it IS a root on this board,
// the existing score route, `matrixCells` and `ImpactMatrix` all take it unchanged.
//
// THE SCORES SUGGEST, THE GROUP CONFIRMS. The three highest-scoring land in the priority
// panel under the walls as suggestions; Keep, Replace and the "why" box make them the
// group's own. See prioritySlots.
//
// THIS BOARD OWNS ITS TWO COLUMNS, unlike the other activities, because its right column is
// the matrix rather than the reference rail. The shell hands it the header and the footer
// (checklist and continue button) to put in the left column.

type Kind = "risk" | "opportunity";

function Panel({
  kind,
  groups,
  pickFor,
  scoresFor,
  editable,
  priorityIndex,
  hoveredId,
  onHover,
  onScore,
  onClear,
}: {
  kind: Kind;
  groups: { id: string; label: string; cards: RippleCard[] }[];
  pickFor: (sourceId: string) => RippleCard | undefined;
  // The scores to SHOW for a Session 3 card, which is not always what is on a pick: the
  // first click on an untouched card has to paint before the pick it will live on exists.
  scoresFor: (sourceId: string) => { plausibility: Score | null; impact: Score | null };
  editable: boolean;
  // A READOUT, not a control: which slot (1 to 3) this row currently holds, if any.
  priorityIndex: (sourceId: string) => number | null;
  hoveredId: string | null;
  onHover: (id: string | null) => void;
  onScore: (card: RippleCard, patch: ScorePatchInput) => void;
  onClear: (card: RippleCard) => void;
}) {
  const [open, setOpen] = useState(true);
  const t = TONE[kind];
  const all = groups.flatMap((g) => g.cards);
  const isDone = (c: RippleCard) => {
    const s = scoresFor(c.id);
    return s.plausibility !== null && s.impact !== null;
  };
  const scored = all.filter(isDone).length;
  const label = kind === "risk" ? "Risks" : "Opportunities";
  const floor = Math.min(PLACED_FLOOR_PER_KIND, all.length);

  if (all.length === 0) {
    return (
      <section className={"rounded-[4px] border-2 px-4 py-3 " + t.edge + " " + t.well}>
        <span className="text-[14px] font-bold">{label}</span>
        <p className="m-0 mt-1 text-[13px] italic text-muted">Session 3 recorded none of these.</p>
      </section>
    );
  }

  return (
    <section className={"flex min-w-0 flex-col overflow-hidden rounded-[4px] border-2 " + t.edge + " " + t.well}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-baseline gap-2 border-b border-black/10 px-4 py-3 text-left"
      >
        <span aria-hidden className="w-3 text-[12px] text-muted">
          {open ? "⌄" : "›"}
        </span>
        <span className="text-[15px] font-bold">{label}</span>
        <span className="ml-auto text-[12px] font-bold tabular-nums">{scored} scored</span>
        <span className="text-[11px] italic text-muted">
          {scored >= floor ? "past the floor · keep going if they matter" : `at least ${floor}`}
        </span>
      </button>

      {open &&
        groups.map((g) => (
          <ul key={g.id} className="m-0 flex list-none flex-col p-0">
            {g.cards.map((c) => {
              const pick = pickFor(c.id);
              const scores = scoresFor(c.id);
              // A PICK EXISTS counts as touched, not just a visible score. A mint that
              // succeeds while its score write fails leaves a pick with both axes null:
              // nothing shows on the row, but the review pane, the CSV and the deck all
              // report a placement. Keying Clear off the scores alone made that one
              // unremovable.
              const touched =
                Boolean(pick) || scores.plausibility !== null || scores.impact !== null;
              const done = isDone(c);
              const slot = priorityIndex(c.id);
              return (
                <li
                  key={c.id}
                  onMouseEnter={() => pick && onHover(pick.id)}
                  onMouseLeave={() => onHover(null)}
                  className={
                    "border-b border-black/10 px-4 py-3 transition-colors last:border-b-0 " +
                    (done ? "bg-paper/70" : "") +
                    (pick && hoveredId === pick.id ? " ring-1 ring-inset ring-ink/30" : "")
                  }
                >
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-[9.5px] font-bold uppercase tracking-[0.1em] text-muted">
                      {g.label}
                    </span>
                    {slot !== null && (
                      <span className="rounded-[2px] bg-ink px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-paper">
                        Priority {slot}
                      </span>
                    )}
                    {/* Only once something has been scored: an untouched card has nothing
                        to clear, and a mis-click still has to be reversible. */}
                    {editable && touched && (
                      <button
                        type="button"
                        onClick={() => onClear(c)}
                        className="ml-auto shrink-0 text-[11px] text-muted underline hover:text-coral"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <p className={"m-0 mt-1 text-[14px] leading-[1.45] " + (done ? "font-bold" : "")}>
                    {c.text}
                  </p>

                  {/* ALWAYS SHOWN. Scoring is what puts a card on the matrix, so there is
                      nothing to open first: the scales are the step. Likelihood first, as
                      the design reads. */}
                  <div className="mt-2.5 flex flex-col gap-1.5">
                    {SCORE_AXES.map((axis) => (
                      <ScoreScale
                        key={axis}
                        axis={axis}
                        value={scores[axis]}
                        // NOT gated on `busy`. A board-wide busy flag disables every scale
                        // on every card for the length of one write, so a group scoring at
                        // speed loses the clicks it makes in that window. Concurrency is the
                        // `scores` overlay's job.
                        disabled={!editable}
                        label={PRIORITY_AXIS_LABELS[axis]}
                        lowLabel={PRIORITY_AXIS_ENDS[axis].low}
                        highLabel={PRIORITY_AXIS_ENDS[axis].high}
                        onChange={(v) => onScore(c, { [axis]: v })}
                      />
                    ))}
                    {touched && !done && (
                      <p className="m-0 text-[11px] italic text-muted">
                        Set both scales to put this on the matrix.
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ))}
    </section>
  );
}

export function MatrixBoard({
  w3,
  board,
  textOf,
  kindOf,
  themeOf,
  pickFor,
  scoresFor,
  editable,
  busy,
  onScore,
  onClear,
  onKeep,
  onUndo,
  onReplace,
  onWhy,
  header,
  overlook,
  footer,
}: {
  // Session 3's board, indexed once by the view, so the stakes sit under exactly the
  // themes Session 3 put them on.
  w3: SynthesisBoard;
  board: CommitmentsBoard;
  // A pick's source as it reads NOW on Session 3, which wall it came from, and its theme.
  // Resolved by the view, which holds the one index every surface shares.
  textOf: (pick: RippleCard) => string;
  kindOf: (pick: RippleCard) => Kind | undefined;
  themeOf: (pick: RippleCard) => string | undefined;
  // The Week 4 pick carrying a given Session 3 card's scores, resolved by the view.
  // Undefined until the first score on that card mints one.
  pickFor: (sourceId: string) => RippleCard | undefined;
  // What to SHOW for a card. Not read off the pick, because the first click has to paint
  // before the pick exists; the view bridges the gap.
  scoresFor: (sourceId: string) => { plausibility: Score | null; impact: Score | null };
  editable: boolean;
  busy: boolean;
  onScore: (card: RippleCard, patch: ScorePatchInput) => void;
  onClear: (card: RippleCard) => void;
  onKeep: (pick: RippleCard) => void;
  onUndo: (pick: RippleCard) => void;
  onReplace: (slotIndex: number, next: RippleCard) => void;
  onWhy: (pick: RippleCard, why: string) => void;
  // The activity header, the overlook box and the checklist-plus-continue, built by the
  // shell and placed in this board's left column.
  header: React.ReactNode;
  overlook: React.ReactNode;
  footer: React.ReactNode;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const meta = ACTIVITY_META.prioritize;

  const groupsOf = (map: Map<string, RippleCard[]>) =>
    w3.themes
      .map((t) => ({
        id: t.id,
        label: isUnnamedTheme(t) ? themeLabel(w3, t) : t.text,
        cards: map.get(t.id) ?? [],
      }))
      .filter((g) => g.cards.length > 0);

  // Every Session 3 stake id, so the matrix plots ONLY the picks. Every scoring selector
  // filters by isTreeRoot, and the direction cards are roots on this board too, so handing
  // it the whole board would plot them alongside the stakes.
  const stakeIds = useMemo(
    () => [...w3.risks.values(), ...w3.opportunities.values()].flat().map((c) => c.id),
    [w3]
  );
  const placedPicks = useMemo(() => {
    const out: RippleCard[] = [];
    for (const sourceId of stakeIds) {
      const pick = pickFor(sourceId);
      if (pick) out.push(pick);
    }
    return out;
  }, [stakeIds, pickFor]);

  const slots = prioritySlots(board);
  const slotBySource = new Map<string, number>();
  priorities(board).forEach((p, i) => {
    if (p.sourceCardId) slotBySource.set(p.sourceCardId, i + 1);
  });

  const panel = (kind: Kind) => (
    <Panel
      kind={kind}
      groups={groupsOf(kind === "risk" ? w3.risks : w3.opportunities)}
      pickFor={pickFor}
      scoresFor={scoresFor}
      editable={editable}
      priorityIndex={(id) => slotBySource.get(id) ?? null}
      hoveredId={hovered}
      onHover={setHovered}
      onScore={onScore}
      onClear={onClear}
    />
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-w-0 flex-col gap-6">
        {header}

        {/* The two scales, defined. Without these a group scores both axes the same way
            and the grid collapses onto its diagonal. */}
        <div className="grid gap-3 sm:grid-cols-2">
          {PRIORITY_SCALES.map((sc) => (
            <Callout key={sc.axis} tone="paper" label={sc.label}>
              <p className="m-0">{sc.question}</p>
              <p className="m-0 mt-1.5 text-[11.5px] text-muted">
                {sc.words.map((w, i) => `${i + 1} ${w}`).join(" · ")}
              </p>
            </Callout>
          ))}
        </div>

        <StarterQuestions starters={meta.starters} />

        {panel("risk")}
        {panel("opportunity")}

        <PriorityPanel
          slots={slots}
          candidates={replaceCandidates(board)}
          textOf={textOf}
          kindOf={kindOf}
          themeOf={themeOf}
          editable={editable}
          busy={busy}
          onKeep={onKeep}
          onUndo={onUndo}
          onReplace={onReplace}
          onWhy={onWhy}
        />

        <div>
          <p className="m-0 mb-3 text-[14.5px] leading-[1.5]">
            Is there anything we should keep on the list even if we disagree about its
            likelihood?
          </p>
          {overlook}
        </div>

        {footer}
      </div>

      <div className="lg:sticky lg:top-4 lg:self-start">
        <div
          className="rounded-[3px] border border-[var(--hairline)] px-5 py-4"
          style={{ background: "rgba(39,93,226,0.05)" }}
        >
          <h3 className="m-0 text-[16px] font-extrabold">Your scoring matrix</h3>
          <p className="m-0 mt-1 text-[13px] leading-[1.5] text-muted">
            Scored items appear here once both scores are entered.
          </p>
          <div className="mt-4">
            <ImpactMatrix
              cards={placedPicks}
              hoveredId={hovered}
              onHover={setHovered}
              noun="risk or opportunity"
              axisLabels={{ x: PRIORITY_AXIS_LABELS.plausibility, y: PRIORITY_AXIS_LABELS.impact }}
              captions={{
                y: `${PRIORITY_AXIS_LABELS.impact}: 1 ${PRIORITY_AXIS_ENDS.impact.low.toLowerCase()} → 5 ${PRIORITY_AXIS_ENDS.impact.high.toLowerCase()}`,
                x: `${PRIORITY_AXIS_LABELS.plausibility}: 1 → 5`,
              }}
              chipClassFor={(c) => {
                const k = kindOf(c);
                if (!k) return null;
                return k === "risk"
                  ? "border-coral bg-coral text-white hover:bg-coral/80"
                  : "border-[var(--lime-deep)] bg-lime text-ink hover:bg-lime/80";
              }}
            />
          </div>
          <p className="m-0 mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-coral" aria-hidden />
              Risk
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-lime ring-1 ring-[var(--lime-deep)]" aria-hidden />
              Opportunity
            </span>
          </p>
          <div className="mt-4 border-t border-[var(--hairline)] pt-3">
            <p className="m-0 text-[13px] font-bold">Scores guide the discussion.</p>
            <p className="m-0 mt-0.5 text-[13px] leading-[1.5] text-muted">
              Confirm your three priorities in the workspace.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
