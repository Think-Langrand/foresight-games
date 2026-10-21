"use client";

import { useMemo, useState } from "react";
import type { RippleCard } from "@/lib/ripples-types";
import type { ScorePatchInput } from "@/lib/ripples-scoring";
import { AXIS_ENDS, SCORE_AXES, cardScores, isScored } from "@/lib/ripples-scoring";
import { PLACED_FLOOR_PER_KIND } from "@/lib/commitments-shape";
import { indexSynthesisBoard, isUnnamedTheme, themeLabel } from "@/lib/synthesis-shape";
import { ImpactMatrix } from "@/components/workshop/ImpactMatrix";
import { ScoreScale } from "@/components/workshop/ScoreScale";
import { TONE } from "@/components/workshop/synthesis/CardWall";
import { Directions, DIRECTIONS_FOLD } from "@/components/workshop/synthesis/Directions";
import { makePrefStore } from "@/components/workshop/synthesis/prefStore";

// STEP 2 — what is at stake, placed. Session 3 named the risks and opportunities; this step
// asks which of them matter and how, on the same impact x plausibility matrix Week 2 used
// for its key changes.
//
// WHY A PICK AND NOT THE RISK ITSELF. Session 3's risks cannot be scored where they live:
// the score route refuses anything that is not a tree ROOT, resolves the card by the URL's
// session code, and needs a player identity on that same board. A Week 3 per-theme risk
// fails all three, and a locked Week 3 board refuses every write anyway. A `pick` is a Week
// 4 card pointing at that risk and carrying its words, and because it IS a root on this
// board, the existing score route, `matrixCells` and `ImpactMatrix` all take it unchanged.
// So "place it" means "mint the pick", and the two score rows then write to the pick.
//
// A FLOOR, NOT A CAP. See PLACED_FLOOR_PER_KIND. The group chooses which to place, which is
// the judgement the step is for; it is not asked to place all 44 of them.

const matrixDirections = makePrefStore(
  "commitments.directions.matrix",
  "open",
  DIRECTIONS_FOLD
);

const MATRIX_DIRECTIONS = [
  `Place at least ${PLACED_FLOOR_PER_KIND} risks and ${PLACED_FLOOR_PER_KIND} opportunities. Place more if they matter; there is no ceiling.`,
  "Plausibility is not the same as nearness. Ask whether this is already happening, or whether it needs several other things to happen first.",
  "Impact is how much changes if it lands, not how much you dislike it.",
  "Score as a group, with one person recording. Two people scoring the same card race each other.",
];

type Kind = "risk" | "opportunity";

