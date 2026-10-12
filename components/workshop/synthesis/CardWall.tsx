"use client";

import { useState } from "react";
import type { RippleCard } from "@/lib/ripples-types";
import {
  type AddResult,
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
//
// With `editable` false and no handlers it is a read-only wall — the same cards, the same
// colours, nothing to press. Step 3's theme deck reads a theme's risks and opportunities
// that way, so the group meets the cards it made in the shape it made them.

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

// A run of cards under a heading, for a wall that holds several themes' worth at once.
// Step 3 reads every theme's risks in one column and every theme's opportunities in the
// other, so the heading is the theme and the wall is the kind — the opposite grouping from
// step 2, where the theme is the page and the two kinds sit side by side on it.
export type WallGroup = {
  id: string;
  label: string;
  cards: RippleCard[];
};

const NO_CARDS: RippleCard[] = [];

export function CardWall({
  tone,
  title,
  cards = NO_CARDS,
  groups,
  activeGroupId,
  editable,
  busy = false,
  addLabel = "",
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
  // One flat grid of cards — the usual wall. A grouped wall passes `groups` instead.
  cards?: RippleCard[];
  // Given, these replace the flat `cards` body: one labelled run per group, in order,
  // including the groups that are empty — a column that silently omits a theme reads as a
  // complete list of themes with cards, which is not what it is.
  groups?: WallGroup[];
  // The group the rail has just jumped to, lit so the eye lands on it.
  activeGroupId?: string | null;
  editable: boolean;
  // Everything below is the writing half, and a read-only wall passes none of it.
  busy?: boolean;
  // The composer's placeholder — the sentence to finish ("We hope … because …").
  addLabel?: string;
  // The question the slot asks, shown on the add slot and above the open composer, so the
  // placeholder can be the sentence-starter rather than carry the whole prompt.
  slotQuestion?: string;
  onAdd?: (text: string) => AddResult;
  onEdit?: (card: RippleCard, text: string) => void;
  onRequestDelete?: (card: RippleCard) => void;
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
  // What the header counts: every group's cards when the wall is grouped, since the groups
  // are the body then and `cards` is not passed at all.
  const total = groups ? groups.reduce((n, g) => n + g.cards.length, 0) : cards.length;

  // One card. A plain function rather than a component, deliberately: a nested component
  // would be a new type every render and would remount the InlineText inside it, taking a
  // half-typed edit with it.
  const tile = (card: RippleCard) => {
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
          {editable && onRequestDelete && (
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
          <InlineText text={card.text} editable={editable} busy={busy} onSave={(next) => onEdit?.(card, next)} />
        </div>
        {badge && (
          <span title={badge} className="mt-auto truncate text-[9.5px] uppercase tracking-[0.05em] text-muted">
            {badge}
          </span>
        )}
      </div>
    );
  };

  return (
    <section
      className={
        "flex flex-col overflow-hidden rounded-[4px] border-2 " +
        t.edge +
        " " +
        t.well +
        // Room to fill, for a wall you can write on. A read-only one is as tall as what
        // is in it — an empty one is a line saying so, not 12rem of coloured nothing.
        (tall ? " min-h-[24rem]" : editable ? " min-h-[12rem]" : "")
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
          {total === 0 ? (emptyHint ?? "Nothing here yet.") : `${total} card${total === 1 ? "" : "s"}`}
        </span>
      </div>

      <div className="flex flex-wrap content-start gap-2 p-4">
        {editable &&
          onAdd &&
          (adding ? (
            <div className={"flex w-56 flex-col rounded-[4px] border-2 border-ink bg-paper p-2.5"}>
              {slotQuestion && (
                <div className="mb-1.5 text-[11.5px] font-bold leading-[1.3]">{slotQuestion}</div>
              )}
              <AddCardForm
                label={addLabel}
                busy={busy}
                autoFocus
                onAdd={async (text) => {
                  // Close only once the write landed; a failed add keeps the composer and
                  // its draft (see AddCardForm).
                  const ok = await onAdd(text);
                  if (ok !== false && closeAfterAdd) setAdding(false);
                  return ok;
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

        {!groups && cards.map(tile)}
      </div>

      {/* Grouped, the body is one labelled run per group instead of one flat grid. Outside
          the block above so the add slot — which a grouped wall does not have — is not
          stranded in the first group. */}
      {groups && (
        <div className="flex flex-col">
          {groups.map((g) => (
            <section
              key={g.id}
              id={`wall-${tone}-${g.id}`}
              // scroll-mt, because the rail jumps to these and the page has a sticky
              // header: without it the heading lands under the header it scrolled to.
              className={
                "scroll-mt-24 border-t border-dashed border-black/15 px-4 py-3 transition-colors " +
                (activeGroupId === g.id ? "bg-paper/70" : "")
              }
            >
              <h4 className="text-[10px] font-bold uppercase leading-[1.3] tracking-[0.08em] text-muted">
                {g.label}
              </h4>
              {g.cards.length === 0 ? (
                <p className="mt-1 text-[11px] italic text-muted">{emptyHint ?? "Nothing here yet."}</p>
              ) : (
                <div className="mt-2 flex flex-wrap content-start gap-2">{g.cards.map(tile)}</div>
              )}
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
