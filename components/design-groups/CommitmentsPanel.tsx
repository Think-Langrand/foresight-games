"use client";

import {
  AnswerList,
  QuestionBlocks,
  type AnswerRow,
  type BoldMoveLane,
  type CommitmentsExercise,
  type HandoffMark,
  type PanelOpts,
} from "@/components/design-groups/AnswerPanels";
import { COMMITMENTS_STEP_MOVES } from "@/lib/exercise-types";
import { SCORE_MAX } from "@/lib/ripples-scoring";

// Read-only rendering of a Week 4 (commitments) week, in the order the week is worked:
//
//   1  the key changes, and the assumptions they break   (authored sections)
//   2  Session 3's risks and opportunities on the matrix (placements, with their scores)
//   3  the wall of strategic responses
//   4  the role, and three bold moves                    (authored sections)
//
// THREE consumers, deliberately one component: the admin answers viewer, the member session
// page's earlier-week tabs, and the live board's own step 5. Unlike Week 3, a locked
// Session 4 renders the interactive five-step board with `editable` false; this panel is
// what step 5 shows the group while the board is still open, which is why the review pane
// and the admin view cannot disagree about what was written.
//
// Steps 1 and 4 are rendered by QuestionBlocks and nothing else, because their prompts are
// authored worksheet sections. That is why this panel hard-codes no headings for them: the
// wording belongs to whoever edited the program, and a copy here would start drifting.
// The blocks are SPLIT on their authored step so the week reads in order — all four prompts
// in one run would put step 4 above step 2.
//
// PARKED, NOT DELETED. The backcasting timeline and the Session 1 uncertainties review are
// wanted for the next workshop, so `Lane`, the lanes/stranded/settled fields and their
// shaping all stay; one flag decides whether they draw. Same pattern as SHOW_UNSETTLED in
// GroupSummary.tsx. Boards worked under the old shape still hold this data, and it is still
// in the CSV and the shape — it simply is not part of the week any more.
const SHOW_BACKCASTING = false;

// Local to this panel. The board's own control formats the same instant in
// ReviewBoard; both are presentation of one stored timestamp, not a shared rule.
function submittedWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return (
    d.toLocaleDateString(undefined, { day: "numeric", month: "short" }) +
    ", " +
    d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[9.5px] font-bold uppercase tracking-[0.12em] text-muted">
      {children}
    </div>
  );
}

