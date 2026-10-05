"use client";

import { useState } from "react";
import { childOrderOf, type RippleCard } from "@/lib/ripples-types";
import { flipOf, oppositeOf, type HopeFear, type SynthesisBoard } from "@/lib/synthesis-shape";
import { AddCardForm } from "@/components/workshop/synthesis/SynthesisCard";
import { HopeFearFocus } from "@/components/workshop/synthesis/HopeFearFocus";

// A hope and its fear, side by side — the pair, not a card plus a button.
//
// The step's claim is that a hope and the fear on its other side are one piece of
// thinking. A "flip it" action said that too, but only after you pressed it; showing the
// pair says it while you write. An unwritten other side is a face-down card, so the gap is
// visible as a thing to fill rather than absent from the page.
//
// Both sides are the same component and both are live. The right-hand card used to be a
// summary you clicked to open, which let it report that it still needed a "why" and then
// stand between you and writing one. Nothing about a pair says one half is editable and
// the other is a preview.
//
// That pivot was also how a longer chain was walked one pair at a time. The gallery above
// lists every hope and fear on the theme, so selecting there reaches a third card just as
// well, and it does not cost the common case a click.

const FACE: Record<
  HopeFear,
  { chip: string; tint: string; backFill: string; backEdge: string; mark: string; ask: string }
> = {
  hope: {
    chip: "bg-lime text-ink",
    tint: "bg-lime/25",
    backFill: "rgba(196, 255, 103, 0.22)",
    backEdge: "border-[var(--lime-deep)]/70",
    mark: "☀",
    ask: "Same facts, said as a hope — We hope … because …",
  },
  fear: {
    chip: "bg-coral text-white",
    tint: "bg-coral/20",
    backFill: "rgba(255, 100, 78, 0.16)",
    backEdge: "border-coral/60",
    mark: "☂",
    ask: "Same facts, said as a fear — We fear … because …",
  },
};

export function HopeFearPair({
  card,
  board,
  editable,
  busy,
  onEdit,
  onDescribe,
  onConcern,
  onFlip,
  onRequestDelete,
  plain = false,
}: {
  card: RippleCard;
  board: SynthesisBoard;
  editable: boolean;
  busy: boolean;
  onEdit: (card: RippleCard, text: string) => void;
  onDescribe?: (card: RippleCard, description: string) => void;
  onConcern?: (card: RippleCard, text: string) => void;
  onFlip: (parent: RippleCard, kind: HopeFear, text: string) => void;
  // Deleting asks first: a card takes whatever was flipped from it along.
  onRequestDelete: (card: RippleCard) => void;
  // Both faces show just their text — see HopeFearFocus.
  plain?: boolean;
}) {
  const [writing, setWriting] = useState(false);

  const kind = card.cardKind as HopeFear;
  const other = flipOf(kind);
  const otherFace = FACE[other];
  // The other side, if it has been written — looked up in both directions, because the
  // flip is stored downwards while the pair itself has no direction. See oppositeOf.
  const opposite = oppositeOf(board, card);
  const canWrite = editable && Boolean(childOrderOf(card.order));

  return (
    // Two cards of the same size, because they are the same kind of thing. The divider
    // between them carries the instruction, so the pairing is stated where the pairing
    // happens rather than on a button somewhere.
    <div className="flex flex-col items-stretch gap-4 lg:flex-row lg:gap-0">
      <div className={"flex min-w-0 flex-1 basis-0 " + (plain ? "min-h-[14rem]" : "min-h-[26rem]")}>
        <HopeFearFocus
          card={card}
          board={board}
          editable={editable}
          busy={busy}
          onEdit={onEdit}
          onDescribe={onDescribe}
          onConcern={onConcern}
          onRequestDelete={onRequestDelete}
          plain={plain}
        />
      </div>

      {/* The seam. Vertical when the pair sits side by side, horizontal once it stacks. */}
      <div className="relative flex shrink-0 items-center justify-center lg:w-[9.5rem]">
        <span
          aria-hidden
          className="absolute border-black/20 max-lg:left-0 max-lg:right-0 max-lg:top-1/2 max-lg:border-t-2 max-lg:border-dashed lg:bottom-3 lg:top-3 lg:border-l-2 lg:border-dashed"
        />
        {/* An instruction while the other side is still blank, a statement once it is
            written — the seam should not keep asking for a card that is already there,
            least of all when the card on the right is the one this was flipped from. */}
        <span className="relative z-10 max-w-[8rem] bg-paper px-2 py-1 text-center text-[10px] font-bold uppercase leading-[1.3] tracking-[0.06em] text-muted">
          {opposite ? "Two sides of one thing" : `Flip your ${kind} into a ${other}`}
        </span>
      </div>

      <div className={"flex min-w-0 flex-1 basis-0 " + (plain ? "min-h-[14rem]" : "min-h-[26rem]")}>
        {opposite ? (
          // The same card as the one on the left, and live. It used to be a summary you
          // had to open first, which meant a card could tell you it was missing its "why"
          // and then make you click before you could write one.
          <HopeFearFocus
            key={opposite.id}
            card={opposite}
            board={board}
            editable={editable}
            busy={busy}
            onEdit={onEdit}
            onDescribe={onDescribe}
            onConcern={onConcern}
            onRequestDelete={onRequestDelete}
            plain={plain}
          />
        ) : writing ? (
          <div
            className={
              "flex w-full flex-col justify-center rounded-[10px] border-2 border-ink p-5 " +
              otherFace.tint
            }
          >
            <AddCardForm
              label={otherFace.ask}
              busy={busy}
              autoFocus
              onAdd={(text) => {
                onFlip(card, other, text);
                setWriting(false);
              }}
              onDone={() => setWriting(false)}
            />
          </div>
        ) : (
          // Face down, but in ITS OWN colour — a fear waiting to be written should look
          // like a fear, not like a blank. A gap you can see is a gap you might fill.
          <button
            onClick={() => canWrite && setWriting(true)}
            disabled={!canWrite}
            className={
              "flex w-full flex-col items-center justify-center gap-3 rounded-[10px] border-2 border-dashed p-5 text-center transition-all " +
              otherFace.backEdge +
              (canWrite ? " hover:-translate-y-1 hover:border-ink" : " opacity-60")
            }
            style={{
              backgroundColor: otherFace.backFill,
              // A card back: a quiet diagonal weave over the card's own colour.
              backgroundImage:
                "repeating-linear-gradient(45deg, rgba(36,36,34,0.06) 0 6px, transparent 6px 12px)",
            }}
          >
            <span aria-hidden className="text-[34px] leading-none opacity-30">
              {otherFace.mark}
            </span>
            <span className="text-[13px] font-extrabold uppercase tracking-[0.06em] text-ink/70">
              {canWrite ? `＋ Write the ${other}` : `No ${other} yet`}
            </span>
            <span className="max-w-[24ch] text-[11.5px] italic leading-[1.4] text-muted">
              {otherFace.ask}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
