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
  toId: string; // the child this line leads to; the parent is whoever it leaves
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

// The nearest ancestor that actually scrolls. The wheel never scrolls itself; whoever
// embeds it owns the viewport, and that is the thing to move when centring on a chain.
function scrollParentOf(el: HTMLElement | null): HTMLElement | null {
  for (let cur = el?.parentElement ?? null; cur; cur = cur.parentElement) {
    const { overflowY, overflowX } = getComputedStyle(cur);
    if (/(auto|scroll)/.test(overflowY) || /(auto|scroll)/.test(overflowX)) return cur;
  }
  return null;
}

export function FuturesWheel({
  cards,
  centerLabel,
  // Circle ids to pick out, and what to dim everything else to. Used by the drill-in,
  // where the point is one implication's path rather than the whole map.
  highlightIds,
  selectedId,
  variant = "map",
  nodeProps,
  nodeExtra,
  zoom = "fit",
  onFitScale,
}: {
  cards: RippleCard[];
  centerLabel: string;
  highlightIds?: Set<string>;
  // The one circle the drill-in was opened for. Drawn lime so it is findable at a glance
  // in a branch that may hold fifty others.
  selectedId?: string;
  // "map" is the whole Week 2 wheel: the scenario at the hub, every ring tinted by order.
  // "branch" is one key change's subtree, opened from the synthesis board to show where an
  // implication came from. There the hub IS the key change, so it takes the blue the
  // order tints would otherwise spend on the first ring — and the rings go neutral, so the
  // only accent left is the card the view was opened for.
  variant?: "map" | "branch";
  // Props spread onto each circle — drag wiring, click handlers, cursor. Returning nothing
  // leaves the circle inert, which is what the three read-only consumers get. The drag
  // vocabulary stays in ClusterBoard next to the drop zones rather than leaking in here.
  nodeProps?: (cardId: string) => React.HTMLAttributes<HTMLDivElement> & { draggable?: boolean };
  // A marker drawn under a circle — "in Theme 2", "not on this board".
  nodeExtra?: (cardId: string) => React.ReactNode;
  // "fit" shrinks the wheel to its container; a number is an explicit zoom. Dragging out
  // of a scaled container is fine — the browser hit-tests transformed geometry, which is
  // the same machinery native drag uses to decide what is under the pointer.
  zoom?: number | "fit";
  // Reports what "fit" resolved to, so a caller can zoom relative to what is on screen.
  onFitScale?: (scale: number) => void;
}) {
  const { nodes, links, size } = useMemo(() => layout(cards), [cards]);
  const cx = size / 2;
  const cy = size / 2;
  const branch = variant === "branch";

  // Equal-sized circles mean a wide map earns a big radius — Group 1's 146-node map comes
  // out at 2217px, which is unreadable inside a 1100px column and opens on a corner of
  // empty space. Scale the whole thing to whatever room there is instead; the circles stay
  // equal to each other, which is the thing that matters.
  const boxRef = useRef<HTMLDivElement | null>(null);
  // Held in a ref so a caller passing an inline arrow does not re-run the observer effect.
  // Assigned in an effect, not during render.
  const onFitScaleRef = useRef(onFitScale);
  useEffect(() => {
    onFitScaleRef.current = onFitScale;
  }, [onFitScale]);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const [fitScale, setFitScale] = useState(1);
  // Derived, not stored: an explicit zoom needs nothing measured.
  const scale = zoom === "fit" ? fitScale : zoom;
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    if (zoom !== "fit") return;
    const apply = () => {
      const next = Math.min(1, (el.clientWidth || size) / size);
      setFitScale(next);
      onFitScaleRef.current?.(next);
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [size, zoom]);

  // Open on the chain, not on the top-left corner. The chain runs radially from the hub to
  // the selected circle, so its middle is the midpoint of the two; put that at the centre
  // of whatever scrolls us — then make sure the selected circle itself is in view, for a
  // chain taller than the viewport. Runs again when the scale settles so the first paint
  // (scale 1, before the ResizeObserver fires) does not leave the scroll in the wrong place.
  useEffect(() => {
    if (!selectedId) return;
    const target = nodes.find((n) => n.id === selectedId);
    const inner = innerRef.current;
    const scroller = scrollParentOf(boxRef.current);
    if (!target || !inner || !scroller) return;

    // The inner box is transform-scaled from its top-left, so its on-screen origin is its
    // rect's top-left; a wheel coordinate maps to origin + coord * scale.
    const innerRect = inner.getBoundingClientRect();
    const scrollRect = scroller.getBoundingClientRect();
    const originLeft = innerRect.left - scrollRect.left + scroller.scrollLeft;
    const originTop = innerRect.top - scrollRect.top + scroller.scrollTop;

    const midX = originLeft + ((cx + target.x) / 2) * scale;
    const midY = originTop + ((cy + target.y) / 2) * scale;
    let left = midX - scroller.clientWidth / 2;
    let top = midY - scroller.clientHeight / 2;

    // Keep the selected circle (and its halo) inside the viewport, whatever the midpoint
    // asked for.
    const halo = (NODE_R + 8) * scale;
    const tx = originLeft + target.x * scale;
    const ty = originTop + target.y * scale;
    left = Math.min(left, tx - halo);
    left = Math.max(left, tx + halo - scroller.clientWidth);
    top = Math.min(top, ty - halo);
    top = Math.max(top, ty + halo - scroller.clientHeight);

    scroller.scrollTo({ left: Math.max(0, left), top: Math.max(0, top), behavior: "auto" });
  }, [selectedId, nodes, scale, cx, cy]);

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
        ref={innerRef}
        className="relative"
        style={{ width: size, height: size, transform: `scale(${scale})`, transformOrigin: "top left" }}
      >
        {/* Lines first, so every circle paints over them. They are also cut back to the
            rims (rimToRim), so nothing runs underneath a circle in the first place. */}
        <svg width={size} height={size} className="absolute inset-0" style={{ pointerEvents: "none" }}>
          {links.map((l) => {
            // On the picked-out path the line darkens with its circles, so the chain reads
            // as one lane rather than a row of lit circles on an unlit map.
            const onPath = highlightIds ? highlightIds.has(l.toId) : false;
            return (
              <line
                key={l.toId}
                x1={l.x1}
                y1={l.y1}
                x2={l.x2}
                y2={l.y2}
                stroke={onPath ? "var(--muted)" : "var(--hairline)"}
                strokeWidth={1.5}
              />
            );
          })}
        </svg>

        {branch ? (
          <WheelCircle x={cx} y={cy} r={HUB_R} bg="var(--blue)" fg="#fff" hub label={centerLabel || "This world"} />
        ) : (
          <WheelCircle x={cx} y={cy} r={HUB_R} bg="var(--lime)" border="var(--ink)" hub label={centerLabel || "This world"} />
        )}
        {nodes.map((n) => {
          const selected = n.id === selectedId;
          return (
            <WheelCircle
              key={n.id}
              x={n.x}
              y={n.y}
              r={NODE_R}
              bg={selected ? "var(--lime)" : "var(--card)"}
              border={selected ? "var(--ink)" : branch ? "var(--muted)" : rippleDepthColor(n.depth)}
              label={n.text}
              dim={highlightIds ? !highlightIds.has(n.id) : false}
              emphasis={selected}
              extra={nodeExtra?.(n.id)}
              {...(nodeProps?.(n.id) ?? {})}
            />
          );
        })}
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
  fg,
  border,
  label,
  hub,
  dim,
  emphasis,
  extra,
  ...rest
}: {
  x: number;
  y: number;
  r: number;
  bg: string;
  fg?: string;
  border?: string; // omitted = no border
  label: string;
  hub?: boolean;
  dim?: boolean;
  emphasis?: boolean;
  extra?: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  // Dimming is done in colour, not opacity. A translucent circle lets the line behind it
  // show through, which read as the lines being drawn on top of the map.
  const background = dim ? "var(--paper)" : bg;
  const color = dim ? "color-mix(in srgb, var(--ink) 40%, var(--paper))" : fg;
  const edge = dim ? "var(--hairline)" : border;
  const { className: extraClass = "", style: extraStyle, ...handlers } = rest;
  return (
    <div
      title={label}
      className={
        "absolute flex items-center justify-center rounded-full text-center shadow-[0_1px_0_rgba(36,36,34,0.08)] " +
        (emphasis ? "z-10 shadow-[0_0_0_6px_rgba(196,255,103,0.45)] " : "") +
        extraClass
      }
      style={{
        left: x - r,
        top: y - r,
        width: r * 2,
        height: r * 2,
        background,
        color,
        border: edge ? `${hub || emphasis ? 3 : 2}px solid ${edge}` : "none",
        ...extraStyle,
      }}
      {...handlers}
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
      {/* Sits under the circle, outside it, so it never eats the text. */}
      {extra && (
        <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-0.5 -translate-x-1/2 whitespace-nowrap">
          {extra}
        </span>
      )}
    </div>
  );
}
