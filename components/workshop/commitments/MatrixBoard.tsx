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

// The activity's discussion prompts live HERE, as guidance, rather than as worksheet
// prompts with answer boxes. The group's answer to "which have the greatest consequences"
// is the three it stars, not a paragraph it types — see the header in lib/exercise-types.
const MATRIX_DIRECTIONS = [
  "Which risks and opportunities have the greatest consequences? That is impact.",
  "How well are they supported by the conditions of our scenario? That is plausibility.",
  `Score at least ${PLACED_FLOOR_PER_KIND} of each. Keep going past that for any others that matter.`,
  "A card reaches the matrix once both scales are set. Skip any card your group has no view on.",
  `Then name ${MAX_PRIORITIES} priorities across BOTH walls — not ${MAX_PRIORITIES} of each.`,
  "Is there anything you cannot afford to overlook, even if you disagree about its plausibility? Star it and say so.",
  "Score as a group with one person recording. Two people scoring the same card will overwrite each other.",
];

type Kind = "risk" | "opportunity";

function Panel({
  kind,
  groups,
  pickFor,
  scoresFor,
  editable,
  hoveredId,
  onHover,
  onScore,
  onClear,
}: {
  kind: Kind;
  groups: { id: string; label: string; cards: RippleCard[] }[];
  pickFor: (sourceId: string) => RippleCard | undefined;
  // The scores to SHOW for a Session 3 card, which is not always what is on a pick: the
  // first click on an untouched card has to paint before the pick it will live on exists.
  scoresFor: (sourceId: string) => { plausibility: Score | null; impact: Score | null };
  editable: boolean;
  hoveredId: string | null;
  onHover: (id: string | null) => void;
  onScore: (card: RippleCard, patch: ScorePatchInput) => void;
  onClear: (card: RippleCard) => void;
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
                        {c.text}
                      </span>
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

// ACT 2'S ACTUAL OUTPUT. The matrix above weighs the walls; this is the group saying
// which three it wants carried forward, and it is the only part of the step that reaches
// the handoff's opening slide.
//
// THREE ACROSS BOTH WALLS, not three of each. A group whose scenario is all downside
// should be able to send three risks, and the earlier per-wall cap made that impossible.
//
// THE CAP IS HELD HERE, NOT BY THE DATABASE, the same call every other cap on this week
// makes: counting server-side would be a read-then-write race on a board several people
// work at once. At the cap the unstarred rows go genuinely disabled rather than silently
// doing nothing, and an over-pick (two people clicking at once) is reported rather than
// hidden.
function Priorities({
  rows,
  board,
  editable,
  busy,
  onTogglePriority,
  onToggleDisputed,
  onNote,
}: {
  rows: { card: RippleCard; kind: Kind }[];
  board: CommitmentsBoard;
  editable: boolean;
  busy: boolean;
  onTogglePriority: (card: RippleCard, on: boolean) => void;
  onToggleDisputed: (card: RippleCard, on: boolean) => void;
  onNote: (card: RippleCard, note: string) => void;
}) {
  const chosen = priorities(board).length;
  const atCap = chosen >= MAX_PRIORITIES;
  const over = chosen > MAX_PRIORITIES;

  if (rows.length === 0) {
    return (
      <section className="rounded-[4px] border-2 border-ink px-4 py-3">
        <h3 className="m-0 text-[14px] font-bold">Your three priorities</h3>
        <p className="m-0 mt-2 text-[13px] italic text-muted">
          Session 3 recorded no risks or opportunities to choose from.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-[4px] border-2 border-ink">
      <div className="flex flex-wrap items-baseline gap-2 border-b border-ink px-4 py-3">
        <h3 className="m-0 text-[14px] font-bold">Your three priorities</h3>
        <span className="text-[12px] font-bold tabular-nums">
          {chosen} of {MAX_PRIORITIES} starred
        </span>
        <span className="text-[11px] italic text-muted">
          {over
            ? `${chosen - MAX_PRIORITIES} more than ${MAX_PRIORITIES}`
            : atCap
              ? "Un-star one to swap it"
              : "Across both walls, not three of each"}
        </span>
      </div>
      <ul className="m-0 flex list-none flex-col p-0">
        {rows.map(({ card, kind }) => {
          const on = isPriority(board, card.id);
          const flagged = isDisputed(board, card.id);
          // At the cap the unstarred go genuinely disabled rather than silently doing
          // nothing — the same rule act 6 uses for its three directions.
          const locked = !on && atCap;
          const t = TONE[kind];
          return (
            <li key={card.id} className="border-b border-[var(--hairline)] last:border-b-0">
              <div className="flex items-start gap-2 px-4 py-2">
                <input
                  type="checkbox"
                  checked={on}
                  disabled={!editable || busy || locked}
                  onChange={() => onTogglePriority(card, !on)}
                  aria-label={`Make a priority: ${card.text}`}
                  className="mt-[3px] h-4 w-4 shrink-0 accent-[var(--amber)]"
                />
                <span className="min-w-0 flex-1">
                  <span
                    className={
                      "block text-[13px] leading-[1.45] " +
                      (on ? "font-bold" : locked ? "opacity-45" : "")
                    }
                  >
                    {on && <span className="mr-1 text-amber">★</span>}
                    {card.text}
                  </span>
                  <span
                    className={
                      "mt-0.5 inline-block rounded-[2px] px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.08em] " +
                      t.chip
                    }
                  >
                    {kind === "risk" ? "Risk" : "Opportunity"}
                  </span>
                </span>
                {/* Only offered on a starred row. "Note any consequential issue where
                    disagreement remains" is a thing you say ABOUT a priority, and offering
                    it on all forty rows would read as a second, competing selection. */}
                {on && (
                  <label className="flex shrink-0 cursor-pointer items-center gap-1.5 pt-[2px] text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
                    <input
                      type="checkbox"
                      checked={flagged}
                      disabled={!editable || busy}
                      onChange={() => onToggleDisputed(card, !flagged)}
                      className="h-3.5 w-3.5 accent-[var(--blue)]"
                    />
                    Disputed
                  </label>
                )}
              </div>
              {/* The note is written on its own and SURVIVES the flag being cleared, so a
                  group that un-flags and re-flags gets its words back. */}
              {on && flagged && (
                <div className="px-4 pb-3 pl-10">
                  <textarea
                    defaultValue={board.picks.get(card.id)?.description ?? ""}
                    disabled={!editable || busy}
                    onBlur={(e) => onNote(card, e.target.value)}
                    rows={2}
                    placeholder="What does the room disagree about here?"
                    className="w-full rounded-[3px] border border-[var(--rule)] bg-paper px-2 py-1.5 text-[12.5px] leading-[1.45]"
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
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
  onTogglePriority,
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
  onTogglePriority: (card: RippleCard, on: boolean) => void;
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

  // Every stake, ordered by what the matrix just said about it. Scored rows first and
  // strongest first, so the list the group chooses from opens where its own weighing
  // ended rather than in board order.
  const choosable = useMemo(() => {
    const rows: { card: RippleCard; kind: Kind }[] = [];
    for (const arr of w3.risks.values()) for (const c of arr) rows.push({ card: c, kind: "risk" });
    for (const arr of w3.opportunities.values())
      for (const c of arr) rows.push({ card: c, kind: "opportunity" });
    const rank = (id: string) => {
      const sc = scoresFor(id);
      return sc.plausibility !== null && sc.impact !== null ? sc.plausibility * sc.impact : -1;
    };
    return rows.sort((a, b) => rank(b.card.id) - rank(a.card.id));
  }, [w3, scoresFor]);

  const panel = (kind: Kind) => (
    <Panel
      kind={kind}
      groups={groupsOf(kind === "risk" ? w3.risks : w3.opportunities)}
      pickFor={pickFor}
      scoresFor={scoresFor}
      editable={editable}
      hoveredId={hovered}
      onHover={setHovered}
      onScore={onScore}
      onClear={onClear}
    />
  );

  return (
    <div className="flex flex-col gap-5">
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
          </div>
        </div>
      </div>

      {/* UNDER THE MATRIX, NOT BESIDE IT. Choosing comes after weighing, and the list is
          ordered by what the weighing said — so the step reads top to bottom as the
          activity runs rather than asking the group to do both at once. */}
      <Priorities
        rows={choosable}
        board={board}
        editable={editable}
        busy={busy}
        onTogglePriority={onTogglePriority}
        onToggleDisputed={onToggleDisputed}
        onNote={onNote}
      />

      <Directions
        title="Weighing, then choosing"
        lines={MATRIX_DIRECTIONS}
        fold={matrixDirections}
      />
    </div>
  );
}
