"use client";

import type { RippleCard } from "@/lib/ripples-types";
import type { ThemeProgress } from "@/lib/synthesis-shape";
import { STATE_DOT, STATE_LABEL, stateGlyph } from "@/components/workshop/synthesis/themeProgress";

// Where you are in the pass over the themes, and the way to the next one — the next one
// still owing work first, since a pass is what every step of the week is.

export function ThemeFoot({
  themes,
  active,
  progressFor,
  onPick,
}: {
  themes: RippleCard[];
  active: RippleCard;
  progressFor: (theme: RippleCard) => ThemeProgress;
  onPick: (id: string) => void;
}) {
  const at = themes.findIndex((t) => t.id === active.id);
  const prev = themes[at - 1];
  const next = themes[at + 1];
  const state = progressFor(active);
  // Wraps past the end, so "next unfinished" always finds one while any is left.
  const nextUnfinished = (() => {
    const n = themes.length;
    for (let k = 1; k < n; k++) {
      const t = themes[(at + k) % n];
      if (progressFor(t) !== "done") return t;
    }
    return null;
  })();
  const navBtn =
    "rounded-[2px] border border-ink bg-paper px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.05em] hover:bg-lime disabled:opacity-30";
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
        Theme {at + 1} of {themes.length}
      </span>
      <span className={"flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.06em] " + STATE_DOT[state]}>
        <span aria-hidden>{stateGlyph(state)}</span>
        {STATE_LABEL[state]}
      </span>
      <span className="ml-auto flex flex-wrap items-center gap-1">
        <button disabled={!prev} onClick={() => prev && onPick(prev.id)} className={navBtn}>
          ← Prev
        </button>
        <button disabled={!next} onClick={() => next && onPick(next.id)} className={navBtn}>
          Next →
        </button>
        {nextUnfinished && (
          <button onClick={() => onPick(nextUnfinished.id)} title={nextUnfinished.text} className={navBtn + " border-ink bg-lime"}>
            Next unfinished: Theme {themes.indexOf(nextUnfinished) + 1} →
          </button>
        )}
      </span>
    </div>
  );
}
