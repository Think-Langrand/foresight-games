"use client";

import type { RippleCard } from "@/lib/ripples-types";
import { Dot } from "@/components/workshop/synthesis/ThemeRail";
import { TONE, type WallTone } from "@/components/workshop/synthesis/CardWall";

// What step 2 produced, read back on step 3: every risk in one of these, every opportunity
// in the other, each run of them under the theme it was written on.
//
// A LIST, not the cards they were written on. Step 2's wall is a surface you WRITE on —
// the card shape says "this is a thing you made, and you can pick it up and move it". Here
// the group is reading, and nothing on this block moves: a column of twenty 224px tiles is
// a wall to scan, where a list is read straight down and lets the theme headings do the
// grouping. The colour and the mark stay the same (see TONE), so a risk still reads as a
// risk — it is the same vocabulary in a quieter shape.
//
// Read-only by construction: no handlers, nothing to press. Editing a risk happens in
// step 2, where it was written.

export type StakeGroup = {
  id: string;
  label: string;
  cards: RippleCard[];
};

export function StakeList({
  tone,
  title,
  groups,
  activeId,
  emptyHint,
}: {
  tone: WallTone;
  title: string;
  // One run per theme, in board order — including the themes with nothing in them. A
  // column that silently drops a theme reads as a complete list of the themes that have
  // risks, which is a different and less useful claim.
  groups: StakeGroup[];
  // The theme the rail has just jumped to, lit so the eye lands on it.
  activeId?: string | null;
  emptyHint: string;
}) {
  const t = TONE[tone];
  const total = groups.reduce((n, g) => n + g.cards.length, 0);

  return (
    <section className={"flex flex-col overflow-hidden rounded-[4px] border-2 pb-2 " + t.edge + " " + t.well}>
      <div className="flex flex-wrap items-baseline gap-2 border-b border-black/10 px-4 py-3">
        <span className={"rounded-[2px] px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.08em] " + t.chip}>
          <span aria-hidden className="mr-1">
            {t.mark}
          </span>
          {title}
        </span>
        <span className="text-[11px] italic text-muted">
          {total === 0 ? emptyHint : `${total} in all`}
        </span>
      </div>

      {/* No rule between themes, and no block of air either. This is ONE list of the
          board's risks with the theme said above each run — not a stack of per-theme
          boxes. The heading's own weight and case are the only separation it needs, and
          the group a square has jumped to is marked by its tint rather than by an edge. */}
      {groups.map((g) => (
        <section
          key={g.id}
          id={`stakes-${tone}-${g.id}`}
          // scroll-mt, because the rail jumps to these and the page has a sticky header:
          // without it the heading lands underneath the header it scrolled to.
          className={
            "scroll-mt-24 px-4 py-2 transition-colors " +
            (activeId === g.id ? "bg-paper/70" : "")
          }
        >
          <h4 className="text-[10px] font-bold uppercase leading-[1.3] tracking-[0.08em] text-muted">
            {g.label}
          </h4>
          {g.cards.length === 0 ? (
            <p className="mt-1 text-[12px] italic leading-[1.45] text-muted">{emptyHint}</p>
          ) : (
            <ul className="mt-1 flex flex-col gap-1">
              {g.cards.map((c) => (
                <li key={c.id} className="flex items-start gap-2 text-[13px] leading-[1.45]">
                  {/* The week's own bullet — the same one the rail and the theme popover
                      list implications with, so a list of risks reads as a list of the
                      same kind of thing. */}
                  <Dot />
                  <span className="min-w-0">{c.text}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </section>
  );
}
