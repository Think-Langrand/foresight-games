"use client";

import { useMemo } from "react";
import { buildChildrenMap, depthByCard, type RippleCard } from "@/lib/ripples-types";
import { sortRootsByRank } from "@/lib/ripples-scoring";
import { rippleDepthColor } from "@/components/workshop/RippleCard";

// A "futures wheel": the scenario sits at the hub, the key changes ring it, and each
// further order of implication radiates outward on its own ring. Weighted radial
// layout — each branch gets an angular slice proportional to how bushy it is — so
// nothing bunches up. Rings and the canvas scale to however deep the map actually
// runs. Same tree data (buildChildrenMap / depthByCard) as the ImplicationTree,
// drawn round.
interface WheelNode {
  id: string;
  text: string;
  depth: number; // ring index: 0 = the key changes (the hub is not a node)
  x: number;
  y: number;
}
interface WheelLink {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const HUB_R = 64; // the scenario hub
const FIRST_RING = 130; // hub centre → the key-change ring
const RING_GAP = 106; // …and between each ring after that
const MIN_RING_GAP = 74; // rings tighten as the map deepens, but not past this
const PAD = 16; // breathing room outside the last ring

// Ring gap shrinks as the map deepens, so a ten-level wheel stays roughly a screen
// wide instead of growing past 2000px. At three rings this reproduces the original
// fixed layout exactly.
function ringGap(rings: number): number {
  return Math.max(MIN_RING_GAP, RING_GAP - Math.max(0, rings - 3) * 8);
}

// Distance from the hub to ring `depth` (0-based).
function radiusOf(depth: number, rings: number): number {
  return FIRST_RING + depth * ringGap(rings);
}

// Nodes shrink with depth — the outer rings hold the most cards — but floor out so
// the text stays legible. 64/50/39/30 for the first few, matching the old wheel.
function nodeRadius(depth: number): number {
  return Math.max(18, Math.round(HUB_R * Math.pow(0.78, depth + 1)));
}

function layout(cards: RippleCard[]): { nodes: WheelNode[]; links: WheelLink[]; size: number } {
  const childrenMap = buildChildrenMap(cards);
  const depths = depthByCard(cards);
  // Same rank order as the tree, so the three views never disagree about the key changes.
  const roots = sortRootsByRank((childrenMap.get(null) ?? []).filter((c) => c.order !== "STICKY"));
  const rings = depths.size ? Math.max(...depths.values()) + 1 : 1;
  const size = 2 * (radiusOf(rings - 1, rings) + nodeRadius(rings - 1) + PAD);
  const cx = size / 2;
  const cy = size / 2;
  const nodes: WheelNode[] = [];
  const links: WheelLink[] = [];

  // Bushiness = leaf count of the subtree (min 1), so branches share the circle
  // fairly. Memoized — it's read once per branch and again per child, which at ten
  // levels would otherwise re-walk each subtree many times over.
  const weights = new Map<string, number>();
  const weight = (card: RippleCard): number => {
    const cached = weights.get(card.id);
    if (cached !== undefined) return cached;
    weights.set(card.id, 1); // cycle guard, replaced below
    const kids = childrenMap.get(card.id) ?? [];
    const w = kids.length ? kids.reduce((s, k) => s + weight(k), 0) : 1;
    weights.set(card.id, w);
    return w;
  };

  // depthByCard stops at the cap and drops cycles, so a card with no depth is not
  // drawn — which is also what keeps this recursion bounded.
  const place = (card: RippleCard, a0: number, a1: number, px: number, py: number) => {
    const depth = depths.get(card.id);
    if (depth === undefined) return;
    const mid = (a0 + a1) / 2;
    const r = radiusOf(depth, rings);
    const x = cx + r * Math.cos(mid);
    const y = cy + r * Math.sin(mid);
    nodes.push({ id: card.id, text: card.text, depth, x, y });
    links.push({ x1: px, y1: py, x2: x, y2: y });
    const kids = childrenMap.get(card.id) ?? [];
    if (kids.length) {
      const tot = kids.reduce((s, k) => s + weight(k), 0);
      let cur = a0;
      for (const k of kids) {
        const span = (weight(k) / tot) * (a1 - a0);
        place(k, cur, cur + span, x, y);
        cur += span;
      }
    }
  };

  if (roots.length) {
    const tot = roots.reduce((s, r) => s + weight(r), 0);
    let cur = -Math.PI / 2; // first ring starts at the top
    for (const r of roots) {
      const span = (weight(r) / tot) * (2 * Math.PI);
      place(r, cur, cur + span, cx, cy);
      cur += span;
    }
  }
  return { nodes, links, size };
}

export function FuturesWheel({ cards, centerLabel }: { cards: RippleCard[]; centerLabel: string }) {
  const { nodes, links, size } = useMemo(() => layout(cards), [cards]);
  const cx = size / 2;
  const cy = size / 2;

  if (nodes.length === 0) {
    return <p className="text-[13px] italic text-muted">No implications on the map yet.</p>;
  }

  return (
    <div className="overflow-auto pb-2">
      <div className="relative mx-auto" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="absolute inset-0" style={{ pointerEvents: "none" }}>
          {links.map((l, i) => (
            <line
              key={i}
              x1={l.x1}
              y1={l.y1}
              x2={l.x2}
              y2={l.y2}
              stroke="var(--hairline)"
              strokeWidth={1.5}
            />
          ))}
        </svg>

        <WheelCircle x={cx} y={cy} r={HUB_R} bg="var(--lime)" border="var(--ink)" hub label={centerLabel || "This world"} />
        {nodes.map((n) => (
          <WheelCircle
            key={n.id}
            x={n.x}
            y={n.y}
            r={nodeRadius(n.depth)}
            bg="var(--card)"
            border={rippleDepthColor(n.depth)}
            label={n.text}
          />
        ))}
      </div>
    </div>
  );
}

function WheelCircle({
  x,
  y,
  r,
  bg,
  border,
  label,
  hub,
}: {
  x: number;
  y: number;
  r: number;
  bg: string;
  border: string;
  label: string;
  hub?: boolean;
}) {
  return (
    <div
      title={label}
      className="absolute flex items-center justify-center rounded-full text-center shadow-[0_1px_0_rgba(36,36,34,0.08)]"
      style={{
        left: x - r,
        top: y - r,
        width: r * 2,
        height: r * 2,
        background: bg,
        border: `${hub ? 3 : 2}px solid ${border}`,
      }}
    >
      <span
        className={"px-2 " + (hub ? "text-[12px] font-extrabold uppercase leading-[1.05]" : "text-[10px] leading-[1.12]")}
        style={{
          display: "-webkit-box",
          WebkitLineClamp: hub ? 3 : 4,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {label}
      </span>
    </div>
  );
}
