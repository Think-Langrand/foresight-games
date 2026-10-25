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
      <span className="flex shrink-0 flex-wrap items-center justify-end gap-2.5">
        {/* NOT "this week". It opens the handoff deck, which buildGroupSummary assembles
            from all four sessions — Session 1's reactions and open questions, Session 2's
            key changes and their chains, Session 3's themes, stakes and flips, and this
            week's. Calling it "this week" undersold it to the one audience that most needs
            to see the whole thing before saying it is done.

            LEFT OF SUBMIT because it answers the question Submit asks, and blue against
            Submit's ink: two actions, and the one that changes nothing looks different.

            A NEW TAB, not a navigation. The board is mid-review; sending it away and back
            would reset the step they were reading. As a quiet dotted link below Submit this
            went unclicked, which is what prompted the button.

            Still gated on `summaryHref`: the parent passes it only when the handoff is
            visible to this group or the viewer is an admin, so rendering it unconditionally
            would hand every member a 404. */}
        {summaryHref && (
          <a
            href={summaryHref}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-[3px] bg-blue px-5 py-2.5 text-[13px] font-bold uppercase tracking-[0.06em] text-white transition hover:bg-ink"
          >
            Preview the handoff
          </a>
        )}
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

// THE ROLE, AND HOW TO GET THERE — step 4's two questions side by side under one heading,
// because they are one claim. The aspiration on its own is a wish and the moves on their own
// are a list of errands; the group wrote them as a pair and the committee reads them as one.
//
// ONE SHARED HEADING over two boxes rather than a heading each: two headings would invite
// the two to be read as separate findings, which is the reading this is trying to prevent.
function RoleAndMoves({
  aspiration,
  boldMoves,
}: {
  aspiration: string[];
  boldMoves: string[];
}) {
  return (
    <section>
      <h2 className="m-0 mb-3 border-b-[1.5px] border-ink pb-2 text-[15px] font-extrabold uppercase tracking-tight">
        The role of public health and how to get there
      </h2>
      {/* SLATE, AND THE ONLY DARK THING ON THE STEP. This pair is the handoff's actual
          claim; everything else here is either context for it or the way out, so it is
          where the one strong surface belongs. --slate rather than --ink: --ink is the text
          colour and neutral by construction, and a neutral near-black behind cream reads
          cold. See the token.

          A NARROW GUTTER, not the gap-7 the rest of the step uses. Two dark cards set far
          apart read as two findings, which is the reading the shared heading exists to
          prevent; at this distance the paper between them is a seam in one block.

          Stacked below sm — two narrow columns of prose on a phone is worse than reading
          one after the other, and the pairing survives the stack because the heading sits
          above both. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="min-h-[240px] rounded-[3px] bg-slate px-5 py-4 text-paper">
          {/* Tints are the paper colour held back, not --muted: that is a mid-tone picked
              to sit ON cream, and on slate it all but disappears. Measured against
              #2b2b24 — body 12.9:1, the 10px labels at 70% 7.1:1, the 11px numbers and
              the empty state at 60% 5.7:1. The 15% rules are decoration, not text. */}
          <p className="m-0 mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-paper/70">
            The role
          </p>
          {aspiration.length === 0 ? (
            <p className="m-0 py-2 text-[13px] italic text-paper/60">
              Nothing written yet. Step 4&rsquo;s first question is where this comes from.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {aspiration.map((a, i) => (
                <p key={a + i} className="m-0 max-w-[52ch] text-[14.5px] leading-[1.5]">
                  {a}
                </p>
              ))}
            </div>
          )}
        </div>
        <div className="min-h-[240px] rounded-[3px] bg-slate px-5 py-4 text-paper">
          <p className="m-0 mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-paper/70">
            How to get there <span className="tabular-nums">{boldMoves.length}</span>
          </p>
          {boldMoves.length === 0 ? (
            <p className="m-0 py-2 text-[13px] italic text-paper/60">
              Nothing written yet. Step 4&rsquo;s second question is where these come from.
            </p>
          ) : (
            <ol className="m-0 list-none p-0">
              {boldMoves.map((m, i) => (
                <li
                  key={m + i}
                  className="grid grid-cols-[auto_1fr] items-start gap-x-3 border-b border-paper/15 py-[11px] last:border-b-0"
                >
                  <span className="pt-[2px] font-mono text-[11px] tabular-nums text-paper/60">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="max-w-[52ch] text-[14px] leading-[1.45]">{m}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </section>
  );
}

export function ReviewBoard({
  summaryHref,
  composer,
  aspiration = [],
  boldMoves = [],
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
  // Step 4's FIRST question — "the aspirational role for public health in this world".
  // Matched by section key upstream, not by position, because a facilitator can reorder or
  // relabel the week's prompts.
  aspiration?: string[];
  // Step 4's SECOND QUESTION — "the boldest moves public health could make" — as answers.
  //
  // NOT `shaped.boldMoves`, which is a different thing wearing the same name: the strategic
  // responses the group shortlisted on step 3's wall. Reading that here printed "none
  // picked yet" at groups who had written three bold moves one step earlier. The caller
  // filters the section, because only it holds the week's sections.
  boldMoves?: string[];
  submittedAt: string | null;
  submittedBy: string | null;
  editable: boolean;
  busy: boolean;
  onSubmit: () => void;
  onUndo: () => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      {/* THE GROUP'S OWN ANSWER FIRST. This step has been through two shapes: two action
          cards over a thirteen-row read-back, and then a model-drafted lead with the
          read-back under it. Both opened on something other than what the group actually
          decided. It now opens on step 4's two answers, which ARE the handoff's claim —
          everything else here is either context for them or the way out. */}
      <RoleAndMoves aspiration={aspiration} boldMoves={boldMoves} />

      {/* Then the one thing left to write, and it is optional. */}
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

