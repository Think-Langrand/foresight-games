// The futures-wheel radial layout, as pure geometry.
//
// Lifted out of components/workshop/FuturesWheel.tsx so two callers can share it: the
// wheel itself, and the Session 3 clustering CANVAS, which seeds an implication's opening
// position from the node the wheel would have drawn for it. That is what lets the canvas
// open looking like the map without storing a coordinate for every card up front — and
// why determinism matters here: every client computes these positions independently, so
// the same board must give the same wheel or two people's canvases disagree.
//
// Pure, and now reachable from vitest, which it was not while it sat module-private in a
// "use client" component.

import { buildChildrenMap, depthByCard, type RippleCard } from "@/lib/ripples-types";
import { sortRootsByRank } from "@/lib/ripples-scoring";

// A "futures wheel": the scenario sits at the hub, the key changes ring it, and each
// further order of implication radiates outward on its own ring. Weighted radial
// layout — each branch gets an angular slice proportional to how bushy it is — so
// nothing bunches up. Rings and the canvas scale to however deep the map actually
// runs. Same tree data (buildChildrenMap / depthByCard) as the ImplicationTree,
// drawn round.
export interface WheelNode {
  id: string;
  text: string;
  depth: number; // ring index: 0 = the key changes (the hub is not a node)
  x: number;
  y: number;
}
export interface WheelLink {
  toId: string; // the child this line leads to; the parent is whoever it leaves
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export const HUB_R = 64; // the scenario hub
export const NODE_R = 38; // EVERY content node, whatever ring it sits on
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

// A line from one circle's centre to another's, cut back to the two rims. Drawn centre to
// centre it runs underneath both circles, and shows straight through any circle that is
// not fully opaque — which is exactly how the dimmed branch view used to look.
function rimToRim(
  x1: number,
  y1: number,
  r1: number,
  x2: number,
  y2: number,
  r2: number
): Pick<WheelLink, "x1" | "y1" | "x2" | "y2"> {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len <= r1 + r2) return { x1, y1, x2, y2 }; // overlapping circles: nothing to trim to
  const ux = dx / len;
  const uy = dy / len;
  return { x1: x1 + ux * r1, y1: y1 + uy * r1, x2: x2 - ux * r2, y2: y2 - uy * r2 };
}

export function layout(cards: RippleCard[]): { nodes: WheelNode[]; links: WheelLink[]; size: number } {
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
  // `pr` is the parent's radius: the hub's for the first ring, a node's after that.
  const place = (card: RippleCard, a0: number, a1: number, px: number, py: number, pr: number) => {
    const depth = depths.get(card.id);
    if (depth === undefined) return;
    const mid = (a0 + a1) / 2;
    const r = radii[depth] ?? FIRST_RING;
    const x = cx + r * Math.cos(mid);
    const y = cy + r * Math.sin(mid);
    nodes.push({ id: card.id, text: card.text, depth, x, y });
    links.push({ toId: card.id, ...rimToRim(px, py, pr, x, y, NODE_R) });
    const kids = childrenMap.get(card.id) ?? [];
    if (kids.length) {
      const tot = kids.reduce((s, k) => s + weight(k), 0);
      let cur = a0;
      for (const k of kids) {
        const span = (weight(k) / tot) * (a1 - a0);
        place(k, cur, cur + span, x, y, NODE_R);
        cur += span;
      }
    }
  };

  if (roots.length) {
    const tot = roots.reduce((s, r) => s + weight(r), 0);
    let cur = -Math.PI / 2; // first ring starts at the top
    for (const r of roots) {
      const span = (weight(r) / tot) * (2 * Math.PI);
      place(r, cur, cur + span, cx, cy, HUB_R);
      cur += span;
    }
  }
  return { nodes, links, size };
}
