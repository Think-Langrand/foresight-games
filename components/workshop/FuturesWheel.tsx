"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
const NODE_R = 38; // EVERY content node, whatever ring it sits on
const NODE_GAP = 12; // minimum air between two nodes on the same ring
const RING_PAD = 26; // minimum air between one ring and the next
const FIRST_RING = 150; // hub centre → the key-change ring, when it is not crowded
const PAD = 16; // breathing room outside the last ring

// Every content circle is the SAME SIZE. It used to shrink by depth (50/39/30/24…),
// which read as "this one matters less" when all it meant was "this one is further out" —
// and a third-order implication carries exactly as much text as a first-order one.
//
// Equal circles cost circumference, so the rings have to earn their radius instead: a ring
// is pushed out until its nodes actually fit around it. A wide map therefore grows rather
// than squashing, which is the honest trade — the container already scrolls.
function ringRadii(countByDepth: number[]): number[] {
  const radii: number[] = [];
  for (let d = 0; d < countByDepth.length; d++) {
    const floor = d === 0 ? FIRST_RING : radii[d - 1] + 2 * NODE_R + RING_PAD;
    // What this ring needs to seat `count` circles of NODE_R without them touching.
    const needed = (countByDepth[d] * (2 * NODE_R + NODE_GAP)) / (2 * Math.PI);
    radii.push(Math.max(floor, needed));
  }
  return radii;
}

function layout(cards: RippleCard[]): { nodes: WheelNode[]; links: WheelLink[]; size: number } {
  const childrenMap = buildChildrenMap(cards);
  const depths = depthByCard(cards);
  // Same rank order as the tree, so the three views never disagree about the key changes.
  const roots = sortRootsByRank((childrenMap.get(null) ?? []).filter((c) => c.order !== "STICKY"));
  const rings = depths.size ? Math.max(...depths.values()) + 1 : 1;
  const countByDepth = Array.from({ length: rings }, () => 0);
  for (const d of depths.values()) if (d < rings) countByDepth[d] += 1;
  const radii = ringRadii(countByDepth);
  const size = 2 * ((radii[rings - 1] ?? FIRST_RING) + NODE_R + PAD);
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
    const r = radii[depth] ?? FIRST_RING;
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

export function FuturesWheel({
  cards,
  centerLabel,
  // Circle ids to pick out, and what to dim everything else to. Used by the drill-in,
  // where the point is one implication's path rather than the whole map.
  highlightIds,
  selectedId,
}: {
  cards: RippleCard[];
  centerLabel: string;
  highlightIds?: Set<string>;
  // The one circle the drill-in was opened for. Drawn lime so it is findable at a glance
  // in a branch that may hold fifty others.
  selectedId?: string;
}) {
  const { nodes, links, size } = useMemo(() => layout(cards), [cards]);
  const cx = size / 2;
  const cy = size / 2;

  // Equal-sized circles mean a wide map earns a big radius — Group 1's 146-node map comes
  // out at 2217px, which is unreadable inside a 1100px column and opens on a corner of
  // empty space. Scale the whole thing to whatever room there is instead; the circles stay
  // equal to each other, which is the thing that matters.
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const fit = () => setScale(Math.min(1, (el.clientWidth || size) / size));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [size]);

  if (nodes.length === 0) {
    return <p className="text-[13px] italic text-muted">No implications on the map yet.</p>;
  }

  return (
    <div ref={boxRef} className="pb-2">
      <div
        className="relative mx-auto"
        style={{
          width: size * scale,
          height: size * scale,
        }}
      >
      <div
        className="relative"
        style={{ width: size, height: size, transform: `scale(${scale})`, transformOrigin: "top left" }}
      >
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
            r={NODE_R}
            bg={n.id === selectedId ? "var(--lime)" : "var(--card)"}
            border={n.id === selectedId ? "var(--ink)" : rippleDepthColor(n.depth)}
            label={n.text}
            dim={highlightIds ? !highlightIds.has(n.id) : false}
            emphasis={n.id === selectedId}
          />
        ))}
      </div>
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
  dim,
  emphasis,
}: {
  x: number;
  y: number;
  r: number;
  bg: string;
  border: string;
  label: string;
  hub?: boolean;
  dim?: boolean;
  emphasis?: boolean;
}) {
  return (
    <div
      title={label}
      className={
        "absolute flex items-center justify-center rounded-full text-center shadow-[0_1px_0_rgba(36,36,34,0.08)] " +
        (dim ? "opacity-20 " : "") +
        (emphasis ? "z-10 shadow-[0_0_0_6px_rgba(196,255,103,0.45)] " : "")
      }
      style={{
        left: x - r,
        top: y - r,
        width: r * 2,
        height: r * 2,
        background: bg,
        border: `${hub || emphasis ? 3 : 2}px solid ${border}`,
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
