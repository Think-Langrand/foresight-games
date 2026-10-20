"use client";

import {
  AnswerList,
  QuestionBlocks,
  type AnswerRow,
  type BoldMoveLane,
  type CommitmentsExercise,
  type PanelOpts,
} from "@/components/design-groups/AnswerPanels";

// Read-only rendering of a Week 4 (commitments) week: the aspiration the group wrote, its
// wall of strategic responses with the three bold moves marked, and each move's backcast
// timeline across the ten-year span.
//
// THREE consumers, deliberately one component, the same as SynthesisPanel: the admin
// answers viewer, the member session page's earlier-week tabs, and the live board itself
// once the week is locked. A locked week has to keep showing the whole artefact.
//
// Step 1 is rendered by QuestionBlocks and nothing else, because the aspiration prompts are
// authored worksheet sections. That is why this panel has no "aspiration" section of its
// own: the prompts' wording belongs to whoever edited the program, and hard-coding a
// heading here would start a second copy of it that could drift.

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

// A notice for work that is on the board but not currently drawn by the timeline. Both
// cases are reported rather than quietly omitted: a reader who is not told will find the
// gap later and have no way to tell whether the group did the work.
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

export function CommitmentsPanel({
  ex,
  seed,
  ...opts
}: { ex: CommitmentsExercise; seed?: React.ReactNode } & PanelOpts) {
  const empty =
    ex.responses.length === 0 &&
    ex.lanes.length === 0 &&
    ex.stranded.length === 0 &&
    ex.orphans.length === 0 &&
    ex.questions.every((q) => q.answers.length === 0);

  const picked = ex.boldMoves.length;
  const boldIds = new Set(ex.boldMoves.map((m) => m.id));

  return (
    <div className="flex flex-col gap-6">
      {seed}

      {empty && <p className="text-[13px] italic text-muted">Nothing on this board yet.</p>}

      {/* Step 1. The prompts are the facilitator's, so their headings come from the data. */}
      {ex.questions.some((q) => q.answers.length > 0) && (
        <QuestionBlocks questions={ex.questions} {...opts} />
      )}

      {/* Step 2, with step 3 marked on it rather than listed twice: a bold move is one of
          these cards carrying `shortlisted`, and giving it a second home here would make
          the three picks look like three extra responses. */}
      {ex.responses.length > 0 && (
        <div>
          <div className="flex items-baseline justify-between gap-3 border-b border-ink pb-2">
            <h3 className="m-0 text-[14px] font-bold">
              Strategic responses{" "}
              <span className="font-mono text-[10px] font-normal tabular-nums text-muted">
                {ex.responses.length}
              </span>
            </h3>
            <span className="shrink-0 font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted">
              {picked} picked as bold {picked === 1 ? "move" : "moves"}
            </span>
          </div>
          <ul className="m-0 list-none p-0">
            {ex.responses.map((r) => {
              const bold = boldIds.has(r.id);
              return (
                <li
                  key={r.id}
                  className="flex gap-3 border-b border-[var(--hairline)] py-[9px] last:border-b-0"
                >
                  {/* The star carries the pick, and the bold weight repeats it, so the
                      three chosen are findable without relying on one small glyph. */}
                  <span
                    className="w-3 shrink-0 pt-[2px] text-center text-[12px] text-amber"
                    title={bold ? "Picked as a bold move" : undefined}
                  >
                    {bold ? "★" : ""}
                  </span>
                  <span className="min-w-0">
                    <span
                      className={
                        "block max-w-[76ch] text-[14px] leading-[1.45] " + (bold ? "font-bold" : "")
                      }
                    >
                      {r.text}
                    </span>
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
              );
            })}
          </ul>
        </div>
      )}

      {/* Step 4. */}
      {ex.lanes.length > 0 && (
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

      <Notice
        title="Milestones on a move that is no longer picked"
        blurb="Nothing is lost. These sit under a response the group un-picked, and they come back on the timeline the moment it is chosen again."
        rows={ex.stranded}
        tone="amber"
        {...opts}
      />
      <Notice
        title="Could not be placed"
        blurb="A milestone the board could not file, because its period is missing or unrecognised. Shown so it is not silently lost."
        rows={ex.orphans}
        tone="coral"
        {...opts}
      />
    </div>
  );
}
