"use client";

import { SCORE_MAX, SCORE_MIN, matrixCells, rankByCardId, rankValue } from "@/lib/ripples-scoring";
import type { RippleCard } from "@/lib/ripples-types";

// Where the group's key changes land on the two axes. READ-ONLY: scores are entered on
// the button rows beside it, so there is no drag and no click-to-place.
//
// A 5×5 lattice for placement, read as a 2×2: the heavy cross splits low (1–3) from high
// (4–5) on both axes, which lands on real cell boundaries rather than bisecting the
// middle column. Hovering a chip (or its row in the list) names the key change below.
//
// The grid template and the square aspect are INLINE, not utility classes. This sits in a
// sidebar that collapses under `lg`, and a missing/stale utility silently degrades it to
// one column with zero-height empty cells — which reads as "everything stuck on the left"
// rather than as a broken stylesheet. Inline styles can't fail that way.
const SPLIT = 60; // % — the boundary after the 3rd cell on both axes

export function ImpactMatrix({
  cards,
  hoveredId = null,
  onHover,
}: {
  cards: RippleCard[];
  hoveredId?: string | null;
  onHover?: (id: string | null) => void;
}) {
  const cells = matrixCells(cards);
  const ranks = rankByCardId(cards);
  const placed = cells.flatMap((c) => c.cards);
  const hovered = placed.find((c) => c.id === hoveredId) ?? null;

  return (
    <div>
      <div className="flex gap-2">
        {/* Impact runs UP the left edge, so the high-impact band reads at the top. */}
        <div className="flex w-[20px] shrink-0 flex-col items-center justify-between py-1">
          <span className="text-[10px] font-bold tabular-nums text-muted">{SCORE_MAX}</span>
          <span
            className="whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.12em] text-muted"
            style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
          >
            Impact
          </span>
          <span className="text-[10px] font-bold tabular-nums text-muted">{SCORE_MIN}</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="relative w-full" style={{ maxWidth: 460, aspectRatio: "1 / 1" }}>
            <div
              className="h-full w-full gap-px border border-ink bg-[var(--rule)]"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
                gridTemplateRows: "repeat(5, minmax(0, 1fr))",
              }}
            >
              {cells.map((cell) => {
                // Hotter toward the top-right: the priority corner.
                const weight = (cell.plausibility * cell.impact) / (SCORE_MAX * SCORE_MAX);
                return (
                  <div
                    key={`${cell.plausibility}-${cell.impact}`}
                    className="flex flex-wrap content-center items-center justify-center gap-1 overflow-hidden p-1"
                    style={{
                      backgroundColor: `color-mix(in srgb, var(--lime) ${Math.round(weight * 72)}%, var(--paper))`,
                    }}
                  >
                    {cell.cards.map((c) => {
                      const on = hoveredId === c.id;
                      // Keys off the RESOLVED card, not the raw id: hovering a list row
                      // for a half-scored key change places nothing here, and dimming on
                      // the bare id would fade the whole matrix with nothing lit up.
                      const dim = hovered !== null && !on;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          title={`${c.text}\n\nPlausibility ${c.plausibility} × Impact ${c.impact} = ${rankValue(c)}`}
                          onMouseEnter={() => onHover?.(c.id)}
                          onMouseLeave={() => onHover?.(null)}
                          onFocus={() => onHover?.(c.id)}
                          onBlur={() => onHover?.(null)}
                          className={
                            "inline-flex h-6 min-w-[24px] items-center justify-center rounded-full border px-1 text-[12px] font-bold tabular-nums transition-all " +
                            (on
                              ? "scale-110 border-ink bg-ink text-paper shadow"
                              : "border-ink bg-card text-ink hover:bg-blue hover:text-white") +
                            (dim ? " opacity-25" : "")
                          }
                        >
                          {ranks.get(c.id) ?? "•"}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* The 2×2 reading, drawn over the lattice. */}
            <div aria-hidden className="pointer-events-none absolute inset-0">
              <div className="absolute top-0 h-full border-l-2 border-ink/35" style={{ left: `${SPLIT}%` }} />
              <div className="absolute left-0 w-full border-t-2 border-ink/35" style={{ top: `${100 - SPLIT}%` }} />
              <Quad className="left-1 top-1" label="Prepare" />
              <Quad className="right-1 top-1" label="Act on" />
              <Quad className="bottom-1 left-1" label="Park" />
              <Quad className="bottom-1 right-1" label="Watch" />
            </div>
          </div>

          {/* Plausibility runs along the bottom. */}
          <div className="mt-1 flex items-center justify-between" style={{ maxWidth: 460 }}>
            <span className="text-[10px] font-bold tabular-nums text-muted">{SCORE_MIN}</span>
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">Plausibility</span>
            <span className="text-[10px] font-bold tabular-nums text-muted">{SCORE_MAX}</span>
          </div>
        </div>
      </div>

      {/* Names whatever is hovered — in the matrix or in the list — so a numbered chip is
          never a number you have to go and look up. */}
      <div className="mt-3 min-h-[52px] rounded-[2px] border border-[var(--hairline)] bg-paper px-3 py-2">
        {hovered ? (
          <>
            <div className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted">
              #{ranks.get(hovered.id)} · plausibility {hovered.plausibility} × impact {hovered.impact} ={" "}
              {rankValue(hovered)}
            </div>
            <div className="mt-0.5 text-[12.5px] leading-[1.35]">{hovered.text}</div>
          </>
        ) : (
          <div className="text-[12px] italic text-muted">
            {placed.length === 0
              ? "Nothing placed yet — a key change appears here once it has both scores."
              : "Hover a number to see which key change it is."}
          </div>
        )}
      </div>
    </div>
  );
}

function Quad({ className, label }: { className: string; label: string }) {
  return (
    <span
      className={
        "absolute text-[9px] font-bold uppercase tracking-[0.1em] text-ink/30 " + className
      }
    >
      {label}
    </span>
  );
}
