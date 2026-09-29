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

const FACE: Record<HopeFear, { chip: string; border: string; mark: string }> = {
  hope: { chip: "bg-lime text-ink", border: "border-l-[var(--lime-deep)]", mark: "☀" },
  fear: { chip: "bg-coral text-white", border: "border-l-coral", mark: "☂" },
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

      <div className="flex flex-wrap items-stretch gap-2.5">
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
                "flex w-[15.5rem] flex-col gap-1.5 rounded-[3px] border border-l-4 p-2.5 text-left transition-all " +
                face.border +
                (on
                  ? " border-ink bg-paper shadow-[2px_3px_0_rgba(36,36,34,0.16)]"
                  : " border-black/15 bg-paper/70 hover:-translate-y-0.5 hover:shadow-[2px_3px_0_rgba(36,36,34,0.10)]")
              }
            >
              <div className="flex items-center gap-1.5">
                <span
                  className={
                    "rounded-[2px] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em] " +
                    face.chip
                  }
                >
                  {kind}
                </span>
                {/* What it answers. The pair is kept in the data; this is all the tree was
                    ever telling you, in one line. */}
                {flippedFrom && (
                  <span className="truncate text-[9.5px] uppercase tracking-[0.05em] text-muted">
                    ↩ flipped from {flippedFrom.cardKind}
                  </span>
                )}
              </div>

              <div className="line-clamp-3 text-[12.5px] leading-[1.4]">{card.text}</div>

              {/* What is still missing, so the gallery shows where the work is. */}
              <div className="mt-auto flex items-center gap-2 pt-0.5 text-[9.5px] font-bold uppercase tracking-[0.05em]">
                {card.description ? (
                  <span className="text-muted">✓ Why it matters</span>
                ) : (
                  <span className="text-coral">Needs a why</span>
                )}
              </div>
            </button>
          );
        })}

        {editable &&
          (adding ? (
            <div className="w-[15.5rem]">
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
            <div className="flex w-[15.5rem] flex-col gap-2">
              {(["hope", "fear"] as const).map((kind) => (
                <button
                  key={kind}
                  onClick={() => setAdding(kind)}
                  className={
                    "flex flex-1 items-center justify-center gap-2 rounded-[3px] border-2 border-dashed p-3 text-[11px] font-bold uppercase tracking-[0.06em] text-muted transition-colors hover:border-ink hover:text-ink " +
                    (kind === "hope"
                      ? "border-[var(--lime-deep)]/60 hover:bg-lime/30"
                      : "border-coral/50 hover:bg-coral/15")
                  }
                >
                  <span aria-hidden className="text-[15px] leading-none opacity-50">
                    {FACE[kind].mark}
                  </span>
                  ＋ A {kind}
                </button>
              ))}
            </div>
          ))}
      </div>
    </div>
  );
}
