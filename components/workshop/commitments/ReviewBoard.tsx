"use client";

import { useMemo } from "react";
import type { RippleCard } from "@/lib/ripples-types";
import type { CommitmentsExercise } from "@/components/design-groups/AnswerPanels";
import { CommitmentsPanel } from "@/components/design-groups/CommitmentsPanel";
import { indexSynthesisBoard } from "@/lib/synthesis-shape";
import { Directions, DIRECTIONS_FOLD } from "@/components/workshop/synthesis/Directions";
import { makePrefStore } from "@/components/workshop/synthesis/prefStore";

// STEP 5 — read the whole week back, then say you are done.
//
// The read-back is `CommitmentsPanel`, the SAME component the admin answers viewer and the
// earlier-week tabs use, fed by `shapeFromView` over the live board. That is deliberate and
// it is Week 3's own pattern (SynthesisTeamView's locked branch): if the group's review
// pane and the facilitator's view were two components they would drift, and the group would
// be approving something subtly different from what gets read.
//
// SUBMIT LOCKS NOTHING. The board is as editable the moment after as the moment before, so
// a group that spots a typo in its own handoff can fix it without asking anyone to unlock
// anything. The control says so, because a button called Submit on a four-week piece of
// work reads as final unless it tells you otherwise.
//
// The submitted state does NOT arrive over realtime: it lives on design_group_exercises,
// which is not in RIPPLES_TABLES and is not in the realtime publication. A second viewer
// sees it on their next page load. That is the right trade for a once-per-week act — adding
// a table to the board's realtime channel would refetch the whole board on every admin edit
// to any week.

const reviewDirections = makePrefStore(
  "commitments.directions.review",
  "open",
  DIRECTIONS_FOLD
);

// Two lines. There was a third about submitting locking nothing, which repeated what the
// submit bar a few hundred pixels up this same screen already says.
const REVIEW_DIRECTIONS = [
  "Read it top to bottom, the way the steering committee will. They come to it knowing nothing about your sessions.",
  "If you can see a gap here, so will they. Go back to that step and fill it.",
];

function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return (
    d.toLocaleDateString(undefined, { day: "numeric", month: "short" }) +
    ", " +
    d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  );
}

function SubmitBar({
  submittedAt,
  submittedBy,
  editable,
  busy,
  onSubmit,
  onUndo,
  summaryHref,
}: {
  summaryHref?: string;
  submittedAt: string | null;
  submittedBy: string | null;
  editable: boolean;
  busy: boolean;
  onSubmit: () => void;
  onUndo: () => void;
}) {
  if (submittedAt) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-[3px] border-2 border-[var(--lime-deep)] bg-lime/25 px-5 py-4">
        <span className="min-w-0">
          <span className="block text-[15px] font-extrabold uppercase tracking-tight">
            Submitted {when(submittedAt)}
            {submittedBy ? ` by ${submittedBy}` : ""}
          </span>
          <span className="mt-1 block text-[13px] leading-[1.45] text-muted">
            The facilitators can see you are finished. The board stays open, so you can keep
            editing.
          </span>
        </span>
        {editable && (
          <button
            type="button"
            onClick={onUndo}
            disabled={busy}
            className="shrink-0 text-[13px] font-bold uppercase tracking-[0.06em] text-muted underline hover:text-coral disabled:opacity-50"
          >
            Undo
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-[3px] border border-ink px-5 py-4">
      <span className="min-w-0">
        <span className="block text-[15px] font-extrabold uppercase tracking-tight">
          Finished?
        </span>
        <span className="mt-1 block max-w-[62ch] text-[13px] leading-[1.45] text-muted">
          Submitting tells the facilitators this week is done. The board stays open
          afterwards, so you can still change your mind.
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1.5">
        <button
          type="button"
          onClick={onSubmit}
          disabled={!editable || busy}
          className="rounded-[3px] bg-ink px-5 py-2.5 text-[13px] font-bold uppercase tracking-[0.06em] text-paper transition hover:bg-blue disabled:opacity-50"
        >
          Submit this week
        </button>
        {summaryHref && (
          <a
            href={summaryHref}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-muted underline decoration-dotted underline-offset-2 hover:text-blue"
          >
            See the full handoff &#8599;
          </a>
        )}
      </span>
    </div>
  );
}

export function ReviewBoard({
  shaped,
  week3Cards,
  summaryHref,
  composer,
  submittedAt,
  submittedBy,
  editable,
  busy,
  onSubmit,
  onUndo,
}: {
  shaped: CommitmentsExercise;
  week3Cards: RippleCard[];
  summaryHref?: string;
  // Built by CommitmentsTeamView, which is the only thing holding the board state the
  // readiness check needs. Passed as a node so this panel stays a layout.
  composer?: React.ReactNode;
  submittedAt: string | null;
  submittedBy: string | null;
  editable: boolean;
  busy: boolean;
  onSubmit: () => void;
  onUndo: () => void;
}) {
  // Which Session 3 wall each matrix placement came from. Only a caller holding Week 3's
  // board can answer this — the pick stores its source's id and words, not its kind — so
  // the panel takes it as an optional lookup and the admin viewer, which shapes one week at
  // a time, simply renders the list without the colour.
  const stakeKind = useMemo(() => {
    const w3 = indexSynthesisBoard(week3Cards);
    const m = new Map<string, "risk" | "opportunity">();
    for (const arr of w3.risks.values()) for (const c of arr) m.set(c.id, "risk");
    for (const arr of w3.opportunities.values()) for (const c of arr) m.set(c.id, "opportunity");
    return (sourceId: string) => m.get(sourceId);
  }, [week3Cards]);

  return (
    <div className="flex flex-col gap-6">
      {/* THE COMPOSER LEADS. This step used to open with two action cards and then a long
          read-back, which asked a group to submit before it had read anything and gave it
          nothing to do but proofread. The work of this step is writing the lead; everything
          else on the page is either the material it draws on or the way out. */}
      {composer}

      {/* The read-back, below the writing rather than above it: it is what you consult
          while drafting, not the point of the page. No onDelete, so it renders with no
          controls — editing happens on the step that owns the work. */}
      <CommitmentsPanel ex={shaped} stakeKind={stakeKind} />

      {/* ONE BOX, not two. Finishing and looking at the result are the same moment, and as
          separate cards at the top of the page they competed with each other and with the
          writing. The full deck stays a new tab on purpose — it is a full-screen slide view,
          and navigating there in place would drop this step, its scroll and any open
          composer — but it is demoted to a quiet line under the button. */}
      <SubmitBar
        submittedAt={submittedAt}
        submittedBy={submittedBy}
        editable={editable}
        busy={busy}
        onSubmit={onSubmit}
        onUndo={onUndo}
        summaryHref={summaryHref}
      />

      <Directions title="Reading it back" lines={REVIEW_DIRECTIONS} fold={reviewDirections} />
    </div>
  );
}

