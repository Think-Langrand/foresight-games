"use client";

import { useMemo, useState } from "react";
import { buildChildrenMap, depthByCard, orderLabelForDepth, type RippleCard } from "@/lib/ripples-types";
import { rippleDepthColor } from "@/components/workshop/RippleCard";

// The finished map as a flat, readable table: every implication on its own row,
// tagged with its level (key change, 1st order, 2nd order, …) and colour-coded to
// match the tree and wheel. Rows are depth-first so each causal chain stays
// together, and text is indented by depth so the branch structure is still
// legible. Filter chips narrow the list to a single level. Same tree data
// (buildChildrenMap / depthByCard) as the ImplicationTree and FuturesWheel — just
// laid out as rows.
interface Row {
  card: RippleCard;
  depth: number;
}

// Levels are named by depth, so the list, the tree headers and the wheel all agree
// no matter how deep a map runs.
type Filter = number | "ALL";

// Indent per level. Small, because a deep map would otherwise push the text clean
// out of the column.
const INDENT = 12;

function flatten(cards: RippleCard[]): Row[] {
  const childrenMap = buildChildrenMap(cards);
  const depths = depthByCard(cards);
  const roots = (childrenMap.get(null) ?? []).filter((c) => c.order !== "STICKY");
  const rows: Row[] = [];
  // Depth comes from depthByCard, which stops at the cap and drops cycles — so
  // this walk can't run away on a malformed parent chain.
  const walk = (card: RippleCard) => {
    const depth = depths.get(card.id);
    if (depth === undefined) return;
    rows.push({ card, depth });
    for (const kid of childrenMap.get(card.id) ?? []) walk(kid);
  };
  for (const r of roots) walk(r);
  return rows;
}

export function ImplicationList({ cards, scenarioTitle }: { cards: RippleCard[]; scenarioTitle: string }) {
  const rows = useMemo(() => flatten(cards), [cards]);
  const [filter, setFilter] = useState<Filter>("ALL");

  if (rows.length === 0) {
    return <p className="text-[13px] italic text-muted">No implications on the map yet.</p>;
  }

  // One chip per level actually on the board, so a deep map gets deep chips and a
  // shallow one isn't cluttered with empties.
  const filters: Filter[] = ["ALL", ...Array.from(new Set(rows.map((r) => r.depth))).sort((a, b) => a - b)];
  const countOf = (f: Filter) => (f === "ALL" ? rows.length : rows.filter((r) => r.depth === f).length);
  const shown = filter === "ALL" ? rows : rows.filter((r) => r.depth === filter);

  return (
    <div className="overflow-x-auto">
      {/* Scenario anchor — the root every chain grows from, echoing the tree/wheel hub. */}
      <div className="mb-3 flex items-center gap-2 border-l-2 border-ink pl-3">
        <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">Scenario</span>
        <span className="text-[14px] font-extrabold uppercase tracking-tight">{scenarioTitle || "This world"}</span>
      </div>

      {/* Filter by level. */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {filters.map((key) => {
          const label = key === "ALL" ? "All" : orderLabelForDepth(key);
          const active = filter === key;
          const dot = key === "ALL" ? null : rippleDepthColor(key);
          return (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={
                "inline-flex items-center gap-1.5 rounded-[2px] border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.05em] " +
                (active ? "border-ink bg-ink text-paper" : "border-[var(--hairline)] bg-paper text-ink hover:border-ink")
              }
            >
              {dot && <span className="inline-block h-2 w-2 flex-none rounded-full" style={{ background: dot }} />}
              {label}
              <span className={active ? "opacity-70" : "text-muted"}>{countOf(key)}</span>
            </button>
          );
        })}
      </div>

      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b-2 border-ink">
            <th className="w-[150px] py-2 pr-4 text-[10px] font-bold uppercase tracking-[0.1em] text-muted">Level</th>
            <th className="py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-muted">Implication</th>
          </tr>
        </thead>
        <tbody>
          {shown.map(({ card, depth }) => (
            <tr key={card.id} className="border-b border-[var(--hairline)] align-top">
              <td className="py-2.5 pr-4">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.05em]">
                  <span
                    className="inline-block h-2.5 w-2.5 flex-none rounded-full"
                    style={{ background: rippleDepthColor(depth) }}
                  />
                  {orderLabelForDepth(depth)}
                </span>
              </td>
              {/* Indent by depth only in the full view — a single-level filter reads flat. */}
              <td
                className="py-2.5 text-[14px] leading-[1.4]"
                style={{ paddingLeft: filter === "ALL" ? depth * INDENT : 0 }}
              >
                {card.text}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
