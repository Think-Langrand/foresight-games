"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { type RippleCard } from "@/lib/ripples-types";
import { rippleDepthColor } from "@/components/workshop/RippleCard";
import { HUB_R, NODE_R, layout } from "@/lib/wheel-layout";

// A "futures wheel": the scenario sits at the hub, the key changes ring it, and each
// further order of implication radiates outward on its own ring. The weighted radial
// layout itself lives in lib/wheel-layout.ts, because the Session 3 clustering canvas
// seeds its opening positions from the same geometry.

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
  ringFor,
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
  // A coloured ring around a circle — the synthesis board colours every node by its order
  // and picks out a selection. `depth` is the ring index (0 = the first ring drawn).
  ringFor?: (cardId: string, depth: number) => { color: string; width?: number } | null | undefined;
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
            // On the picked-out path the line takes the trail's blue AND thickens with
            // its circles, so the chain reads as one lane rather than a row of lit circles
            // on an unlit map. Muted at the same 1.5px was nearly the hairline it was
            // meant to beat.
            const onPath = highlightIds ? highlightIds.has(l.toId) : false;
            return (
              <line
                key={l.toId}
                x1={l.x1}
                y1={l.y1}
                x2={l.x2}
                y2={l.y2}
                stroke={onPath ? "var(--blue)" : "var(--hairline)"}
                strokeWidth={onPath ? 3 : 1.5}
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
          // A step on the trail to the selected circle. It keeps full-strength text while
          // the rest of the map dims, and takes a pale BLUE fill and a blue edge so the
          // chain is visible as a shape before any of it is read — "which lane is this on"
          // is the question the trail is answering.
          //
          // Blue, not lime: lime is this board's "theme" colour — the theme tint, the open
          // theme's square, a hit in the open theme's ring — so a lime trail read as "these
          // belong to the theme", which is a different claim entirely.
          const onPath = highlightIds ? highlightIds.has(n.id) : false;
          return (
            <WheelCircle
              key={n.id}
              x={n.x}
              y={n.y}
              r={NODE_R}
              bg={
                selected
                  ? "rgba(39,93,226,0.30)"
                  : onPath
                    ? "rgba(39,93,226,0.12)"
                    : "var(--card)"
              }
              border={
                selected || onPath
                  ? "var(--blue)"
                  : branch
                    ? "var(--muted)"
                    : rippleDepthColor(n.depth)
              }
              label={n.text}
              dim={highlightIds ? !onPath : false}
              emphasis={selected}
              ring={ringFor?.(n.id, n.depth) ?? null}
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
  ring,
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
  // A ring outside the border, in its own colour. Drawn as a box-shadow so it costs no
  // layout and sits outside the circle's edge; the emphasis glow stacks outside it.
  ring?: { color: string; width?: number } | null;
  extra?: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  // Dimming is done in colour, not opacity. A translucent circle lets the line behind it
  // show through, which read as the lines being drawn on top of the map.
  const background = dim ? "var(--paper)" : bg;
  const color = dim ? "color-mix(in srgb, var(--ink) 40%, var(--paper))" : fg;
  const edge = dim ? "var(--hairline)" : border;
  const ringWidth = ring?.width ?? 3;
  const shadow = ring
    ? emphasis
      ? `0 0 0 ${ringWidth}px ${ring.color}, 0 0 0 ${ringWidth + 6}px rgba(39,93,226,0.30)`
      : `0 0 0 ${ringWidth}px ${ring.color}`
    : undefined;
  const { className: extraClass = "", style: extraStyle, ...handlers } = rest;
  return (
    <div
      title={label}
      className={
        // Crowded rings overlap. The circle under the pointer rises above its neighbours
        // and grows a step, so what you are about to grab is never in doubt.
        "absolute flex items-center justify-center rounded-full text-center shadow-[0_1px_0_rgba(36,36,34,0.08)] transition-transform duration-100 hover:z-20 hover:scale-105 " +
        (emphasis ? "z-10 shadow-[0_0_0_6px_rgba(39,93,226,0.30)] " : "") +
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
        ...(shadow ? { boxShadow: shadow } : {}),
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
