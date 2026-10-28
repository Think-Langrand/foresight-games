"use client";

import {
  AnswerList,
  QuestionBlocks,
  type AnswerRow,
  type BoldMoveLane,
  type CommitmentsExercise,
  type HandoffMark,
  type DirectionRow,
  type PanelOpts,
  type PrioritySlotRow,
} from "@/components/design-groups/AnswerPanels";
import { commitmentsSectionsFor } from "@/lib/exercise-types";
import { SCORE_MAX } from "@/lib/ripples-scoring";

// Read-only rendering of a Week 4 (Synthesis) week, in the order the week is worked:
//
//   1.1  discussion notes                                   (authored section)
//   1.2  the matrix, the three priorities with their why, the overlook note
//   2.1  each priority's desired outcomes
//   2.2  each outcome's response ideas
//   3.1  the vision                                         (authored section)
//   3.2  the three bold moves with their fields, how they work together
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
// ACT 2'S ACTUAL OUTPUT, separate from the matrix above it. The matrix shows everything
// the group weighed; this shows the three it chose and anything it could not settle, which
// is what reaches the handoff's opening slide.
//
// NO DELETE HERE. Un-starring happens on the board, and the pick itself is deleted from
// the matrix row above — offering it in two places would let a facilitator remove a scored
// placement while meaning only to drop a star.
function Priorities({
  picks,
  stakeKind,
}: {
  picks: HandoffMark[];
  stakeKind?: (sourceId: string) => "risk" | "opportunity" | undefined;
}) {
  const chosen = picks.filter((p) => p.priority);
  const disputed = picks.filter((p) => p.disputed);
  const kindOf = (p: HandoffMark) => stakeKind?.(p.sourceId);
  // Confirmed first, as the board shows them. `picks` arrives in rank order.
  const ordered = [...chosen].sort((a, b) => Number(b.confirmed) - Number(a.confirmed));

  return (
    <div>
      <p className="m-0 flex items-baseline gap-2 border-b border-ink pb-2">
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em]">
          Priorities <span className="tabular-nums text-muted">{chosen.length}</span>
        </span>
      </p>
      {ordered.length === 0 ? (
        <p className="m-0 py-2 text-[13px] italic text-muted">Nothing scored yet.</p>
      ) : (
        <ol className="m-0 list-none p-0">
          {ordered.map((p, i) => (
            <li
              key={p.id}
              className="border-b border-[var(--hairline)] py-[9px] last:border-b-0"
            >
              <span className="mr-2 font-mono text-[11px] tabular-nums text-blue">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="text-[14px] leading-[1.45]">{p.text}</span>
              {kindOf(p) && (
                <span className="ml-2 font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted">
                  {kindOf(p)}
                </span>
              )}
              <span
                className={
                  "ml-2 rounded-[2px] px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.1em] " +
                  (p.confirmed ? "bg-lime text-ink" : "bg-[var(--board)] text-muted")
                }
              >
                {p.confirmed ? "Confirmed" : "Suggested"}
              </span>
              {p.note && (
                <span className="mt-[2px] block pl-7 text-[13px] italic text-muted">{p.note}</span>
              )}
            </li>
          ))}
        </ol>
      )}

      {/* LEGACY. The "still disputed" flag from the shape before the overlook note; only a
          board worked under it has any. A dispute is a finding about the ROOM, so it is
          shown even when it sits on an issue that did not make the three. */}
      {disputed.length > 0 && (
        <div className="mt-4">
          <p className="m-0 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-blue">
            Still disputed <span className="tabular-nums text-muted">{disputed.length}</span>
          </p>
          <ul className="m-0 list-none p-0">
            {disputed.map((p) => (
              <li
                key={p.id}
                className="border-b border-[var(--hairline)] py-[9px] last:border-b-0"
              >
                <span className="block text-[14px] leading-[1.45]">{p.text}</span>
                {p.note && (
                  <span className="mt-[2px] block text-[13px] italic text-muted">{p.note}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// Act 6's chosen directions, each with the three answers that sharpen it. Every field is
// printed answered or not: an unsharpened direction is the thing a facilitator most wants
// to see before a session ends.
function Directions({ rows }: { rows: DirectionRow[] }) {
  return (
    <div>
      <p className="m-0 flex items-baseline gap-2 border-b border-ink pb-2">
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em]">
          Three bold moves <span className="tabular-nums text-muted">{rows.length}</span>
        </span>
      </p>
      <ol className="m-0 list-none p-0">
        {rows.map((d, i) => (
          <li key={d.move.id} className="border-b border-[var(--hairline)] py-3 last:border-b-0">
            <p className="m-0 text-[14px] font-bold leading-[1.4]">
              <span className="mr-2 font-mono text-[11px] tabular-nums text-blue">
                {String(i + 1).padStart(2, "0")}
              </span>
              {d.move.text}
            </p>
            <dl className="m-0 mt-2 grid gap-x-6 gap-y-2 pl-7 sm:grid-cols-3">
              {d.fields.map((f) => (
                <div key={f.key}>
                  <dt className="m-0 font-mono text-[9.5px] font-bold uppercase tracking-[0.12em] text-muted">
                    {f.label}
                  </dt>
                  <dd className="m-0 text-[13px] leading-[1.45]">
                    {f.answers.length === 0 ? (
                      <span className="italic text-muted">Not answered.</span>
                    ) : (
                      f.answers.map((a) => <span key={a.id} className="block">{a.text}</span>)
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ol>
    </div>
  );
}

// Acts 2.1 and 2.2: each priority's outcomes, each with its ideas. Printed under the
// priority because that is the structure the two activities added; a flat list of ideas
// would lose which outcome each served.
function OutcomesAndIdeas({ slots, stray, ...opts }: { slots: PrioritySlotRow[]; stray: CommitmentsExercise["strayOutcomes"] } & PanelOpts) {
  const total = slots.reduce((n, s) => n + s.outcomes.length, 0) + stray.reduce((n, s) => n + s.outcomes.length, 0);
  if (total === 0) return null;
  return (
    <div>
      <p className="m-0 flex items-baseline gap-2 border-b border-ink pb-2">
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em]">
          Desired outcomes and response ideas <span className="tabular-nums text-muted">{total}</span>
        </span>
      </p>
      <ol className="m-0 list-none p-0">
        {slots.map((s, i) => (
          <li key={s.pick.id} className="border-b border-[var(--hairline)] py-3 last:border-b-0">
            <p className="m-0 text-[14px] font-bold leading-[1.4]">
              <span className="mr-2 font-mono text-[11px] tabular-nums text-blue">
                {String(i + 1).padStart(2, "0")}
              </span>
              {s.pick.text}
            </p>
            {s.outcomes.length === 0 ? (
              <p className="m-0 mt-1 pl-7 text-[13px] italic text-muted">No outcome written.</p>
            ) : (
              <ul className="m-0 mt-2 flex list-none flex-col gap-2 p-0 pl-7">
                {s.outcomes.map(({ outcome, responses }, k) => (
                  <li key={outcome.id}>
                    <div className="flex items-start gap-3">
                      <span className="min-w-0 flex-1 text-[13.5px] leading-[1.45]">
                        <span className="mr-1.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted">
                          {i + 1}.{k + 1}
                        </span>
                        {outcome.text}
                      </span>
                      {opts.onDelete && (
                        <button
                          type="button"
                          onClick={() => opts.onDelete?.(outcome)}
                          className="shrink-0 text-[11px] text-muted underline hover:text-coral"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                    {responses.length > 0 && (
                      <div className="mt-1 pl-4">
                        <AnswerList answers={responses} {...opts} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
      {stray.length > 0 && (
        <div className="mt-3">
          <Eyebrow>No longer a priority</Eyebrow>
          <ul className="m-0 mt-1 flex list-none flex-col gap-1.5 p-0">
            {stray.map(({ pick, outcomes }) => (
              <li key={pick.id} className="text-[13px] leading-[1.45]">
                <span className="font-bold">{pick.text}</span>
                <ul className="m-0 mt-1 flex list-none flex-col gap-1.5 p-0 pl-3">
                  {outcomes.map(({ outcome, responses }) => (
                    <li key={outcome.id}>
                      <AnswerList answers={[outcome]} {...opts} />
                      {responses.length > 0 && (
                        <div className="mt-1 pl-4">
                          <AnswerList answers={responses} {...opts} />
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

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
        The Session 3 risks and opportunities your group scored, strongest first. The score
        is likelihood multiplied by impact, each on a 1 to {SCORE_MAX} scale.
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
                      L {p.plausibility} · I {p.impact} · {p.rank}
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
    ex.prioritySlots.every((s) => s.outcomes.length === 0) &&
    ex.strayOutcomes.length === 0 &&
    ex.directions.length === 0 &&
    ex.lanes.length === 0 &&
    ex.stranded.length === 0 &&
    ex.orphans.length === 0 &&
    ex.questions.every((q) => q.answers.length === 0);

  // Bucketed by the step registry so the week reads in the order it is worked, and so a
  // board stamped before the six-activity rebuild still lands somewhere a facilitator can
  // see it. A block whose step nobody recognises — anything an admin added by hand —
  // stays with act 1 rather than being dropped, which is where the editor puts it anyway.
  const answered = ex.questions.filter((q) => q.answers.length > 0);
  const groundingBlocks = commitmentsSectionsFor(answered, "reconnect");
  const overlookBlocks = commitmentsSectionsFor(answered, "prioritize");
  const outcomeBlocks = commitmentsSectionsFor(answered, "outcomes"); // legacy flat outcomes
  const visionBlocks = commitmentsSectionsFor(answered, "vision");
  const togetherBlocks = commitmentsSectionsFor(answered, "directions");

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

      {/* Act 1. The prompts are the facilitator's, so their headings come from the data. */}
      {groundingBlocks.length > 0 && <QuestionBlocks questions={groundingBlocks} {...opts} />}

      {/* 1.2. The matrix, then the three the group confirmed off it, then the overlook note. */}
      {ex.picks.length > 0 && <Placements picks={ex.picks} stakeKind={stakeKind} {...opts} />}
      {ex.picks.some((p) => p.priority || p.disputed) && (
        <Priorities picks={ex.picks} stakeKind={stakeKind} />
      )}
      {overlookBlocks.length > 0 && <QuestionBlocks questions={overlookBlocks} {...opts} />}

      {/* 2.1 and 2.2, nested. */}
      <OutcomesAndIdeas slots={ex.prioritySlots} stray={ex.strayOutcomes} {...opts} />
      {/* LEGACY: flat outcomes from the retired prompt. */}
      {outcomeBlocks.length > 0 && <QuestionBlocks questions={outcomeBlocks} {...opts} />}

      {/* LEGACY: root responses from the untagged wall. `shortlisted` here is retired data
          from the down-select the bold moves replaced. */}
      {ex.looseResponses.length > 0 && (
        <div>
          <div className="flex items-baseline justify-between gap-3 border-b border-ink pb-2">
            <h3 className="m-0 text-[14px] font-bold">
              Strategic responses, not linked to an outcome{" "}
              <span className="font-mono text-[10px] font-normal tabular-nums text-muted">
                {ex.looseResponses.length}
              </span>
            </h3>
          </div>
          <ul className="m-0 list-none p-0">
            {ex.looseResponses.map((r) => (
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

      {/* 3.1. Authored section again, so again no heading of ours. */}
      {visionBlocks.length > 0 && <QuestionBlocks questions={visionBlocks} {...opts} />}

      {/* 3.2. */}
      {ex.directions.length > 0 && <Directions rows={ex.directions} />}
      {togetherBlocks.length > 0 && <QuestionBlocks questions={togetherBlocks} {...opts} />}

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
