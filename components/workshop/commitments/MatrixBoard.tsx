"use client";

import { useMemo, useState } from "react";
import type { RippleCard } from "@/lib/ripples-types";
import type { ScorePatchInput } from "@/lib/ripples-scoring";
import type { Score } from "@/lib/ripples-scoring";
import { AXIS_ENDS, SCORE_AXES } from "@/lib/ripples-scoring";
import {
  MAX_PRIORITIES,
  PLACED_FLOOR_PER_KIND,
  isDisputed,
  isPriority,
  priorities,
  type CommitmentsBoard,
} from "@/lib/commitments-shape";
import { indexSynthesisBoard, isUnnamedTheme, themeLabel } from "@/lib/synthesis-shape";
import { ImpactMatrix } from "@/components/workshop/ImpactMatrix";
import { ScoreScale } from "@/components/workshop/ScoreScale";
import { TONE } from "@/components/workshop/synthesis/CardWall";
import { Directions, DIRECTIONS_FOLD } from "@/components/workshop/synthesis/Directions";
import { StepIntro } from "@/components/workshop/commitments/StepIntro";
import { makePrefStore } from "@/components/workshop/synthesis/prefStore";
import { StepProgress } from "@/components/workshop/commitments/StepProgress";

// STEP 2 — what is at stake, ranked. Session 3 named the risks and opportunities; this step
// asks which of them matter and how, on the same impact x plausibility matrix Week 2 used
// for its key changes.
//
// SCORING IS PLACING. Every card shows both scales from the first paint, and a card reaches
// the matrix when both are set. There is no "place this one" act to perform first: an
// earlier version had one, and it read as a gate in front of the only thing the step
// actually asks for. The pick a score needs is minted lazily on the first click.
//
// WHY A PICK CARRIES THE SCORE. Session 3's risks cannot be scored where they live:
// the score route refuses anything that is not a tree ROOT, resolves the card by the URL's
// session code, and needs a player identity on that same board. A Week 3 per-theme risk
// fails all three, and a locked Week 3 board refuses every write anyway. A `pick` is a Week
// 4 card pointing at that risk and carrying its words, and because it IS a root on this
// board, the existing score route, `matrixCells` and `ImpactMatrix` all take it unchanged.
// So the first score on a card mints its pick, and both score rows then write to the pick.
//
// THE FLOOR IS A MINIMUM. See PLACED_FLOOR_PER_KIND. The group scores as many as it wants
// above that floor, and choosing which ones is the judgement the step is for. Scoring all 44
// was never the ask.

const matrixDirections = makePrefStore(
  "commitments.directions.matrix",
  "open",
  DIRECTIONS_FOLD
);

// The questions the breakout is actually discussing. They sit open at the top of the tab,
// not in the fold below: the group's answer to them is the three cards it stars, so they
// have to be in view while it scores rather than tucked behind a toggle.
const MATRIX_PROMPTS = [
  "Which risks and opportunities have the greatest consequences?",
  "How well are they supported by the conditions of our scenario?",
  "Is there anything we cannot afford to overlook, even if we disagree about how likely it is?",
];

// How the board works, which is a different thing from what the group is talking about.
const MATRIX_DIRECTIONS = [
  "A risk you hate can still be low impact. Something years off can still be near certain.",
  `Score at least ${PLACED_FLOOR_PER_KIND} of each wall, and more if they matter. A card reaches the matrix when both scales are set.`,
  "Skip any card your group has no view on.",
  `The ${MAX_PRIORITIES} highest-scoring become your priorities, across both walls. Nothing to click — re-score and they change.`,
  "If the room splits on one and you keep it anyway, tick the box and say what the argument was.",
  "Score as a group with one person recording. Two people scoring the same card will overwrite each other.",
];

type Kind = "risk" | "opportunity";

