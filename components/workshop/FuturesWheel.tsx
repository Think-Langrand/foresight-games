"use client";

import { useMemo } from "react";
import { buildChildrenMap, type CardOrder, type RippleCard } from "@/lib/ripples-types";
import { rippleRoleColor } from "@/components/workshop/RippleCard";

// A "futures wheel": the scenario sits at the hub, first-order implications ring it,
// and second/third-order implications radiate further out. Weighted radial layout —
// each branch gets an angular slice proportional to how bushy it is — so nothing
// bunches up. Same tree data (buildChildrenMap) as the ImplicationTree, drawn round.
interface WheelNode {
  id: string;
  text: string;
  order: CardOrder;
  depth: number;
  x: number;
  y: number;
}
interface WheelLink {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const SIZE = 760;
const RADII = [0, SIZE * 0.17, SIZE * 0.31, SIZE * 0.45]; // depth 0=hub, 1/2/3
const NODE_R = [64, 50, 40, 32]; // radius by depth

function layout(cards: RippleCard[]): { nodes: WheelNode[]; links: WheelLink[] } {
  const childrenMap = buildChildrenMap(cards);
  const roots = (childrenMap.get(null) ?? []).filter((c) => c.order === "FIRST");
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const nodes: WheelNode[] = [];
  const links: WheelLink[] = [];

  // Bushiness = leaf count of the subtree (min 1), so branches share the circle fairly.
  const weight = (card: RippleCard): number => {
    const kids = childrenMap.get(card.id) ?? [];
    return kids.length ? kids.reduce((s, k) => s + weight(k), 0) : 1;
  };

  const place = (card: RippleCard, depth: number, a0: number, a1: number, px: number, py: number) => {
    const mid = (a0 + a1) / 2;
    const r = RADII[Math.min(depth, RADII.length - 1)];
    const x = cx + r * Math.cos(mid);
    const y = cy + r * Math.sin(mid);
    nodes.push({ id: card.id, text: card.text, order: card.order, depth, x, y });
    links.push({ x1: px, y1: py, x2: x, y2: y });
    const kids = childrenMap.get(card.id) ?? [];
    if (kids.length) {
      const tot = kids.reduce((s, k) => s + weight(k), 0);
      let cur = a0;
      for (const k of kids) {
        const span = (weight(k) / tot) * (a1 - a0);
        place(k, depth + 1, cur, cur + span, x, y);
        cur += span;
      }
    }
  };

  if (roots.length) {
    const tot = roots.reduce((s, r) => s + weight(r), 0);
    let cur = -Math.PI / 2; // first ring starts at the top
    for (const r of roots) {
      const span = (weight(r) / tot) * (2 * Math.PI);
      place(r, 1, cur, cur + span, cx, cy);
      cur += span;
    }
  }
  return { nodes, links };
}

export function FuturesWheel({ cards, centerLabel }: { cards: RippleCard[]; centerLabel: string }) {
  const { nodes, links } = useMemo(() => layout(cards), [cards]);
  const cx = SIZE / 2;
  const cy = SIZE / 2;

  if (nodes.length === 0) {
    return <p className="text-[13px] italic text-muted">No implications on the map yet.</p>;
  }

  return (
    <div className="overflow-auto pb-2">
      <div className="relative mx-auto" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} className="absolute inset-0" style={{ pointerEvents: "none" }}>
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

        <WheelCircle x={cx} y={cy} r={NODE_R[0]} bg="var(--lime)" border="var(--ink)" hub label={centerLabel || "This world"} />
        {nodes.map((n) => (
          <WheelCircle
            key={n.id}
            x={n.x}
            y={n.y}
            r={NODE_R[Math.min(n.depth, NODE_R.length - 1)]}
            bg="var(--card)"
            border={rippleRoleColor(n.order)}
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
