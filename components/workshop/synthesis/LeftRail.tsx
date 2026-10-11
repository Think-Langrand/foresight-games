"use client";

import type { ReactNode } from "react";
import { useBoardGutters } from "@/components/workshop/synthesis/boardGutters";

// The panel at the LEFT screen edge, outside the board's column. Every step of the week
// has one, and the band at its top is the step itself: which world the group is in, and
// what this step asks of them, set large and held while they work.
//
// The band is the fixed point. What goes under it is the step's business — the theme
// squares on steps 1–3 (ThemeRail), nothing yet on step 4 — and the rail is here rather
// than inside ThemeRail so a step can have the band without having the squares.
//
// It also holds the page's left gutter, so whatever is in the rail, the board beside it
// starts in the same place on every step.
export function LeftRail({ top, children }: { top?: ReactNode; children?: ReactNode }) {
  useBoardGutters();
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[15rem] flex-col border-r border-ink bg-board px-3 py-4 lg:flex">
      {top !== undefined && (
        // The band's top edge is the viewport's (the aside's padding is pulled back over),
        // and it is at least as tall as the board's header stack, so the rule it ends in
        // lines up with the board's own — one line across the rail and the column, with
        // the section labels under it on both sides. Pinned: the rail scrolls beneath it.
        <div
          className="-mx-3 -mt-4 flex shrink-0 flex-col justify-end border-b border-ink px-3 pb-3 pt-4"
          style={{ minHeight: "var(--rail-band, 0px)" }}
        >
          {top}
        </div>
      )}
      {children !== undefined && (
        <div className={"min-h-0 flex-1 overflow-y-auto " + (top !== undefined ? "pt-[13px]" : "")}>
          {children}
        </div>
      )}
    </aside>
  );
}
