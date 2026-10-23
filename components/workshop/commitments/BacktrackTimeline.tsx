"use client";

import { useState } from "react";
import type { RippleCard } from "@/lib/ripples-types";
import type { WorksheetSection } from "@/lib/exercise-types";
import {
  MAX_BOLD_MOVES,
  MILESTONES_PER_MOVE,
  PERIODS,
  canAddMilestone,
  milestoneCount,
  milestonesFor,
  type CommitmentsBoard,
  type PeriodKey,
} from "@/lib/commitments-shape";
import {
  AddCardForm,
  CardMenu,
  CardMenuItem,
  InlineText,
  type AddResult,
} from "@/components/workshop/synthesis/SynthesisCard";
import { Directions, DIRECTIONS_FOLD } from "@/components/workshop/synthesis/Directions";
import { makePrefStore } from "@/components/workshop/synthesis/prefStore";
import { ConfirmModal } from "@/components/ConfirmModal";
import { AspirationRecap } from "@/components/workshop/commitments/AspirationRecap";

// STEP 4 — backcasting. One lane per bold move, five two-year periods across, and the work
// runs BACKWARDS: start at the far column with the move landed, and ask what had to be
// true just before it. That is the whole method, so the directions say it and the far
// column carries the aspiration marker.
//
// A FLEXIBLE GRID, NOT ImplicationTree's GEOMETRY. The plan called for copying that
// component's fixed column widths plus its zoom/fit machinery, which exists because a tree
// has connectors that must line up across columns at any scale. A timeline of text cards
// has no connectors, so `repeat(5, minmax(0, 1fr))` fits whatever width there is and the
// whole zoom layer is unnecessary. Below `lg` the lanes stack to two columns and each cell
// labels its own period, rather than scrolling sideways inside a page that already scrolls.
//
// Periods are shown even when empty, because a gap is a finding: a move with everything in
// 2027-28 and nothing after it has not been backcast, it has been listed.

const timelineDirections = makePrefStore(
  "commitments.directions.timeline",
  "open",
  DIRECTIONS_FOLD
);

const TIMELINE_DIRECTIONS = [
  "Work right to left. Start at the far column with the move already landed, then ask what had to happen just before it.",
  `Up to ${MILESTONES_PER_MOVE} milestones per move, anywhere across the span. They do not have to be one per period.`,
  "A milestone is something someone does or decides, with a date. Not a hope, and not a measure.",
  "Gaps are allowed and often honest. A run of early milestones and nothing later usually means the hard part has not been faced yet.",
];

function Cell({
  period,
  label,
  milestones,
  editable,
  busy,
  full,
  onAdd,
  onEdit,
  onRequestDelete,
  onMove,
}: {
  period: PeriodKey;
  label: string;
  milestones: RippleCard[];
  editable: boolean;
  busy: boolean;
  full: boolean;
  onAdd: (period: PeriodKey, text: string) => AddResult;
  onEdit: (card: RippleCard, text: string) => void;
  onRequestDelete: (card: RippleCard) => void;
  onMove: (card: RippleCard, period: PeriodKey) => void;
}) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="flex min-w-0 flex-col gap-1.5 border-l border-[var(--hairline)] px-2 py-1 first:border-l-0">
      {/* The shared header row only exists at lg, so each cell names its own period below
          that — a stacked lane with unlabelled cells is unreadable. */}
      <div className="font-mono text-[9.5px] font-bold uppercase tracking-[0.1em] text-muted lg:hidden">
        {label}
      </div>

      {milestones.map((m) => (
        <div key={m.id} className="group rounded-[3px] border border-blue/40 bg-blue/5 px-2 py-1.5">
          <div className="flex items-start gap-1">
            <div className="min-w-0 flex-1 text-[12.5px] leading-[1.35]">
              <InlineText
                text={m.text}
                editable={editable}
                busy={busy}
                onSave={(next) => onEdit(m, next)}
                placeholder="What happens here?"
              />
            </div>
            {editable && (
              <CardMenu label="Milestone">
                {(close) => (
                  <>
                    {PERIODS.filter((p) => p.key !== period).map((p) => (
                      <CardMenuItem
                        key={p.key}
                        onClick={() => {
                          onMove(m, p.key);
                          close();
                        }}
                      >
                        Move to {p.label}
                      </CardMenuItem>
                    ))}
                    <CardMenuItem
                      danger
                      onClick={() => {
                        onRequestDelete(m);
                        close();
                      }}
                    >
                      Delete…
                    </CardMenuItem>
                  </>
                )}
              </CardMenu>
            )}
          </div>
        </div>
      ))}

      {editable && !full && (
        adding ? (
          <AddCardForm
            label="What has to happen by then?"
            busy={busy}
            autoFocus
            onAdd={(text) => onAdd(period, text)}
            onDone={() => setAdding(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="rounded-[3px] border border-dashed border-blue/50 px-2 py-1 text-left text-[11px] text-muted transition-colors hover:bg-blue/10 hover:text-ink"
          >
            ＋ Add
          </button>
        )
      )}
    </div>
  );
}

