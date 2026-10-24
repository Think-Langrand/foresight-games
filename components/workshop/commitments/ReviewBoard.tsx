"use client";

import { useMemo } from "react";
import type { RippleCard } from "@/lib/ripples-types";
import type { CommitmentsExercise } from "@/components/design-groups/AnswerPanels";
import { indexSynthesisBoard } from "@/lib/synthesis-shape";
import { Directions, DIRECTIONS_FOLD } from "@/components/workshop/synthesis/Directions";
import { makePrefStore } from "@/components/workshop/synthesis/prefStore";

// STEP 5 — BUILD HANDOFF GUIDE: write the lead the committee reads first, then say you
// are done.
//
// IT USED TO BE A READ-BACK. The whole week was rendered through `CommitmentsPanel`, the
// same component the admin viewer uses, under two action cards. It asked a group to submit
// before it had read anything and left it nothing to do but proofread thirteen matrix rows.
// The work at the end of four sessions is the writing, so the composer leads and only three
// things follow it: what the group ranked highest on each wall, and what it said it would
// do. Everything else in the handoff is generated from the same data.
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
        {/* PREVIEW SITS LEFT OF SUBMIT because it answers the question Submit asks. A group
            about to say "we are done" wants to read what the committee reads, and it is
            built from what is already on the board — there is nothing to finish first.
            Blue against Submit's ink: two actions, and the one that changes nothing is the
            one that looks different.

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
            Preview this week
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

// What the group ranked highest, and what it chose to do. Three columns' worth of material
// rather than the whole week: this sits under the composer as the thing you check your lead
// against, so it has to be scannable at a glance or it is just the read-back again.
function StakeColumn({
  title,
  tone,
  rows,
}: {
  title: string;
  tone: "risk" | "opportunity";
  rows: { text: string; plausibility: number | null; impact: number | null }[];
}) {
  return (
    <div>
      <p
        className="m-0 mb-2 border-b-[1.5px] border-ink pb-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em]"
        style={{ color: tone === "risk" ? "var(--coral)" : "#3f5209" }}
      >
        {title} <span className="tabular-nums text-muted">{rows.length}</span>
      </p>
      {rows.length === 0 ? (
        <p className="m-0 py-2 text-[13px] italic text-muted">
          Nothing scored on this wall yet.
        </p>
      ) : (
        <ol className="m-0 list-none p-0">
          {rows.map((r, i) => (
            <li
              key={r.text + i}
              className="grid grid-cols-[auto_1fr] items-start gap-x-3 border-b border-[var(--hairline)] py-[11px] last:border-b-0"
            >
              <span className="pt-[2px] font-mono text-[11px] tabular-nums text-muted">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="min-w-0">
                <span className="block max-w-[52ch] text-[14px] leading-[1.45]">{r.text}</span>
                <span className="mt-[3px] block font-mono text-[9.5px] uppercase tracking-[0.1em] tabular-nums text-muted">
                  P {r.plausibility} · I {r.impact}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function TopThree({
  risks,
  opportunities,
  boldMoves,
}: {
  risks: { text: string; plausibility: number | null; impact: number | null }[];
  opportunities: { text: string; plausibility: number | null; impact: number | null }[];
  boldMoves: string[];
}) {
  return (
    <section className="flex flex-col gap-7">
      <div className="grid gap-7 sm:grid-cols-2">
        <StakeColumn title="Your top risks" tone="risk" rows={risks} />
        <StakeColumn title="Your top opportunities" tone="opportunity" rows={opportunities} />
      </div>
      <div>
        <p className="m-0 mb-2 border-b-[1.5px] border-ink pb-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em]">
          Your bold moves <span className="tabular-nums text-muted">{boldMoves.length}</span>
        </p>
        {boldMoves.length === 0 ? (
          <p className="m-0 py-2 text-[13px] italic text-muted">
Nothing written yet. Step 4&rsquo;s second question is where these come from.
          </p>
        ) : (
          <ol className="m-0 list-none p-0">
            {boldMoves.map((m, i) => (
              <li
                key={m + i}
                className="grid grid-cols-[auto_1fr] items-start gap-x-3 border-b border-[var(--hairline)] py-[11px] last:border-b-0"
              >
                <span className="pt-[2px] font-mono text-[11px] tabular-nums text-muted">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="max-w-[72ch] text-[14px] leading-[1.45]">{m}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

export function ReviewBoard({
  shaped,
  week3Cards,
  summaryHref,
  composer,
  boldMoves = [],
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

  // Strongest first, split by which Week 3 wall each came from. `stakeKind` is the only
  // thing that can answer that — a pick stores its source's id and words, not its kind — so
  // a board rendered without Week 3 in hand simply gets empty columns rather than a guess.
  const topStakes = (kind: "risk" | "opportunity") =>
    shaped.picks
      .filter((p) => p.rank !== null && stakeKind(p.sourceId) === kind)
      .sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0))
      .slice(0, 3)
      .map((p) => ({ text: p.text, plausibility: p.plausibility, impact: p.impact }));

  return (
    <div className="flex flex-col gap-6">
      {/* THE COMPOSER LEADS. This step used to open with two action cards and then a long
          read-back, which asked a group to submit before it had read anything and gave it
          nothing to do but proofread. The work of this step is writing the lead; everything
          else on the page is either the material it draws on or the way out. */}
      {composer}

      {/* THE THREE THINGS, not the whole read-back. This used to be CommitmentsPanel: every
          placement, every response, every answer, which ran to thirteen matrix rows and
          buried the writing above it. The rest of the handoff is generated from the same
          data anyway, so a group checking its lead needs only what it ranked highest and
          what it said it would do. */}
      <TopThree
        risks={topStakes("risk")}
        opportunities={topStakes("opportunity")}
        boldMoves={boldMoves.slice(0, 3)}
      />

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

