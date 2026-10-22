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

const REVIEW_DIRECTIONS = [
  "Read it as the steering committee will: top to bottom, with none of this session in your head.",
  "A gap you can see here is a gap they will see. Go back to the step and fill it.",
  "Submitting tells the facilitators you are finished. It does not lock anything, so you can still fix a line afterwards.",
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
}: {
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
            The facilitators can see you are finished. The board is still open, so you can
            keep editing.
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
          Submitting tells the facilitators this week is done. It does not lock the board and
          it is not final, so you can still change your mind.
        </span>
      </span>
      <button
        type="button"
        onClick={onSubmit}
        disabled={!editable || busy}
        className="shrink-0 rounded-[3px] bg-ink px-5 py-2.5 text-[13px] font-bold uppercase tracking-[0.06em] text-paper transition hover:bg-blue disabled:opacity-50"
      >
        Submit this week
      </button>
    </div>
  );
}

export function ReviewBoard({
  shaped,
  week3Cards,
  summaryHref,
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
      {/* The deck this week exists to fill, one click away. A NEW TAB on purpose: the deck
          is a full-screen slide view, and navigating there in place would drop the board's
          step, its scroll and any open composer. A group should be able to look, decide,
          and come back to the same screen. */}
      {summaryHref && (
        <a
          href={summaryHref}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between gap-4 rounded-[3px] border border-ink px-5 py-4 transition hover:bg-card"
        >
          <span className="min-w-0">
            <span className="block text-[15px] font-extrabold uppercase tracking-tight">
              Your handoff
            </span>
            <span className="mt-1 block text-[13px] leading-[1.45] text-muted">
              Four sessions on one page, the way the steering committee will meet it.
            </span>
          </span>
          <span className="shrink-0 text-[13px] font-bold uppercase tracking-[0.06em] text-blue">
            Preview &rarr;
            <span className="mt-0.5 block text-[10px] font-normal normal-case tracking-normal text-muted">
              opens a new tab
            </span>
          </span>
        </a>
      )}

      <SubmitBar
        submittedAt={submittedAt}
        submittedBy={submittedBy}
        editable={editable}
        busy={busy}
        onSubmit={onSubmit}
        onUndo={onUndo}
      />

      {/* No onDelete passed, so the panel renders with no controls at all. Editing happens
          on the step that owns the work, which is also what keeps this pane honest about
          being a read-back. */}
      <CommitmentsPanel ex={shaped} stakeKind={stakeKind} />

      <Directions title="Reading it back" lines={REVIEW_DIRECTIONS} fold={reviewDirections} />
    </div>
  );
}

