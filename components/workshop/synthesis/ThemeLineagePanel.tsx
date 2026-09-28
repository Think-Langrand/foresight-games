"use client";

import type { RippleCard } from "@/lib/ripples-types";
import type { Week2Lineage } from "@/lib/synthesis-shape";

// The drill-in beside a theme's hopes & fears: what is actually IN this theme, and where
// each implication came from — the chain it was part of last session, and the key change
// at the head of that chain.
//
// The lineage map is keyed by the WEEK 2 card id, which a seeded card points at via
// sourceCardId. Three cases legitimately have no lineage, and each simply omits the
// breadcrumb rather than blanking the card:
//   - an implication the group typed here by hand (no sourceCardId at all)
//   - a seed whose Week 2 source was later deleted (source_card_id is ON DELETE SET NULL)
//   - a group whose Week 2 is still a placeholder (the map is empty)

export function ThemeLineagePanel({
  implications,
  lineage,
}: {
  implications: RippleCard[];
  lineage: Record<string, Week2Lineage>;
}) {
  return (
    <details className="rounded-[3px] border border-[var(--hairline)] bg-card px-4 py-3" open>
      <summary className="cursor-pointer text-[12px] font-bold uppercase tracking-[0.08em] text-muted">
        What&rsquo;s in this theme ({implications.length})
      </summary>

      {implications.length === 0 ? (
        <p className="mt-2 text-[12.5px] italic text-muted">
          Nothing clustered into this theme yet — the Cluster step is where that happens.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {implications.map((c) => {
            const from = c.sourceCardId ? lineage[c.sourceCardId] : undefined;
            return (
              <li key={c.id} className="border-l-2 border-[var(--rule)] pl-3">
                <div className="text-[13px] leading-[1.4]">{c.text}</div>
                {from && (
                  <div className="mt-1 flex flex-wrap items-baseline gap-1.5">
                    <span className="rounded-[2px] bg-lime px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em] text-ink">
                      {from.keyChange}
                    </span>
                    {/* The chain starts with the key change itself, already shown in the
                        chip above, so the trail picks up after it. */}
                    {from.chain.length > 1 && (
                      <span className="text-[11.5px] leading-[1.4] text-muted">
                        {from.chain.slice(1).join(" → ")}
                      </span>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </details>
  );
}