// One lane of the timeline, as a row of period cells. Every period shows, empty ones
// included: where a group clustered its milestones and where it left a gap is part of the
// finding, and dropping the empties would quietly straighten the lane out.
//
// Only reachable with SHOW_BACKCASTING on. Kept whole for the next workshop.
function Lane({ lane, ...opts }: { lane: BoldMoveLane } & PanelOpts) {
  const placed = lane.periods.reduce((n, p) => n + p.milestones.length, 0);
  return (
    <div className="border-t border-ink pt-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="m-0 max-w-[70ch] text-[14px] font-bold leading-[1.35]">{lane.move.text}</p>
        <span className="shrink-0 font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted">
          {placed} {placed === 1 ? "milestone" : "milestones"}
        </span>
      </div>
      {placed === 0 ? (
        <p className="mt-1.5 text-[13px] italic text-muted">
          No milestones backcast for this move yet.
        </p>
      ) : (
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
          {lane.periods.map((p) => (
            <div key={p.key}>
              <Eyebrow>{p.label}</Eyebrow>
              {p.milestones.length === 0 ? (
                <p className="mt-1 text-[13px] text-muted">·</p>
              ) : (
                <div className="mt-1">
                  <AnswerList answers={p.milestones} {...opts} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// A notice for work that is on the board but not currently drawn. Both cases are reported
// rather than quietly omitted: a reader who is not told will find the gap later and have no
// way to tell whether the group did the work.
function Notice({
  title,
  blurb,
  rows,
  tone,
  ...opts
}: { title: string; blurb: string; rows: AnswerRow[]; tone: "amber" | "coral" } & PanelOpts) {
  if (rows.length === 0) return null;
  return (
    <div
      className={
        "rounded-[4px] border-l-[3px] px-4 py-3 " +
        (tone === "coral" ? "border-coral bg-coral/10" : "border-amber bg-amber/10")
      }
    >
      <Eyebrow>
        {title} <span className="tabular-nums">{rows.length}</span>
      </Eyebrow>
      <p className="m-0 mt-1 max-w-[76ch] text-[12.5px] italic leading-[1.4] text-muted">{blurb}</p>
      <div className="mt-2">
        <AnswerList answers={rows} {...opts} />
      </div>
    </div>
  );
}

// Step 2's matrix, read back as a ranked list rather than as a grid. A list is the right
// read-only form: the grid answers "where does this sit relative to everything else", which
// is a question for the people placing the cards, and a reader of the handoff wants the
// order — what the group said matters most, first.
//
// `stakeKind` is optional because only a caller holding SESSION 3's board can say whether a
// placement came from a risk or an opportunity. A pick stores its source's id and words, not
// its kind, and nothing was added to it to make this easier: the live board and the handoff
// deck both have Week 3 loaded and pass it, the admin viewer shapes one week at a time and
// does not, and gets the same list without the colour.
function Placements({
  picks,
  stakeKind,
  ...opts
}: {
  picks: HandoffMark[];
  stakeKind?: (sourceId: string) => "risk" | "opportunity" | undefined;
} & PanelOpts) {
  const scored = picks.filter((p) => p.rank !== null);
  const unscored = picks.filter((p) => p.rank === null);

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-ink pb-2">
        <h3 className="m-0 text-[14px] font-bold">
          On the matrix{" "}
          <span className="font-mono text-[10px] font-normal tabular-nums text-muted">
            {picks.length}
          </span>
        </h3>
        <span className="shrink-0 font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted">
          {scored.length} scored
        </span>
      </div>
      <p className="m-0 mt-1 text-[12px] italic leading-[1.4] text-muted">
        The Session 3 risks and opportunities your group placed, strongest first. The score
        is plausibility multiplied by impact, each on a 1 to {SCORE_MAX} scale.
      </p>

      <ol className="m-0 mt-2 list-none p-0">
        {[...scored, ...unscored].map((p, i) => {
          const kind = stakeKind?.(p.sourceId);
          return (
            <li
              key={p.id}
              className="flex gap-3 border-b border-[var(--hairline)] py-[9px] last:border-b-0"
            >
              {/* The rank reads as the ordinal of the SCORED ones only, so an unscored
                  placement does not take a number it has not earned. */}
              <span className="w-5 shrink-0 pt-[1px] text-right font-mono text-[11px] tabular-nums text-muted">
                {p.rank === null ? "·" : i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block max-w-[76ch] text-[14px] leading-[1.45]">{p.text}</span>
                <span className="mt-[2px] flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted">
                  {kind && (
                    <span className="flex items-center gap-1.5">
                      <span
                        aria-hidden
                        className={
                          "inline-block h-2.5 w-2.5 rounded-full " +
                          (kind === "risk" ? "bg-coral" : "bg-lime")
                        }
                      />
                      {kind}
                    </span>
                  )}
                  {p.rank === null ? (
                    <span className="italic normal-case tracking-normal">
                      No score yet
                    </span>
                  ) : (
                    <span className="tabular-nums">
                      P {p.plausibility} · I {p.impact} · {p.rank}
                    </span>
                  )}
                </span>
              </span>
              {opts.onDelete && (
                <button
                  type="button"
                  onClick={() => opts.onDelete?.(p)}
                  className="shrink-0 text-[11px] text-muted underline hover:text-coral"
                >
                  Delete
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function CommitmentsPanel({
  ex,
  seed,
  stakeKind,
  ...opts
}: {
  ex: CommitmentsExercise;
  seed?: React.ReactNode;
  stakeKind?: (sourceId: string) => "risk" | "opportunity" | undefined;
} & PanelOpts) {
  const empty =
    !ex.submittedAt &&
    ex.picks.length === 0 &&
    ex.settledMarks.length === 0 &&
    ex.responses.length === 0 &&
    ex.lanes.length === 0 &&
    ex.stranded.length === 0 &&
    ex.orphans.length === 0 &&
    ex.questions.every((q) => q.answers.length === 0);

  // Split on the authored step so the week reads in the order it is worked. A block with no
  // step at all — anything an admin added to this week by hand — stays with step 1 rather
  // than being dropped, which is also where the editor puts it by default.
  const answered = ex.questions.filter((q) => q.answers.length > 0);
  const changeBlocks = answered.filter((q) => q.step !== COMMITMENTS_STEP_MOVES);
  const moveBlocks = answered.filter((q) => q.step === COMMITMENTS_STEP_MOVES);

  return (
    <div className="flex flex-col gap-6">
      {seed}

      {/* The group's own "we are finished". It gates nothing, so its whole value is being
          seen: the board tells the group a facilitator can see it, and this is where a
          facilitator sees it. Only when set — an unsubmitted week says nothing, because
          "not submitted" is the normal state for three of the four weeks. */}
      {ex.submittedAt && (
        <p className="m-0 rounded-[3px] border-l-[3px] border-[var(--lime-deep)] bg-lime/20 px-4 py-2 text-[12.5px] leading-[1.45]">
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.12em]">
            Submitted
          </span>{" "}
          {submittedWhen(ex.submittedAt)}
          {ex.submittedBy ? ` by ${ex.submittedBy}` : ""}.{" "}
          <span className="italic text-muted">The board stayed open for edits.</span>
        </p>
      )}

      {empty && <p className="text-[13px] italic text-muted">Nothing on this board yet.</p>}

      {/* Step 1. The prompts are the facilitator's, so their headings come from the data. */}
      {changeBlocks.length > 0 && <QuestionBlocks questions={changeBlocks} {...opts} />}

      {/* Step 2. */}
      {ex.picks.length > 0 && <Placements picks={ex.picks} stakeKind={stakeKind} {...opts} />}

      {/* Step 3. No star: the three-move down-select is parked with the backcasting, so a
          `shortlisted` flag here is leftover data from the old shape and marking it would
          show a choice this week no longer asks anyone to make. */}
      {ex.responses.length > 0 && (
        <div>
          <div className="flex items-baseline justify-between gap-3 border-b border-ink pb-2">
            <h3 className="m-0 text-[14px] font-bold">
              Strategic responses{" "}
              <span className="font-mono text-[10px] font-normal tabular-nums text-muted">
                {ex.responses.length}
              </span>
            </h3>
          </div>
          <ul className="m-0 list-none p-0">
            {ex.responses.map((r) => (
              <li
                key={r.id}
                className="flex gap-3 border-b border-[var(--hairline)] py-[9px] last:border-b-0"
              >
                <span className="min-w-0">
                  <span className="block max-w-[76ch] text-[14px] leading-[1.45]">{r.text}</span>
                  {r.mechanism && (
                    <span className="mt-[2px] block text-[13px] italic text-muted">
                      {r.mechanism}
                    </span>
                  )}
                </span>
                {opts.onDelete && (
                  <button
                    type="button"
                    onClick={() => opts.onDelete?.(r)}
                    className="ml-auto shrink-0 text-[11px] text-muted underline hover:text-coral"
                  >
                    Delete
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Step 4. Authored sections again, so again no heading of ours. */}
      {moveBlocks.length > 0 && <QuestionBlocks questions={moveBlocks} {...opts} />}

      {/* Parked. See SHOW_BACKCASTING. */}
      {SHOW_BACKCASTING && ex.settledMarks.length > 0 && (
        <div>
          <p className="m-0 flex items-baseline gap-2 border-b border-ink pb-2">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em]">
              Settled since Session 1{" "}
              <span className="tabular-nums text-muted">{ex.settledMarks.length}</span>
            </span>
          </p>
          <p className="m-0 mt-1 text-[12px] italic leading-[1.4] text-muted">
            Uncertainties the group says these four sessions answered. Everything else stays
            open.
          </p>
          <div className="mt-2">
            <AnswerList answers={ex.settledMarks} {...opts} />
          </div>
        </div>
      )}

      {SHOW_BACKCASTING && ex.lanes.length > 0 && (
        <div>
          <h3 className="m-0 mb-1 text-[14px] font-bold">Backcasting</h3>
          <p className="m-0 mb-3 text-[12.5px] italic text-muted">
            What has to happen, and when, for each bold move to land.
          </p>
          <div className="flex flex-col gap-4">
            {ex.lanes.map((lane) => (
              <Lane key={lane.move.id} lane={lane} {...opts} />
            ))}
          </div>
        </div>
      )}

      {SHOW_BACKCASTING && (
        <Notice
          title="Milestones on a move that is no longer picked"
          blurb="Nothing is lost. These sit under a response the group un-picked, and they come back on the timeline the moment it is chosen again."
          rows={ex.stranded}
          tone="amber"
          {...opts}
        />
      )}

      {/* Never parked. An orphan is the board telling a reader it could not file something,
          and suppressing that is how work goes missing silently. */}
      <Notice
        title="Could not be placed"
        blurb="Cards the board could not file, usually a response attached to something that was later deleted, or work from a step this week no longer runs. Listed here so none of it goes missing."
        rows={ex.orphans}
        tone="coral"
        {...opts}
      />
    </div>
  );
}
