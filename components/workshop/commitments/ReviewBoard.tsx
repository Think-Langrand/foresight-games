"use client";

import { Directions, DIRECTIONS_FOLD } from "@/components/workshop/synthesis/Directions";
import { makePrefStore } from "@/components/workshop/synthesis/prefStore";

// STEP 5 — HANDOFF: what the group is handing over, and the way to say it is done.
//
// IT HAS BEEN THREE THINGS. First a read-back of the whole week through `CommitmentsPanel`,
// the admin viewer's own component, under two action cards — which asked a group to submit
// before it had read anything and left it nothing to do but proofread thirteen matrix rows.
// Then a model-drafted lead with a shorter read-back beneath it. Both opened on something
// other than what the group had decided.
//
// IT NOW OPENS ON THE CLAIM. Session 4's two closing answers — the role, and the moves that
// get there — then one optional box for anything the four steps did not ask. The ranked
// read-back is gone entirely: the deck is the place to read the week back, and the Preview
// button a few inches down opens it.
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

// The one way from this step to the deck it is editing.
//
// NOT "this week". It opens the handoff deck, which buildGroupSummary assembles from all
// four sessions — Session 1's reactions and open questions, Session 2's key changes and
// their chains, Session 3's themes, stakes and flips, and this week's. Calling it "this
// week" undersold it to the one audience that most needs to see the whole thing.
//
// A NEW TAB, not a navigation. The board is mid-review; sending it away and back would
// reset the step they were reading. As a quiet dotted link below Submit this went
// unclicked, which is what prompted the button.
//
// GATED ON `summaryHref`: the parent passes it only when the handoff is visible to this
// group or the viewer is an admin, so rendering it unconditionally would hand every member
// a 404.
function DeckLink({ summaryHref, label }: { summaryHref?: string; label: string }) {
  if (!summaryHref) return null;
  return (
    <a
      href={summaryHref}
      target="_blank"
      rel="noopener noreferrer"
      className="rounded-[3px] bg-blue px-5 py-2.5 text-[13px] font-bold uppercase tracking-[0.06em] text-white transition hover:bg-ink"
    >
      {label}
    </a>
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
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-[3px] border-2 border-[var(--lime-deep)] bg-lime/25 px-5 py-4">
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
        {/* THE WAY TO THE DECK SURVIVES SUBMITTING. This branch used to return before the
            button below, so the one link to the thing four sessions produced vanished at the
            exact moment a group finished and wanted to look at it — and the handoff tab is
            where they come back to, so it never reappeared. Submitting changes who can see
            the deck, not whether the group can. */}
        <span className="flex shrink-0 flex-wrap items-center justify-end gap-x-5 gap-y-2">
          <DeckLink summaryHref={summaryHref} label="Open your handoff" />
          {editable && (
            <button
              type="button"
              onClick={onUndo}
              disabled={busy}
              className="text-[13px] font-bold uppercase tracking-[0.06em] text-muted underline hover:text-coral disabled:opacity-50"
            >
              Undo
            </button>
          )}
        </span>
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
      <span className="flex shrink-0 flex-wrap items-center justify-end gap-2.5">
        {/* LEFT OF SUBMIT because it answers the question Submit asks, and blue against
            Submit's ink: two actions, and the one that changes nothing looks different. */}
        <DeckLink summaryHref={summaryHref} label="Preview the handoff" />
        <button
          type="button"
          onClick={onSubmit}
          disabled={!editable || busy}
          className="rounded-[3px] bg-ink px-5 py-2.5 text-[13px] font-bold uppercase tracking-[0.06em] text-paper transition hover:bg-blue disabled:opacity-50"
        >
          Submit this week
        </button>
      </span>
    </div>
  );
}

export function ReviewBoard({
  summaryHref,
  composer,
  submittedAt,
  submittedBy,
  editable,
  busy,
  onSubmit,
  onUndo,
}: {
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
  return (
    <div className="flex flex-col gap-6">
      {/* STRAIGHT TO THE ONE THING LEFT TO WRITE. This step has been through four shapes:
          a thirteen-row read-back under two action cards, a model-drafted lead, the week's
          two closing answers, and then the vision beside the three directions. Every one
          of them opened on a read-back of work the group had just done on the step before,
          which is reading rather than deciding — and by act 6 the deck is one click away
          and does it better. What is left is the optional box and the way out. */}
      {composer}

      {/* ONE BOX, not two. Finishing and looking at the result are the same moment, and as
          separate cards at the top of the page they competed with each other and with the
          writing. */}
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