function Panel({
  kind,
  groups,
  pickFor,
  scoresFor,
  editable,
  busy,
  isPriorityRow,
  isFlagged,
  noteFor,
  hoveredId,
  onHover,
  onScore,
  onClear,
  onToggleDisputed,
  onNote,
}: {
  kind: Kind;
  groups: { id: string; label: string; cards: RippleCard[] }[];
  pickFor: (sourceId: string) => RippleCard | undefined;
  // The scores to SHOW for a Session 3 card, which is not always what is on a pick: the
  // first click on an untouched card has to paint before the pick it will live on exists.
  scoresFor: (sourceId: string) => { plausibility: Score | null; impact: Score | null };
  editable: boolean;
  busy: boolean;
  // A READOUT, not a control: whether the scores put this row in the top three.
  isPriorityRow: (sourceId: string) => boolean;
  isFlagged: (sourceId: string) => boolean;
  noteFor: (sourceId: string) => string;
  hoveredId: string | null;
  onHover: (id: string | null) => void;
  onScore: (card: RippleCard, patch: ScorePatchInput) => void;
  onClear: (card: RippleCard) => void;
  onToggleDisputed: (card: RippleCard, on: boolean) => void;
  onNote: (card: RippleCard, note: string) => void;
}) {
  const t = TONE[kind];
  const all = groups.flatMap((g) => g.cards);
  const isDone = (c: RippleCard) => {
    const s = scoresFor(c.id);
    return s.plausibility !== null && s.impact !== null;
  };
  const scored = all.filter(isDone).length;
  const met = scored >= PLACED_FLOOR_PER_KIND;
  const label = kind === "risk" ? "Risks" : "Opportunities";

  if (all.length === 0) {
    return (
      <section className={"rounded-[4px] border-2 px-4 py-3 " + t.edge + " " + t.well}>
        <span className={"rounded-[2px] px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.08em] " + t.chip}>
          {label}
        </span>
        <p className="m-0 mt-2 text-[13px] italic text-muted">
          Session 3 recorded none of these.
        </p>
      </section>
    );
  }

  return (
    <section className={"flex min-w-0 flex-col overflow-hidden rounded-[4px] border-2 " + t.edge + " " + t.well}>
      <div className="sticky top-0 z-10 flex flex-wrap items-baseline gap-2 border-b border-black/10 bg-paper/95 px-4 py-3 backdrop-blur">
        <span className={"rounded-[2px] px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.08em] " + t.chip}>
          <span aria-hidden className="mr-1">
            {t.mark}
          </span>
          {label}
        </span>
        <span className="text-[12px] font-bold tabular-nums">
          {scored} of {all.length} scored
        </span>
        <span className="text-[11px] italic text-muted">
          {met
            ? `past ${PLACED_FLOOR_PER_KIND} · keep going if they matter`
            : `at least ${PLACED_FLOOR_PER_KIND}`}
        </span>
      </div>

      {groups.map((g) => {
        const none = g.cards.every((c) => !isDone(c));
        return (
          <div key={g.id} className="px-4 py-2">
            <h4 className="flex flex-wrap items-baseline gap-2 text-[10px] font-bold uppercase leading-[1.3] tracking-[0.08em] text-muted">
              {g.label}
              {/* Named rather than left implicit: with a floor it is easy to score five
                  from one theme and leave another untouched, and the gap is the finding. */}
              {none && (
                <span className="font-normal normal-case tracking-normal text-coral">
                  nothing scored from this theme
                </span>
              )}
            </h4>
            <ul className="m-0 mt-1 flex list-none flex-col p-0">
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
                const starred = isPriorityRow(c.id);
                const flagged = isFlagged(c.id);
                return (
                  <li
                    key={c.id}
                    onMouseEnter={() => pick && onHover(pick.id)}
                    onMouseLeave={() => onHover(null)}
                    className={
                      "rounded-[3px] px-1 py-1.5 transition-colors " +
                      (done ? "bg-paper/80" : "") +
                      (pick && hoveredId === pick.id ? " ring-1 ring-ink/30" : "")
                    }
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className={
                          "min-w-0 flex-1 text-[13px] leading-[1.45] " + (done ? "font-bold" : "")
                        }
                      >
                        {starred && <span className="mr-1 text-amber">★</span>}
                        {c.text}
                      </span>
                      {/* NO STAR. There was one here, and it was a second way of saying
                          what the two scores already say — a group would score an issue
                          5×5 and still find a 3×4 in its priorities because that was what
                          somebody had clicked. Scoring IS the prioritising; the star on
                          the text above is a readout of where this row landed, not a
                          control. */}
                      {/* Only once something has been scored. There is no placement act to
                          undo any more, but a mis-click still has to be reversible, and an
                          untouched card has nothing to clear. */}
                      {editable && touched && (
                        <button
                          type="button"
                          onClick={() => onClear(c)}
                          className="shrink-0 text-[11px] text-muted underline hover:text-coral"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    {/* The dispute note, on the row it belongs to. ON ANY SCORED ROW, not
                        just the top three: this step's own third question asks whether
                        there is anything the group cannot afford to overlook EVEN IF it
                        disagrees about how likely it is — which is a low-plausibility row
                        by definition, and so never one of the three. Gating this on the
                        priorities would have put the control everywhere except the rows it
                        was written for.

                        SHOWN WHILE FLAGGED whatever the scores now say: the flag survives
                        re-scoring and still reaches the handoff, so hiding the only
                        control that clears it would leave a dispute on the deck with no
                        way back to it. */}
                    {(touched || flagged) && editable && (
                      <label className="mt-1.5 flex items-start gap-1.5 text-[11px] text-muted">
                        <input
                          type="checkbox"
                          checked={flagged}
                          disabled={busy}
                          onChange={() => onToggleDisputed(c, !flagged)}
                          className="mt-[2px] h-3.5 w-3.5 shrink-0 accent-[var(--blue)]"
                        />
                        {/* Sentence case, not the uppercase every other label on this
                            board wears: those are headings, and this is a thing to do. */}
                        <span className="font-bold">Add note or disagreement context</span>
                      </label>
                    )}
                    {/* KEYED ON THE NOTE, and a no-op blur writes nothing. Uncontrolled
                        with a fixed key, a box that mounted empty never learned about a
                        note a teammate typed afterwards — and then any click away posted
                        its blank over their words. Same two guards MovesBoard's fields
                        carry, and for the same reason. */}
                    {flagged && (
                      <textarea
                        key={noteFor(c.id)}
                        defaultValue={noteFor(c.id)}
                        disabled={!editable || busy}
                        onBlur={(e) => {
                          if (e.target.value.trim() === noteFor(c.id).trim()) return;
                          onNote(c, e.target.value);
                        }}
                        rows={2}
                        placeholder="What does the room disagree about here?"
                        className="mt-1 w-full rounded-[3px] border border-[var(--rule)] bg-paper px-2 py-1.5 text-[12px] leading-[1.45]"
                      />
                    )}

                    {/* ALWAYS SHOWN. Scoring is what puts a card on the matrix, so there is
                        nothing to open first: the scales are the step. */}
                    <div className="mt-2 flex flex-col gap-1.5">
                      {SCORE_AXES.map((axis) => (
                        <ScoreScale
                          key={axis}
                          axis={axis}
                          value={scores[axis]}
                          // NOT gated on `busy`. A board-wide busy flag disables every
                          // scale on every card for the length of one write, so a group
                          // scoring at speed loses the clicks it makes in that window and
                          // is told nothing. The same bug was fixed once already on step
                          // 4's checkboxes; the matrix inherited it. Concurrency is the
                          // `scores` overlay's job: patches merge per axis and its inflight
                          // counter decides when a server value may take over.
                          disabled={!editable}
                          lowLabel={AXIS_ENDS[axis].low}
                          highLabel={AXIS_ENDS[axis].high}
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
          </div>
        );
      })}
    </section>
  );
}

// The three the scores chose, under the matrix that chose them.
//
// A READ-BACK, NOT A PICKER. Starring happens on the row itself, in the walls on the left,
// because that is where the card and its scores already are. This panel used to be a
// second list of all forty stakes below the matrix, which put the same cards on the tab
// twice and made a group scroll between the two to match one to the other.
function ChosenThree({ rows }: { rows: { card: RippleCard; kind: Kind }[] }) {
  // MORE THAN THREE IS NOT AN ERROR. It used to be — the star let a group pick a fourth
  // and this said "1 too many" in coral. Now the only way past three is a dead heat on
  // both axes, which is the scores being honest rather than the group being sloppy.
  const tied = rows.length > MAX_PRIORITIES;
  return (
    <div className="mt-4 border-t border-[var(--hairline)] pt-3">
      <p className="m-0 flex flex-wrap items-baseline gap-2">
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.12em]">
          Your priorities
        </span>
        <span className="text-[12px] font-bold tabular-nums">{rows.length}</span>
        {tied && (
          <span className="text-[11px] italic text-muted">
            {rows.length} because the scores tie
          </span>
        )}
      </p>
      {rows.length === 0 ? (
        <p className="m-0 mt-1.5 text-[12px] italic text-muted">
          Score the walls and the {MAX_PRIORITIES} highest land here.
        </p>
      ) : (
        <ol className="m-0 mt-2 list-none p-0">
          {rows.map(({ card, kind }) => (
            <li
              key={card.id}
              className="border-b border-[var(--hairline)] py-1.5 text-[12.5px] leading-[1.4] last:border-b-0"
            >
              <span
                className="mr-1.5"
                style={{ color: kind === "risk" ? "var(--coral)" : "#3f5209" }}
              >
                ★
              </span>
              {card.text}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function MatrixBoard({
  week3Cards,
  board,
  pickFor,
  scoresFor,
  editable,
  busy,
  onScore,
  onClear,
  onToggleDisputed,
  onNote,
}: {
  week3Cards: RippleCard[];
  // The Week 4 board itself, for the priorities panel: which picks carry a star, which
  // carry a dispute, and the note on each. The matrix above needs none of it.
  board: CommitmentsBoard;
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
  onToggleDisputed: (card: RippleCard, on: boolean) => void;
  onNote: (card: RippleCard, note: string) => void;
}) {
  const [hovered, setHovered] = useState<string | null>(null);

  // Session 3's own index, so the stakes sit under exactly the themes Session 3 put them on.
  const w3 = useMemo(() => indexSynthesisBoard(week3Cards), [week3Cards]);
  const groupsOf = (map: Map<string, RippleCard[]>) =>
    w3.themes
      .map((t) => ({
        id: t.id,
        label: isUnnamedTheme(t) ? themeLabel(w3, t) : t.text,
        cards: map.get(t.id) ?? [],
      }))
      .filter((g) => g.cards.length > 0);

  // Which source each pick stands for, so a chip on the matrix can be coloured by whether
  // it came from a risk or an opportunity.
  const kindBySourceId = useMemo(() => {
    const m = new Map<string, Kind>();
    for (const arr of w3.risks.values()) for (const c of arr) m.set(c.id, "risk");
    for (const arr of w3.opportunities.values()) for (const c of arr) m.set(c.id, "opportunity");
    return m;
  }, [w3]);

  // ONLY the picks go to the matrix. Every scoring selector filters by isTreeRoot, and the
  // response cards from step 3 are roots on this board too, so handing it the whole board
  // would plot responses alongside the stakes.
  const placedPicks = useMemo(() => {
    const out: RippleCard[] = [];
    for (const sourceId of kindBySourceId.keys()) {
      const pick = pickFor(sourceId);
      if (pick) out.push(pick);
    }
    return out;
  }, [kindBySourceId, pickFor]);

  const kindOfPick = (pick: RippleCard) =>
    pick.sourceCardId ? kindBySourceId.get(pick.sourceCardId) : undefined;

  // The whole step's progress, both kinds together, counted the way the matrix counts: a
  // card is done when BOTH scales are set, because that is when it plots. A half-scored
  // card deliberately reads as not done.
  const { scored, total } = useMemo(() => {
    let scored = 0;
    for (const sourceId of kindBySourceId.keys()) {
      const s = scoresFor(sourceId);
      if (s.plausibility !== null && s.impact !== null) scored += 1;
    }
    return { scored, total: kindBySourceId.size };
  }, [kindBySourceId, scoresFor]);

  // The starred cards, strongest first. Read off the Session 3 rows rather than off the
  // picks so the panel shows the card's CURRENT words: a facilitator who fixes a typo on
  // Session 3 should not leave the handoff quoting the old wording through a pick that
  // copied it.
  const chosen = useMemo(() => {
    const live = new Map<string, { card: RippleCard; kind: Kind }>();
    for (const arr of w3.risks.values())
      for (const c of arr) live.set(c.id, { card: c, kind: "risk" });
    for (const arr of w3.opportunities.values())
      for (const c of arr) live.set(c.id, { card: c, kind: "opportunity" });
    // ORDERED BY `priorities`, not re-sorted here. Two sorts of the same list is two
    // places for the tiebreak to be written, and they would disagree the first time one
    // of them changed — this panel used to rank on the product alone while the rail used
    // the product then impact.
    return priorities(board).flatMap((p) => {
      const row = p.sourceCardId ? live.get(p.sourceCardId) : undefined;
      return row ? [row] : [];
    });
  }, [w3, board]);

  const panel = (kind: Kind) => (
    <Panel
      kind={kind}
      groups={groupsOf(kind === "risk" ? w3.risks : w3.opportunities)}
      pickFor={pickFor}
      scoresFor={scoresFor}
      editable={editable}
      busy={busy}
      isPriorityRow={(id) => isPriority(board, id)}
      isFlagged={(id) => isDisputed(board, id)}
      noteFor={(id) => board.picks.get(id)?.description ?? ""}
      hoveredId={hovered}
      onHover={setHovered}
      onScore={onScore}
      onClear={onClear}
      onToggleDisputed={onToggleDisputed}
      onNote={onNote}
    />
  );

  return (
    <div className="flex flex-col gap-5">
      {/* THE QUESTIONS AT THE TOP, OPEN, in the same block every other step uses for what
          it is for. They are what the breakout is talking about while it scores, so they
          belong where the eye starts rather than folded away under the board. The
          Directions panel below still carries how the tool works. */}
      <StepIntro n="02" title="Prioritize risks and opportunities">
        {MATRIX_PROMPTS.map((q) => (
          <p key={q} className="m-0">
            {q}
          </p>
        ))}
        {/* The one sentence that makes the two scales mean something. Without it a group
            scores both axes the same way and the grid collapses onto its diagonal. */}
        <p className="m-0">
          Score each one twice: <b>impact</b> is how much would change if it landed,{" "}
          <b>plausibility</b> is how well the conditions of this scenario support it.
        </p>
      </StepIntro>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="flex min-w-0 flex-col gap-4">
          {panel("risk")}
          {panel("opportunity")}
        </div>

        <div className="lg:sticky lg:top-4 lg:self-start">
          <div className="rounded-[4px] border border-ink bg-card p-4">
            <ImpactMatrix
              cards={placedPicks}
              hoveredId={hovered}
              onHover={setHovered}
              noun="risk or opportunity"
              chipClassFor={(c) => {
                const k = kindOfPick(c);
                if (!k) return null;
                return k === "risk"
                  ? "border-coral bg-coral text-white hover:bg-coral/80"
                  : "border-[var(--lime-deep)] bg-lime text-ink hover:bg-lime/80";
              }}
            />
            <p className="m-0 mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-full bg-coral" aria-hidden />
                Risk
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-full bg-lime" aria-hidden />
                Opportunity
              </span>
            </p>

            {/* Under the matrix, because this counts the thing the matrix draws. The two
                panel headers above count each kind against the floor; this is the step. */}
            <div className="mt-4 border-t border-[var(--hairline)] pt-3">
              <StepProgress
                done={scored}
                total={total}
                noun="scored"
                hint={scored === 0 ? undefined : "both scales set"}
              />
            </div>

            <ChosenThree rows={chosen} />
          </div>
        </div>
      </div>

      <Directions
        title="Weighing, then choosing"
        lines={MATRIX_DIRECTIONS}
        fold={matrixDirections}
      />
    </div>
  );
}