function Panel({
  kind,
  groups,
  pickFor,
  editable,
  busy,
  hoveredId,
  onHover,
  onPlace,
  onRemove,
  onScore,
}: {
  kind: Kind;
  groups: { id: string; label: string; cards: RippleCard[] }[];
  pickFor: (sourceId: string) => RippleCard | undefined;
  editable: boolean;
  busy: boolean;
  hoveredId: string | null;
  onHover: (id: string | null) => void;
  onPlace: (card: RippleCard) => void;
  onRemove: (card: RippleCard) => void;
  onScore: (pickId: string, patch: ScorePatchInput) => void;
}) {
  const t = TONE[kind];
  const all = groups.flatMap((g) => g.cards);
  const placed = all.filter((c) => pickFor(c.id)).length;
  const met = placed >= PLACED_FLOOR_PER_KIND;
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
          {placed} of {PLACED_FLOOR_PER_KIND} placed
        </span>
        <span className="text-[11px] italic text-muted">
          {met ? `place more if they matter · ${all.length} in all` : `${all.length} to choose from`}
        </span>
      </div>

      {groups.map((g) => {
        const none = g.cards.every((c) => !pickFor(c.id));
        return (
          <div key={g.id} className="px-4 py-2">
            <h4 className="flex flex-wrap items-baseline gap-2 text-[10px] font-bold uppercase leading-[1.3] tracking-[0.08em] text-muted">
              {g.label}
              {/* Named rather than left implicit: with a floor it is easy to place five
                  from one theme and leave another untouched, and the gap is the finding. */}
              {none && (
                <span className="font-normal normal-case tracking-normal text-coral">
                  nothing placed from this theme
                </span>
              )}
            </h4>
            <ul className="m-0 mt-1 flex list-none flex-col p-0">
              {g.cards.map((c) => {
                const pick = pickFor(c.id);
                const scores = pick ? cardScores(pick) : { plausibility: null, impact: null };
                return (
                  <li
                    key={c.id}
                    onMouseEnter={() => pick && onHover(pick.id)}
                    onMouseLeave={() => onHover(null)}
                    className={
                      "rounded-[3px] px-1 py-1.5 transition-colors " +
                      (pick ? "bg-paper/80" : "") +
                      (pick && hoveredId === pick.id ? " ring-1 ring-ink/30" : "")
                    }
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className={
                          "min-w-0 flex-1 text-[13px] leading-[1.45] " + (pick ? "font-bold" : "")
                        }
                      >
                        {c.text}
                      </span>
                      {editable &&
                        (pick ? (
                          <button
                            type="button"
                            onClick={() => onRemove(c)}
                            className="shrink-0 text-[11px] text-muted underline hover:text-coral"
                          >
                            Remove
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onPlace(c)}
                            className="shrink-0 rounded-[3px] border border-ink px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.06em] transition hover:bg-ink hover:text-paper"
                          >
                            Place
                          </button>
                        ))}
                    </div>

                    {/* The scales appear only once it is on the matrix, so the list reads as
                        a list until the group commits to scoring something. */}
                    {pick && (
                      <div className="mt-2 flex flex-col gap-1.5">
                        {SCORE_AXES.map((axis) => (
                          <ScoreScale
                            key={axis}
                            axis={axis}
                            value={scores[axis]}
                            disabled={!editable || busy}
                            lowLabel={AXIS_ENDS[axis].low}
                            highLabel={AXIS_ENDS[axis].high}
                            onChange={(v) => onScore(pick.id, { [axis]: v })}
                          />
                        ))}
                        {!isScored(pick) && (
                          <p className="m-0 text-[11px] italic text-muted">
                            Both scores set it on the matrix.
                          </p>
                        )}
                      </div>
                    )}
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

export function MatrixBoard({
  week3Cards,
  pickFor,
  editable,
  busy,
  onPlace,
  onRemove,
  onScore,
}: {
  week3Cards: RippleCard[];
  // The Week 4 pick that places a given Session 3 card, resolved by the view so a write
  // still in flight already counts. Undefined means not placed.
  pickFor: (sourceId: string) => RippleCard | undefined;
  editable: boolean;
  busy: boolean;
  onPlace: (card: RippleCard) => void;
  onRemove: (card: RippleCard) => void;
  onScore: (pickId: string, patch: ScorePatchInput) => void;
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

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Panel
            kind="risk"
            groups={groupsOf(w3.risks)}
            pickFor={pickFor}
            editable={editable}
            busy={busy}
            hoveredId={hovered}
            onHover={setHovered}
            onPlace={onPlace}
            onRemove={onRemove}
            onScore={onScore}
          />
          <Panel
            kind="opportunity"
            groups={groupsOf(w3.opportunities)}
            pickFor={pickFor}
            editable={editable}
            busy={busy}
            hoveredId={hovered}
            onHover={setHovered}
            onPlace={onPlace}
            onRemove={onRemove}
            onScore={onScore}
          />
        </div>

        <div className="lg:sticky lg:top-4 lg:self-start">
          <div className="rounded-[4px] border border-ink bg-card p-4">
            <ImpactMatrix
              cards={placedPicks}
              hoveredId={hovered}
              onHover={setHovered}
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
          </div>
        </div>
      </div>

      <Directions
        title="Placing what is at stake"
        lines={MATRIX_DIRECTIONS}
        fold={matrixDirections}
      />
    </div>
  );
}
