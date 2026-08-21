"use client";

import { useMemo } from "react";
import { buildChildrenMap, PHASE_PREFIXES, type RippleCard } from "@/lib/ripples-types";
import { rippleRoleColor } from "@/components/workshop/RippleCard";

// The finished map as a flat, readable table: every implication on its own row,
// tagged with the step it belongs to (In this world… / Because of that… / So by
// 2035…) and colour-coded to match the tree and wheel. Rows are in depth-first
// order so each causal chain stays together, and text is indented by depth so the
// branch structure is still legible in a list. Same tree data (buildChildrenMap)
// as the ImplicationTree and FuturesWheel — just laid out as rows.
interface Row {
  card: RippleCard;
  depth: number;
}

function flatten(cards: RippleCard[]): Row[] {
  const childrenMap = buildChildrenMap(cards);
  const roots = (childrenMap.get(null) ?? []).filter((c) => c.order === "FIRST");
  const rows: Row[] = [];
  const walk = (card: RippleCard, depth: number) => {
    rows.push({ card, depth });
    for (const kid of childrenMap.get(card.id) ?? []) walk(kid, depth + 1);
  };
  for (const r of roots) walk(r, 0);
  return rows;
}

export function ImplicationList({ cards, scenarioTitle }: { cards: RippleCard[]; scenarioTitle: string }) {
  const rows = useMemo(() => flatten(cards), [cards]);

  if (rows.length === 0) {
    return <p className="text-[13px] italic text-muted">No implications on the map yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      {/* Scenario anchor — the root every chain grows from, echoing the tree/wheel hub. */}
      <div className="mb-3 flex items-center gap-2 border-l-2 border-ink pl-3">
        <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">Scenario</span>
        <span className="text-[14px] font-extrabold uppercase tracking-tight">{scenarioTitle || "This world"}</span>
      </div>

      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b-2 border-ink">
            <th className="w-[184px] py-2 pr-4 text-[10px] font-bold uppercase tracking-[0.1em] text-muted">Step</th>
            <th className="py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-muted">Implication</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ card, depth }) => (
            <tr key={card.id} className="border-b border-[var(--hairline)] align-top">
              <td className="py-2.5 pr-4">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.05em]">
                  <span
                    className="inline-block h-2.5 w-2.5 flex-none rounded-full"
                    style={{ background: rippleRoleColor(card.order) }}
                  />
                  {PHASE_PREFIXES[card.order]}
                </span>
              </td>
              <td className="py-2.5 text-[14px] leading-[1.4]" style={{ paddingLeft: depth * 20 }}>
                {card.text}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