export function BacktrackTimeline({
  board,
  sections,
  cards,
  editable,
  busy,
  onAdd,
  onEdit,
  onDelete,
  onMove,
  onGoToAspiration,
  onGoToMoves,
}: {
  board: CommitmentsBoard;
  sections: WorksheetSection[];
  cards: RippleCard[];
  editable: boolean;
  busy: boolean;
  onAdd: (move: RippleCard, period: PeriodKey, text: string) => AddResult;
  onEdit: (card: RippleCard, text: string) => void;
  onDelete: (card: RippleCard) => void;
  onMove: (card: RippleCard, period: PeriodKey) => void;
  onGoToAspiration: () => void;
  onGoToMoves: () => void;
}) {
  const [pending, setPending] = useState<RippleCard | null>(null);

  // Steps are ungated by house rule, so someone will open this one first. An empty grid
  // would read as broken; this says what is missing and goes there.
  if (board.boldMoves.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        <AspirationRecap sections={sections} cards={cards} onGoToAspiration={onGoToAspiration} />
        <div className="rounded-[4px] border border-dashed border-[var(--rule)] px-5 py-6 text-center">
          <p className="m-0 text-[14px] font-bold">No bold moves picked yet.</p>
          <p className="m-0 mt-1 text-[13px] text-muted">
            The timeline backcasts the moves you commit to, so choose up to {MAX_BOLD_MOVES}{" "}
            first.
          </p>
          <button
            type="button"
            onClick={onGoToMoves}
            className="mt-3 text-[13px] text-blue underline hover:no-underline"
          >
            &larr; Go to Bold moves
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <AspirationRecap sections={sections} cards={cards} onGoToAspiration={onGoToAspiration} />

      <div className="flex flex-col gap-4">
        {/* The period header, at lg and up. Below that each cell labels itself. The arrow
            says which way the thinking runs, against the left-to-right of the dates. */}
        <div className="hidden lg:block">
          <div className="grid grid-cols-5 border-b-2 border-ink">
            {PERIODS.map((p) => (
              <div key={p.key} className="border-l border-[var(--hairline)] px-2 pb-1.5 first:border-l-0">
                <div className="font-mono text-[10px] font-bold uppercase tracking-[0.1em]">
                  {p.label}
                </div>
              </div>
            ))}
          </div>
          <p className="m-0 mt-1 text-right font-mono text-[9.5px] uppercase tracking-[0.1em] text-blue">
            &larr; work backwards from the aspiration
          </p>
        </div>

        {board.boldMoves.map((move, i) => {
          const placed = milestoneCount(board, move.id);
          const full = !canAddMilestone(board, move.id);
          return (
            <section key={move.id} className="border-t border-ink pt-3">
              <div className="flex items-baseline justify-between gap-3 px-2">
                <h3 className="m-0 max-w-[70ch] text-[14px] font-bold leading-[1.35]">
                  <span className="mr-2 font-mono text-[10px] text-blue">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {move.text}
                </h3>
                <span
                  className={
                    "shrink-0 font-mono text-[9.5px] uppercase tracking-[0.1em] " +
                    (full ? "text-blue" : "text-muted")
                  }
                >
                  {placed} / {MILESTONES_PER_MOVE}
                  {full ? " · full" : ""}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-1 gap-y-3 sm:grid-cols-2 lg:grid-cols-5 lg:gap-y-0">
                {PERIODS.map((p) => (
                  <Cell
                    key={p.key}
                    period={p.key}
                    label={p.label}
                    milestones={milestonesFor(board, move.id, p.key)}
                    editable={editable}
                    busy={busy}
                    full={full}
                    onAdd={(period, text) => onAdd(move, period, text)}
                    onEdit={onEdit}
                    onRequestDelete={setPending}
                    onMove={onMove}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <Directions
        title="Backcasting a move"
        lines={TIMELINE_DIRECTIONS}
        fold={timelineDirections}
      />

      <ConfirmModal
        open={pending !== null}
        title="Delete this milestone?"
        message={pending?.text ?? ""}
        busy={busy}
        onConfirm={() => {
          if (pending) onDelete(pending);
          setPending(null);
        }}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}
