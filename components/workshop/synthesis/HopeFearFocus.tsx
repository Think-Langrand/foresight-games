"use client";

import { useState } from "react";
import { CARD_DESCRIPTION_MAX, childOrderOf, type RippleCard } from "@/lib/ripples-types";
import { flipOf, type HopeFear, type SynthesisBoard } from "@/lib/synthesis-shape";
import {
  AddCardForm,
  CardMenu,
  CardMenuItem,
  InlineText,
} from "@/components/workshop/synthesis/SynthesisCard";

// One hope or fear, with room to do the actual work on it.
//
// The three prompts this step is built around all belong to a single card — what you hope
// or fear, why that matters, and what you are therefore assuming — so they get one place
// with space to write rather than a node in a tree.
//
// Flipping keeps the pair in the data (the new card hangs off this one), which is what
// lets the gallery say "flipped from a hope" without drawing a tree to prove it.

const FACE: Record<HopeFear, { chip: string; edge: string; mark: string; flip: string }> = {
  hope: {
    chip: "bg-lime text-ink",
    edge: "border-l-[var(--lime-deep)]",
    mark: "☀",
    flip: "What's the fear on the other side of this?",
  },
  fear: {
    chip: "bg-coral text-white",
    edge: "border-l-coral",
    mark: "☂",
    flip: "What's the hope on the other side of this?",
  },
};

export function HopeFearFocus({
  card,
  board,
  editable,
  busy,
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
  onEdit: (card: RippleCard, text: string) => void;
  onDescribe: (card: RippleCard, description: string) => void;
  onAddAssumption: (parent: RippleCard, text: string) => void;
  onFlip: (parent: RippleCard, kind: HopeFear, text: string) => void;
  onDelete: (card: RippleCard) => void;
}) {
  const [assuming, setAssuming] = useState(false);
  const [flipping, setFlipping] = useState(false);

  const kind = card.cardKind as HopeFear;
  const face = FACE[kind];
  const assumptions = board.assumptions.get(card.id) ?? [];
  // Both hang off this card, so both stop when the ladder bottoms out.
  const canExtend = editable && Boolean(childOrderOf(card.order));

  return (
    <div className={"rounded-[4px] border-2 border-l-8 border-ink bg-card p-5 " + face.edge}>
      <div className="flex items-start gap-3">
        <span
          className={
            "shrink-0 rounded-[2px] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] " +
            face.chip
          }
        >
          {kind}
        </span>
        <div className="min-w-0 flex-1 text-[17px] font-bold leading-[1.3]">
          <InlineText text={card.text} editable={editable} busy={busy} onSave={(t) => onEdit(card, t)} />
        </div>
        <span aria-hidden className="shrink-0 text-[22px] leading-none opacity-25">
          {face.mark}
        </span>
        {editable && (
          <CardMenu>
            {(close) => (
              <CardMenuItem
                danger
                onClick={() => {
                  close();
                  onDelete(card);
                }}
              >
                Delete
              </CardMenuItem>
            )}
          </CardMenu>
        )}
      </div>

      {/* Why it matters. The step's whole point: step 2 said what could happen, this says
          what it touches in us. Given real room, because it is a sentence not a label. */}
      <div className="mt-4">
        <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted">
          Why does this matter to us?
        </div>
        <div className="mt-1 max-w-[70ch] text-[14px] leading-[1.55]">
          <InlineText
            text={card.description ?? ""}
            editable={editable}
            busy={busy}
            emptyLabel="＋ Write why this matters"
            placeholder="…because ___. This tells us we want to protect or advance ___."
            maxLength={CARD_DESCRIPTION_MAX}
            rows={4}
            onSave={(next) => onDescribe(card, next)}
          />
        </div>
      </div>

      {/* What we're treating as true. Their own cards, because the group is meant to be
          able to list and challenge them later, not dig them out of prose. */}
      <div className="mt-4 border-t border-[var(--hairline)] pt-3">
        <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted">
          What are we assuming?
        </div>
        {assumptions.length > 0 && (
          <ul className="mt-1.5 flex flex-col gap-1.5">
            {assumptions.map((a) => (
              <li key={a.id} className="group flex items-start gap-2 text-[13px] leading-[1.45]">
                <span aria-hidden className="mt-[2px] shrink-0 text-black/30">
                  ◆
                </span>
                <div className="min-w-0 flex-1">
                  <InlineText text={a.text} editable={editable} busy={busy} onSave={(t) => onEdit(a, t)} />
                </div>
                {editable && (
                  <button
                    onClick={() => onDelete(a)}
                    aria-label="Delete assumption"
                    className="shrink-0 text-[11px] font-bold text-muted opacity-0 hover:text-coral group-hover:opacity-100 group-focus-within:opacity-100"
                  >
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {canExtend &&
          (assuming ? (
            <div className="mt-2 max-w-[44rem]">
              <AddCardForm
                label="Does protecting that require keeping our current way of working?"
                busy={busy}
                autoFocus
                onAdd={(text) => onAddAssumption(card, text)}
                onDone={() => setAssuming(false)}
              />
            </div>
          ) : (
            <button
              onClick={() => setAssuming(true)}
              className="mt-1.5 text-[10.5px] font-bold uppercase tracking-[0.05em] text-blue hover:underline"
            >
              ＋ An assumption
            </button>
          ))}
      </div>

      {/* The flip. A new card, hanging off this one so the pair is recorded. */}
      {canExtend && (
        <div className="mt-4 border-t border-[var(--hairline)] pt-3">
          {flipping ? (
            <div className="max-w-[44rem]">
              <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-muted">
                The other side
              </div>
              <AddCardForm
                label={face.flip}
                busy={busy}
                autoFocus
                onAdd={(text) => {
                  onFlip(card, flipOf(kind), text);
                  setFlipping(false);
                }}
                onDone={() => setFlipping(false)}
              />
            </div>
          ) : (
            <button
              onClick={() => setFlipping(true)}
              className="rounded-[2px] border border-ink bg-paper px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.06em] hover:bg-lime"
            >
              ↩ Flip it — write the {flipOf(kind)}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
