"use client";

import { useState } from "react";
import type { RippleCard } from "@/lib/ripples-types";
import type { ChainEntry, HopeFear } from "@/lib/synthesis-shape";
import { AddCardForm } from "@/components/workshop/synthesis/SynthesisCard";

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

export function HopeFearGallery({
  entries,
  selectedId,
  editable,
  busy,
  onSelect,
  onQuickAdd,
}: {
  entries: ChainEntry[];
  selectedId: string | null;
  editable: boolean;
  busy: boolean;
  onSelect: (card: RippleCard) => void;
  onQuickAdd: (kind: HopeFear, text: string) => void;
}) {
  const [adding, setAdding] = useState<HopeFear | null>(null);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline gap-2">
        <h3 className="text-[13px] font-bold uppercase tracking-[0.08em]">
          On this theme
          {entries.length > 0 && <span className="ml-1.5 text-muted">({entries.length})</span>}
        </h3>
        <p className="text-[12px] italic text-muted">Pick one to work on it below.</p>
      </div>

      <div className="flex flex-wrap items-stretch gap-3">
        {entries.map(({ card, flippedFrom }) => {
          const kind = card.cardKind as HopeFear;
          const face = FACE[kind];
          const on = card.id === selectedId;
          return (
            <button
              key={card.id}
              onClick={() => onSelect(card)}
              aria-pressed={on}
              className={
                "flex h-[13.5rem] w-[15rem] flex-col gap-2 rounded-[6px] border-2 p-3.5 text-left transition-all " +
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
                <span aria-hidden className="text-[16px] leading-none opacity-35">
                  {face.mark}
                </span>
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
                {/* Where the work still is, so the gallery is a to-do list as well. */}
                <span
                  className={
                    "text-[9.5px] font-bold uppercase tracking-[0.06em] " +
                    (card.description ? "text-muted" : "text-coral")
                  }
                >
                  {card.description ? "✓ Why it matters" : "Needs a why"}
                </span>
              </div>
            </button>
          );
        })}

        {editable &&
          (adding ? (
            <div className="flex h-[13.5rem] w-[15rem] flex-col justify-center rounded-[6px] border-2 border-ink bg-paper p-3">
              <AddCardForm
                label={
                  adding === "hope"
                    ? "What would it mean to us if this went well?"
                    : "What would we hate to lose here?"
                }
                busy={busy}
                autoFocus
                onAdd={(text) => onQuickAdd(adding, text)}
                onDone={() => setAdding(null)}
              />
            </div>
          ) : (
            (["hope", "fear"] as const).map((kind) => (
              <button
                key={kind}
                onClick={() => setAdding(kind)}
                className={
                  "flex h-[13.5rem] w-[15rem] flex-col items-center justify-center gap-2.5 rounded-[6px] border-2 border-dashed p-4 text-center transition-all hover:-translate-y-1 hover:border-ink " +
                  FACE[kind].addTint
                }
              >
                <span aria-hidden className="text-[30px] leading-none opacity-40">
                  {FACE[kind].mark}
                </span>
                <span className="text-[13px] font-extrabold uppercase tracking-[0.06em] text-muted">
                  ＋ A {kind}
                </span>
              </button>
            ))
          ))}
      </div>
    </div>
  );
}
