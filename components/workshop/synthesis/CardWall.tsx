"use client";

import { useState } from "react";
import type { RippleCard } from "@/lib/ripples-types";
import {
  AddCardForm,
  CardMenu,
  CardMenuItem,
  InlineText,
} from "@/components/workshop/synthesis/SynthesisCard";

// A brainstorm wall: a coloured box you fill with small cards, as fast as you can type
// them. Step 2 puts two side by side on a theme (risks, opportunities); step 3 gives the
// whole board two big ones (hopes, fears). Same wall, four colours.
//
// The add slot is a card-shaped dashed outline that lives permanently in the top-left of
// the grid — where the eye lands first — and turns into the composer when clicked. It
// stays a card rather than a toolbar button because the thing you are about to make IS a
// card, and the composer stays open after each add so a run of ideas goes in one after
// another (see AddCardForm).
//
// The wall never deletes: it asks (onRequestDelete) and the step confirms, because on
// the fears wall a card can take the hope flipped from it along.

export type WallTone = "risk" | "opportunity" | "hope" | "fear";

const TONE: Record<
  WallTone,
  { chip: string; well: string; slot: string; edge: string; mark: string }
> = {
  risk: {
    chip: "bg-coral text-white",
    well: "bg-coral/10",
    slot: "border-coral/50 hover:bg-coral/15",
    edge: "border-coral",
    mark: "▼",
  },
  opportunity: {
    chip: "bg-lime text-ink",
    well: "bg-lime/15",
    slot: "border-[var(--lime-deep)]/60 hover:bg-lime/25",
    edge: "border-[var(--lime-deep)]",
    mark: "▲",
  },
  hope: {
    chip: "bg-lime text-ink",
    well: "bg-lime/15",
    slot: "border-[var(--lime-deep)]/60 hover:bg-lime/25",
    edge: "border-[var(--lime-deep)]",
    mark: "☀",
  },
  fear: {
    chip: "bg-coral text-white",
    well: "bg-coral/10",
    slot: "border-coral/50 hover:bg-coral/15",
    edge: "border-coral",
    mark: "☂",
  },
};

export function CardWall({
  tone,
  title,
  cards,
  editable,
  busy,
  addLabel,
  onAdd,
  onEdit,
  onRequestDelete,
  badgeFor,
  emptyHint,
  tall = false,
  slotQuestion,
  closeAfterAdd = false,
}: {
  tone: WallTone;
  title: string;
  cards: RippleCard[];
  editable: boolean;
  busy: boolean;
  // The composer's placeholder — the sentence to finish ("We hope … because …").
  addLabel: string;
  // The question the slot asks, shown on the add slot and above the open composer, so the
  // placeholder can be the sentence-starter rather than carry the whole prompt.
  slotQuestion?: string;
  onAdd: (text: string) => void;
  onEdit: (card: RippleCard, text: string) => void;
  onRequestDelete: (card: RippleCard) => void;
  // A small line under a card's text, e.g. "↩ flipped from a fear". Null for none.
  badgeFor?: (card: RippleCard) => string | null;
  emptyHint?: string;
  // Step 3's two are the whole page, so they are given room to look like it.
  tall?: boolean;
  // Return to the add slot after each card. The default keeps the composer open for a run
  // of ideas (step 3); step 2's walls are read beside the questions, so a card lands and
  // the slot comes back.
  closeAfterAdd?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const t = TONE[tone];
  const noun = tone;

  return (
    <section
      className={
        "flex flex-col overflow-hidden rounded-[4px] border-2 " +
        t.edge +
        " " +
        t.well +
        (tall ? " min-h-[24rem]" : " min-h-[12rem]")
      }
    >
      <div className="flex flex-wrap items-baseline gap-2 px-4 pt-3">
        <span className={"rounded-[2px] px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.08em] " + t.chip}>
          <span aria-hidden className="mr-1">
            {t.mark}
          </span>
          {title}
        </span>
        <span className="text-[11px] italic text-muted">
          {cards.length === 0 ? (emptyHint ?? "Nothing here yet.") : `${cards.length} card${cards.length === 1 ? "" : "s"}`}
        </span>
      </div>

      <div className="flex flex-wrap content-start gap-2 p-4">
        {editable &&
          (adding ? (
            <div className={"flex w-56 flex-col rounded-[4px] border-2 border-ink bg-paper p-2.5"}>
              {slotQuestion && (
                <div className="mb-1.5 text-[11.5px] font-bold leading-[1.3]">{slotQuestion}</div>
              )}
              <AddCardForm
                label={addLabel}
                busy={busy}
                autoFocus
                onAdd={(text) => {
                  onAdd(text);
                  if (closeAfterAdd) setAdding(false);
                }}
                onDone={() => setAdding(false)}
              />
            </div>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className={
                "flex min-h-[6.5rem] w-56 flex-col items-center justify-center gap-1.5 rounded-[4px] border-2 border-dashed p-3 text-center transition-all hover:-translate-y-0.5 hover:border-ink " +
                t.slot
              }
            >
              <span aria-hidden className="text-[22px] leading-none opacity-40">
                {t.mark}
              </span>
              <span className="text-[11.5px] font-extrabold uppercase tracking-[0.06em] text-muted">
                ＋ Add {noun === "opportunity" ? "an" : "a"} {noun}
              </span>
              {slotQuestion && (
                <span className="max-w-[22ch] text-[11px] italic leading-[1.35] text-muted">{slotQuestion}</span>
              )}
            </button>
          ))}

        {cards.map((card) => {
          const badge = badgeFor?.(card) ?? null;
          return (
            <div
              key={card.id}
              className="flex w-56 flex-col gap-1.5 rounded-[4px] border-2 border-black/20 bg-paper p-2.5 shadow-[2px_3px_0_rgba(36,36,34,0.10)]"
            >
              <div className="flex items-center justify-between gap-1.5">
                <span aria-hidden className="text-[13px] leading-none opacity-35">
                  {t.mark}
                </span>
                {editable && (
                  <CardMenu>
                    {(close) => (
                      <CardMenuItem
                        danger
                        onClick={() => {
                          close();
                          onRequestDelete(card);
                        }}
                      >
                        Delete…
                      </CardMenuItem>
                    )}
                  </CardMenu>
                )}
              </div>
              <div className="text-[13px] font-bold leading-[1.35]">
                <InlineText text={card.text} editable={editable} busy={busy} onSave={(next) => onEdit(card, next)} />
              </div>
              {badge && (
                <span className="mt-auto truncate text-[9.5px] uppercase tracking-[0.05em] text-muted">{badge}</span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
