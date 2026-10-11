"use client";

import type { RippleCard } from "@/lib/ripples-types";
import type { SynthesisBoard } from "@/lib/synthesis-shape";
import { CardWall } from "@/components/workshop/synthesis/CardWall";
import { makePrefStore, usePref } from "@/components/workshop/synthesis/prefStore";

// The themes, one card at a time, to read while writing hopes and fears. Step 3 is the
// board's, not a theme's, but a hope or fear is meant to come off what the group worked
// out in steps 1–2, and this keeps that within reach without leaving the step. Prev/Next,
// the dots, or the arrow keys turn the deck — and so does the theme rail, which is why
// which theme is showing is the caller's state rather than this deck's.
//
// What it shows is what step 2 produced: the theme's name, then the risks and the
// opportunities as the cards the group wrote them on — the same two walls, read-only. It
// used to lead with the four reading questions, which step 2 no longer asks; the walls
// were underneath them, in chips that did not look like anybody's cards.
//
// Folds to one line, remembered per browser like the other rails: once the group has read
// through, the walls want the room back.

const deckPref = makePrefStore("synthesis.themeDeck", "open", ["open", "closed"] as const);

const navBtn =
  "rounded-[2px] border border-ink bg-paper px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.05em] hover:bg-lime disabled:opacity-30";

export function ThemeDeck({
  board,
  activeId,
  onPick,
}: {
  board: SynthesisBoard;
  // Which theme is showing. Shared with the rail, so picking on either moves both.
  activeId: string | null;
  onPick: (id: string) => void;
}) {
  const open = usePref(deckPref) === "open";
  const themes = board.themes;
  if (themes.length === 0) return null;

  // A theme deleted live out from under the deck, or nothing picked yet, simply shows the
  // first one — resolved on every render rather than synced.
  const at = Math.max(0, themes.findIndex((t) => t.id === activeId));
  const theme: RippleCard = themes[at];
  const risks = board.risks.get(theme.id) ?? [];
  const opportunities = board.opportunities.get(theme.id) ?? [];
  const go = (n: number) => onPick(themes[Math.max(0, Math.min(themes.length - 1, n))].id);

  return (
    <section
      aria-label="The themes, one at a time"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          go(at - 1);
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          go(at + 1);
        }
      }}
      className="overflow-hidden rounded-[4px] border-2 border-ink bg-[rgba(196,255,103,0.16)] outline-none focus-visible:ring-2 focus-visible:ring-ink"
    >
      <div className="flex flex-wrap items-center gap-3 px-5 py-3">
        <button
          onClick={() => deckPref.write(open ? "closed" : "open")}
          aria-expanded={open}
          className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted hover:text-ink"
        >
          {open ? "▾" : "▸"} Theme {at + 1} of {themes.length}
        </button>
        {!open && (
          <span className="min-w-0 truncate text-[13px] font-bold" title={theme.text}>
            {theme.text}
          </span>
        )}
        <span className="ml-auto flex items-center gap-1">
          <button disabled={at === 0} onClick={() => go(at - 1)} className={navBtn} aria-label="Previous theme">
            ← Prev
          </button>
          {/* One dot per theme. Exposed to assistive tech, since they are focusable: each
              names its theme, and the current one says so. */}
          <span className="mx-1 flex items-center gap-1" role="group" aria-label="Go to theme">
            {themes.map((t, i) => (
              <button
                key={t.id}
                onClick={() => go(i)}
                title={t.text}
                aria-label={`Theme ${i + 1} of ${themes.length}: ${t.text}`}
                aria-current={i === at ? "true" : undefined}
                className={
                  "h-[8px] w-[8px] rounded-full border border-ink " + (i === at ? "bg-ink" : "bg-paper hover:bg-lime")
                }
              />
            ))}
          </span>
          <button
            disabled={at === themes.length - 1}
            onClick={() => go(at + 1)}
            className={navBtn}
            aria-label="Next theme"
          >
            Next →
          </button>
        </span>
      </div>

      {open && (
        <div className="border-t-2 border-dashed border-black/15 px-5 py-4">
          <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-muted">What is this theme about</div>
          <h3 className="mt-1 text-[18px] font-extrabold uppercase leading-[1.1] tracking-tight">{theme.text}</h3>

          {theme.description && (
            <p className="mt-2 max-w-[70ch] text-[13px] leading-[1.45] text-ink/80">{theme.description}</p>
          )}

          {/* Read-only, and deliberately the same walls as step 2 rather than a summary of
              them: a hope or a fear is meant to come off what the group already wrote, and
              it recognises its own cards faster than it reads a list. */}
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <CardWall
              tone="risk"
              title="Risks"
              cards={risks}
              editable={false}
              emptyHint="No risks written in step 2."
            />
            <CardWall
              tone="opportunity"
              title="Opportunities"
              cards={opportunities}
              editable={false}
              emptyHint="No opportunities written in step 2."
            />
          </div>
        </div>
      )}
    </section>
  );
}
