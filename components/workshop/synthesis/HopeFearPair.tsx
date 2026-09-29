"use client";

import { useState } from "react";
import { childOrderOf, type RippleCard } from "@/lib/ripples-types";
import { flipOf, isHopeFear, type HopeFear, type SynthesisBoard } from "@/lib/synthesis-shape";
import { AddCardForm } from "@/components/workshop/synthesis/SynthesisCard";
import { HopeFearFocus } from "@/components/workshop/synthesis/HopeFearFocus";

// A hope and its fear, side by side — the pair, not a card plus a button.
//
// The step's claim is that a hope and the fear on its other side are one piece of
// thinking. A "flip it" action said that too, but only after you pressed it; showing the
// pair says it while you write. An unwritten other side is a face-down card, so the gap is
// visible as a thing to fill rather than absent from the page.
//
// The right-hand card is a face, not a second form. Clicking it makes it the card being
// filled in, and its own other side appears beside it — so a chain is walked one pair at a
// time instead of drawn all at once.

const FACE: Record<HopeFear, { chip: string; tint: string; mark: string; ask: string }> = {
  hope: {
    chip: "bg-lime text-ink",
    tint: "bg-lime/25",
    mark: "☀",
    ask: "What's the hope on the other side of this?",
  },
  fear: {
    chip: "bg-coral text-white",
    tint: "bg-coral/15",
    mark: "☂",
    ask: "What's the fear on the other side of this?",
  },
};

export function HopeFearPair({
  card,
  board,
  editable,
  busy,
  onFocus,
  onEdit,
  onDescribe,
  onAddAssumption,
  onFlip,
  onDelete,
}: {
  card: RippleCard;
  board: SynthesisBoard;
  editable: boolean;
  busy: boolean;
  onFocus: (id: string) => void;
  onEdit: (card: RippleCard, text: string) => void;
  onDescribe: (card: RippleCard, description: string) => void;
  onAddAssumption: (parent: RippleCard, text: string) => void;
  onFlip: (parent: RippleCard, kind: HopeFear, text: string) => void;
  onDelete: (card: RippleCard) => void;
}) {
  const [writing, setWriting] = useState(false);

  const kind = card.cardKind as HopeFear;
  const other = flipOf(kind);
  const otherFace = FACE[other];
  // The other side, if it has been written. Older boards can carry more than one child;
  // the rest stay reachable in the gallery above.
  const opposite =
    (board.chains.get(card.id) ?? []).find((c) => c.cardKind === other && isHopeFear(c.cardKind)) ??
    null;
  const canWrite = editable && Boolean(childOrderOf(card.order));

  return (
    <div className="flex flex-wrap items-start justify-center gap-5">
      <div className="w-full max-w-[34rem] flex-1 basis-[30rem]">
        <HopeFearFocus
          card={card}
          board={board}
          editable={editable}
          busy={busy}
          onEdit={onEdit}
          onDescribe={onDescribe}
          onAddAssumption={onAddAssumption}
          onDelete={onDelete}
        />
      </div>

      <div className="w-full max-w-[21rem] flex-1 basis-[17rem]">
        <div className="mb-1.5 text-center text-[10px] font-bold uppercase tracking-[0.1em] text-muted">
          The other side
        </div>

        {opposite ? (
          <button
            onClick={() => onFocus(opposite.id)}
            className={
              "flex min-h-[15rem] w-full flex-col gap-2 rounded-[10px] border-2 border-ink p-4 text-left shadow-[3px_5px_0_rgba(36,36,34,0.16)] transition-all hover:-translate-y-1 hover:shadow-[4px_7px_0_rgba(36,36,34,0.20)] " +
              otherFace.tint
            }
          >
            <div className="flex items-center justify-between">
              <span
                className={
                  "rounded-[2px] px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.08em] " +
                  otherFace.chip
                }
              >
                {other}
              </span>
              <span aria-hidden className="text-[16px] leading-none opacity-35">
                {otherFace.mark}
              </span>
            </div>
            <div className="text-[14px] font-bold leading-[1.35]">{opposite.text}</div>
            <div className="mt-auto flex flex-col gap-1">
              <span
                className={
                  "text-[9.5px] font-bold uppercase tracking-[0.06em] " +
                  (opposite.description ? "text-muted" : "text-coral")
                }
              >
                {opposite.description ? "✓ Why it matters" : "Needs a why"}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-[0.05em] text-blue">
                Open this one →
              </span>
            </div>
          </button>
        ) : writing ? (
          <div
            className={
              "min-h-[15rem] w-full rounded-[10px] border-2 border-ink p-4 " + otherFace.tint
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
          // Face down. A gap you can see is a gap you might fill; an absent card is just
          // an absence.
          <button
            onClick={() => canWrite && setWriting(true)}
            disabled={!canWrite}
            className={
              "flex min-h-[15rem] w-full flex-col items-center justify-center gap-3 rounded-[10px] border-2 border-dashed border-black/30 p-4 text-center transition-all " +
              (canWrite ? "hover:-translate-y-1 hover:border-ink hover:bg-paper/60" : "opacity-60")
            }
            style={{
              // A card back: a quiet diagonal weave, so it reads face-down rather than empty.
              backgroundImage:
                "repeating-linear-gradient(45deg, rgba(36,36,34,0.05) 0 6px, transparent 6px 12px)",
            }}
          >
            <span aria-hidden className="text-[30px] leading-none opacity-25">
              {otherFace.mark}
            </span>
            <span className="text-[12px] font-extrabold uppercase tracking-[0.06em] text-muted">
              {canWrite ? `＋ Write the ${other}` : `No ${other} yet`}
            </span>
            <span className="max-w-[22ch] text-[11px] italic leading-[1.4] text-muted">
              {otherFace.ask}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
