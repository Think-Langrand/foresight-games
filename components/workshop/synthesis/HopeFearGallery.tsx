"use client";

import { useState } from "react";
import type { RippleCard } from "@/lib/ripples-types";
import type { ChainEntry, HopeFear } from "@/lib/synthesis-shape";
import {
  AddCardForm,
  CardMenu,
  CardMenuItem,
} from "@/components/workshop/synthesis/SynthesisCard";

// Everything written on this theme so far, as small cards you can scan and pick from.
//
// This replaced a horizontal tree. The tree spent its width drawing relationships that
// nobody needs at a glance and left a 216px box for writing a sentence about what the
// group is protecting — exactly backwards. The pairs are still recorded; a flipped card
// just says what it came from instead of being drawn hanging off it.

const FACE: Record<HopeFear, { chip: string; tint: string; addTint: string; mark: string }> = {
  hope: {
    chip: "bg-lime text-ink",
    tint: " bg-lime/25",
    addTint: "border-[var(--lime-deep)]/60 hover:bg-lime/25",
    mark: "☀",
  },
  fear: {
    chip: "bg-coral text-white",
    tint: " bg-coral/15",
    addTint: "border-coral/50 hover:bg-coral/15",
    mark: "☂",
  },
};

// The line at the foot of each card: where the work still is, so the gallery is a to-do
// list as well. The default asks for a "why"; the flip step asks whether it has been
// flipped.
export type GalleryStatus = (entry: ChainEntry) => { label: string; done: boolean };
const needsWhy: GalleryStatus = ({ card }) =>
  card.description ? { label: "✓ Why it matters", done: true } : { label: "Needs a why", done: false };

export function HopeFearGallery({
  entries,
  selectedId,
  editable,
  busy,
  onSelect,
  onRequestDelete,
  onQuickAdd,
  heading = "This theme’s hopes and fears",
  lead = "Pick one to work on it below.",
  addKinds = ["hope", "fear"],
  status = needsWhy,
}: {
  entries: ChainEntry[];
  selectedId: string | null;
  editable: boolean;
  busy: boolean;
  onSelect: (card: RippleCard) => void;
  onRequestDelete: (card: RippleCard) => void;
  onQuickAdd: (kind: HopeFear, text: string) => void;
  heading?: string;
  lead?: string;
  // Which add slots to offer. Empty when the gallery is a picker over cards written
  // elsewhere (the flip step).
  addKinds?: readonly HopeFear[];
  status?: GalleryStatus;
}) {
  const [adding, setAdding] = useState<HopeFear | null>(null);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline gap-2">
        <h3 className="text-[13px] font-bold uppercase tracking-[0.08em]">
          {heading}
          {entries.length > 0 && <span className="ml-1.5 text-muted">({entries.length})</span>}
        </h3>
        <p className="text-[12px] italic text-muted">{lead}</p>
      </div>

      <div className="flex flex-wrap items-stretch gap-3">
        {entries.map((entry) => {
          const { card, flippedFrom } = entry;
          const kind = card.cardKind as HopeFear;
          const face = FACE[kind];
          const on = card.id === selectedId;
          const state = status(entry);
          return (
            // A div rather than a button: the ⋯ menu is interactive and cannot legally
            // nest inside one. Keyboard-reachable, so selecting a card never needs a mouse.
            <div
              key={card.id}
              role="button"
              tabIndex={0}
              aria-pressed={on}
              onClick={() => onSelect(card)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(card);
                }
              }}
              className={
                "group flex h-[13.5rem] w-[15rem] cursor-pointer flex-col gap-2 rounded-[6px] border-2 p-3.5 text-left transition-all " +
                face.tint +
                (on
                  ? " border-ink shadow-[3px_5px_0_rgba(36,36,34,0.20)]"
                  : " border-black/20 hover:-translate-y-1 hover:border-ink hover:shadow-[3px_5px_0_rgba(36,36,34,0.14)]")
              }
            >
              <div className="flex items-center justify-between gap-1.5">
                <span
                  className={
                    "rounded-[2px] px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.08em] " +
                    face.chip
                  }
                >
                  {kind}
                </span>
                <div className="flex items-center gap-1">
                  <span aria-hidden className="text-[16px] leading-none opacity-35">
                    {face.mark}
                  </span>
                  {editable && (
                    // Stop the click here: opening the menu is not choosing the card.
                    <div onClick={(e) => e.stopPropagation()}>
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
                    </div>
                  )}
                </div>
              </div>

              <div className="line-clamp-5 text-[13.5px] font-bold leading-[1.35]">{card.text}</div>

              <div className="mt-auto flex flex-col gap-1">
                {/* What it answers. The pair is kept in the data; this is all the tree was
                    ever telling you, in one line. */}
                {flippedFrom && (
                  <span className="truncate text-[9.5px] uppercase tracking-[0.05em] text-muted">
                    ↩ flipped from {flippedFrom.cardKind}
                  </span>
                )}
                <span
                  className={
                    "text-[9.5px] font-bold uppercase tracking-[0.06em] " +
                    (state.done ? "text-muted" : "text-coral")
                  }
                >
                  {state.label}
                </span>
              </div>
            </div>
          );
        })}

        {/* Both slots stay on the page while you write into one of them. Writing a fear
            used to replace BOTH placeholders with a single white box, which dropped the
            hope out of sight at the exact moment the step is asking you to hold the two
            together — and a colourless box does not look like the card it is about to
            become. The one you picked turns into itself and the textarea sits inside it. */}
        {editable &&
          addKinds.map((kind) => {
            const face = FACE[kind];
            if (adding === kind) {
              return (
                <div
                  key={kind}
                  className={
                    "flex h-[13.5rem] w-[15rem] flex-col rounded-[6px] border-2 border-ink p-3 " +
                    face.tint
                  }
                >
                  <div className="mb-1.5 flex items-center justify-between">
                    <span
                      className={
                        "rounded-[2px] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] " +
                        face.chip
                      }
                    >
                      {kind}
                    </span>
                    <span aria-hidden className="text-[16px] leading-none opacity-35">
                      {face.mark}
                    </span>
                  </div>
                  <AddCardForm
                    label={
                      kind === "hope"
                        ? "What would it mean to us if this went well?"
                        : "What would we hate to lose here?"
                    }
                    busy={busy}
                    autoFocus
                    onAdd={(text) => onQuickAdd(kind, text)}
                    onDone={() => setAdding(null)}
                  />
                </div>
              );
            }
            return (
              <button
                key={kind}
                onClick={() => setAdding(kind)}
                className={
                  "flex h-[13.5rem] w-[15rem] flex-col items-center justify-center gap-2.5 rounded-[6px] border-2 border-dashed p-4 text-center transition-all hover:-translate-y-1 hover:border-ink " +
                  face.addTint
                }
              >
                <span aria-hidden className="text-[30px] leading-none opacity-40">
                  {face.mark}
                </span>
                <span className="text-[13px] font-extrabold uppercase tracking-[0.06em] text-muted">
                  ＋ A {kind}
                </span>
              </button>
            );
          })}
      </div>
    </div>
  );
}
