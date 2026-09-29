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

const FACE: Record<HopeFear, { chip: string; tint: string; rule: string; mark: string; flip: string }> = {
  hope: {
    chip: "bg-lime text-ink",
    tint: "bg-lime/20",
    rule: "border-[var(--lime-deep)]",
    mark: "☀",
    flip: "What's the fear on the other side of this?",
  },
  fear: {
    chip: "bg-coral text-white",
    tint: "bg-coral/12",
    rule: "border-coral",
    mark: "☂",
    flip: "What's the hope on the other side of this?",
  },
};

// A labelled area of the card, the way a form on a physical card is laid out.
function Field({
  label,
  children,
  rule,
}: {
  label: string;
  children: React.ReactNode;
  rule: string;
}) {
  return (
    <div className={"border-t-2 border-dashed px-6 py-4 " + rule}>
      <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">{label}</div>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

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
    // An oversized playing card: the group is filling one in, so it should look like one
    // rather than like a settings panel. Centred and bounded so the writing areas stay a
    // comfortable line length however wide the window is.
    <div
      className={
        "relative mx-auto w-full max-w-[42rem] overflow-hidden rounded-[10px] border-2 border-ink shadow-[4px_6px_0_rgba(36,36,34,0.18)] " +
        face.tint
      }
    >
      {/* Corner pips, the second one rotated, the way a court card reads either way up. */}
      <span aria-hidden className="pointer-events-none absolute left-4 top-3 text-[20px] leading-none opacity-30">
        {face.mark}
      </span>
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-3 right-4 rotate-180 text-[20px] leading-none opacity-30"
      >
        {face.mark}
      </span>

      <div className="px-6 pb-5 pt-5">
        <div className="flex items-start gap-3 pl-8">
          <span
            className={
              "shrink-0 rounded-[2px] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] " +
              face.chip
            }
          >
            {kind}
          </span>
          {editable && (
            <div className="ml-auto">
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
            </div>
          )}
        </div>

        <div className="mt-2.5 pl-8 pr-2 text-[20px] font-extrabold leading-[1.25]">
          <InlineText text={card.text} editable={editable} busy={busy} onSave={(t) => onEdit(card, t)} />
        </div>
      </div>

      {/* Why it matters. The step's whole point: step 2 said what could happen, this says
          what it touches in us. Given real room, because it is a sentence not a label. */}
      <Field label="Why does this matter to us?" rule={face.rule}>
        <div className="text-[14px] leading-[1.55]">
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
      </Field>

      {/* What we're treating as true. Their own cards, because the group is meant to be
          able to list and challenge them later, not dig them out of prose. */}
      <Field label="What are we assuming?" rule={face.rule}>
        {assumptions.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {assumptions.map((a) => (
              <li key={a.id} className="group flex items-start gap-2 text-[13.5px] leading-[1.45]">
                <span aria-hidden className="mt-[2px] shrink-0 text-black/35">
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
            <div className={assumptions.length > 0 ? "mt-2" : ""}>
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
              className={
                "text-[10.5px] font-bold uppercase tracking-[0.05em] text-blue hover:underline " +
                (assumptions.length > 0 ? "mt-2" : "")
              }
            >
              ＋ An assumption
            </button>
          ))}
      </Field>

      {/* The flip. A new card, hanging off this one so the pair is recorded. */}
      {canExtend && (
        <Field label="The other side" rule={face.rule}>
          {flipping ? (
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
          ) : (
            <button
              onClick={() => setFlipping(true)}
              className="rounded-[2px] border border-ink bg-paper px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.06em] hover:bg-lime"
            >
              ↩ Flip it — write the {flipOf(kind)}
            </button>
          )}
        </Field>
      )}
    </div>
  );
}
