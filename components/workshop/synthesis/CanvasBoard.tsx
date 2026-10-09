"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ZoomControls, orderColor, stepZoom, type Zoom } from "@/components/workshop/MapControls";
import {
  NODE_RADIUS as NODE_R,
  coveredBy,
  regionsAt,
  type CanvasCardPos,
  type CanvasItem,
  type Pos,
  type Rect,
  type Region,
} from "@/lib/canvas-shape";

// The freeform clustering surface — step 1's third view, beside Map and Cards.
//
// The gesture it exists for: shove implications into piles, draw a boundary round a pile,
// and that is a theme. CONTAINMENT IS MEMBERSHIP — a card whose centre sits inside a
// theme's region is in that theme, and dragging it clear of every region returns it to the
// tray. Overlapping regions therefore read as a Venn diagram: a card in two of them is in
// both themes, which is exactly what twin_key (0023) already models.
//
// What this component owns: geometry and the pointer state machine. What it does NOT own:
// any notion of twins, rows, or persistence. It reports "this card is now at (x, y) and
// these are the themes containing it" and the caller decides what to write — the same
// division as ThemeRail, which owns no drag logic and takes its vocabulary injected.
//
// Drag is POINTER EVENTS, and only here. The rail, tray, cards view and map keep the
// native HTML5 DnD they already use; free positioning needs continuous position feedback,
// which native drag does not give. The two systems never share an element — canvas nodes
// are not `draggable` and spread no dragProps — so there is nothing to arbitrate.

// How close to the viewport edge a drag has to get before the surface starts following.
// Native DnD auto-scrolls for free; pointer events do not, and Group 1's canvas is 2217px.
const EDGE = 48;
const EDGE_SPEED = 18;

export interface CanvasNode {
  // implicationKey — one circle per implication, however many rows back it.
  key: string;
  label: string;
  // Ripple order, for the colour. 0 = a key change.
  depth: number;
  // The themes it currently sits in, in board order.
  themeIds: string[];
  // Filtered out by the order chips: shown, but faded and inert.
  dim?: boolean;
}

type Mode =
  | { kind: "idle" }
  | { kind: "pan"; fromX: number; fromY: number; scrollX: number; scrollY: number }
  | { kind: "marquee"; from: Pos; to: Pos }
  | { kind: "drag"; key: string; pos: Pos; dx: number; dy: number; themes: string[] };

export function CanvasBoard({
  nodes,
  positions,
  regions,
  themeLabel,
  memberCount,
  width,
  height,
  editable,
  onHold,
  onDropCard,
  onDrawRegion,
  onSpreadOut,
  trailing,
  nodeProps,
}: {
  nodes: CanvasNode[];
  // Already merged by the caller: server rows, optimistic overlay, and the fallback ladder.
  positions: Map<string, Pos>;
  regions: Map<string, Region>;
  themeLabel: (themeId: string) => string;
  memberCount: (themeId: string) => number;
  // The surface's extent in model pixels. Width and height are independent: the board is
  // a pile with a band of theme boxes under it, not a square, and squaring it off would
  // waste most of the viewport.
  width: number;
  height: number;
  editable: boolean;
  // Pointer-down tier: the caller holds this card still against incoming realtime.
  onHold: (key: string, pos: Pos | null) => void;
  onDropCard: (key: string, pos: Pos, inThemeIds: string[]) => void;
  // The claimed cards come back WITH their positions, so the box is recorded around them
  // where they already are. Without that, cards still sitting at a fallback position
  // would jump to packed seats the moment the theme existed.
  onDrawRegion: (rect: Rect, claimed: CanvasCardPos[]) => void;
  onSpreadOut: () => void;
  // Pinned right on the toolbar row: state about the surface, not about the view.
  trailing?: React.ReactNode;
  nodeProps?: (key: string) => React.HTMLAttributes<HTMLDivElement>;
}) {
  const [zoom, setZoom] = useState<Zoom>("fit");
  const [fitScale, setFitScale] = useState(1);
  const [mode, setMode] = useState<Mode>({ kind: "idle" });
  // Drawing a region is an ARMED one-shot button rather than a modifier key, because a
  // background drag is otherwise ambiguous with panning — and an iPad has no modifiers.
  const [armed, setArmed] = useState(false);

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const edgeRef = useRef<Pos | null>(null);

  const scale = typeof zoom === "number" ? zoom : fitScale;
  const regionList = useMemo(() => [...regions.values()], [regions]);

  // Zoom-to-fit, measured rather than assumed. Unlike the wheel's, this fits BOTH
  // dimensions: the whole point of opening the canvas is seeing the pile and the theme
  // boxes at once, and a width-only fit drops the boxes below the fold. The scroller has
  // a fixed height rather than a max-height so this measurement cannot chase itself.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const measure = () =>
      setFitScale(
        Math.min(1, (el.clientWidth || width) / width, (el.clientHeight || height) / height)
      );
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width, height]);

  // Model space, always. Converting the pointer once and doing the arithmetic against
  // stored x/y/w/h is the only way the geometry and the database agree at a region's
  // boundary; hit-testing through the DOM under a fractional scale() does not.
  const toModel = useCallback(
    (clientX: number, clientY: number): Pos => {
      const r = boxRef.current?.getBoundingClientRect();
      if (!r) return { x: 0, y: 0 };
      return { x: (clientX - r.left) / scale, y: (clientY - r.top) / scale };
    },
    [scale]
  );

  const dimmed = useMemo(
    () => new Set(nodes.filter((n) => n.dim).map((n) => n.key)),
    [nodes]
  );

  const items: CanvasItem[] = useMemo(
    () =>
      nodes.map((n) => {
        const p = positions.get(n.key) ?? { x: 0, y: 0 };
        return { key: n.key, x: p.x, y: p.y, w: NODE_R * 2, h: NODE_R * 2 };
      }),
    [nodes, positions]
  );

  // Follow the pointer when a drag reaches the edge of the viewport.
  useEffect(() => {
    if (mode.kind !== "drag") {
      edgeRef.current = null;
      return;
    }
    let raf = 0;
    const tick = () => {
      const el = scrollerRef.current;
      const at = edgeRef.current;
      if (el && at) {
        const r = el.getBoundingClientRect();
        let dx = 0;
        let dy = 0;
        if (at.x - r.left < EDGE) dx = -EDGE_SPEED;
        else if (r.right - at.x < EDGE) dx = EDGE_SPEED;
        if (at.y - r.top < EDGE) dy = -EDGE_SPEED;
        else if (r.bottom - at.y < EDGE) dy = EDGE_SPEED;
        if (dx || dy) el.scrollBy({ left: dx, top: dy });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mode.kind]);

  // ---------------- node drag ----------------

  const startDrag = (n: CanvasNode) => (e: React.PointerEvent<HTMLDivElement>) => {
    // Secondary buttons and second fingers are not drags. Without the isPrimary guard a
    // second finger starts a competing drag of the same card.
    if (!editable || n.dim || e.button !== 0 || !e.isPrimary) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const pt = toModel(e.clientX, e.clientY);
    const at = positions.get(n.key) ?? pt;
    setMode({
      kind: "drag",
      key: n.key,
      pos: at,
      dx: pt.x - at.x,
      dy: pt.y - at.y,
      themes: n.themeIds,
    });
    onHold(n.key, at);
  };

  const moveDrag = (n: CanvasNode) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (mode.kind !== "drag" || mode.key !== n.key) return;
    const pt = toModel(e.clientX, e.clientY);
    const pos = { x: pt.x - mode.dx, y: pt.y - mode.dy };
    edgeRef.current = { x: e.clientX, y: e.clientY };
    // Hysteresis lives in regionsAt: leaving a region takes more travel than arriving,
    // because leaving is the destructive direction.
    const themes = regionsAt(regionList, pos, new Set(n.themeIds));
    setMode({ ...mode, pos, themes });
    onHold(n.key, pos);
  };

  const endDrag = (n: CanvasNode) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (mode.kind !== "drag" || mode.key !== n.key) return;
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    onDropCard(n.key, mode.pos, mode.themes);
    onHold(n.key, null);
    setMode({ kind: "idle" });
  };

  // pointercancel is a first-class exit, not an afterthought: iOS fires it when the system
  // takes the gesture over (scroll handoff, the long-press callout, a second finger), and
  // a state machine that only handles pointerup leaves the card stuck to the finger.
  const cancelDrag = (n: CanvasNode) => () => {
    if (mode.kind !== "drag" || mode.key !== n.key) return;
    onHold(n.key, null);
    setMode({ kind: "idle" });
  };

  // ---------------- background: pan, or marquee when armed ----------------

  const startBackground = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !e.isPrimary) return;
    const el = scrollerRef.current;
    if (armed && editable) {
      e.currentTarget.setPointerCapture(e.pointerId);
      const at = toModel(e.clientX, e.clientY);
      setMode({ kind: "marquee", from: at, to: at });
      return;
    }
    if (!el) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setMode({
      kind: "pan",
      fromX: e.clientX,
      fromY: e.clientY,
      scrollX: el.scrollLeft,
      scrollY: el.scrollTop,
    });
  };

  const moveBackground = (e: React.PointerEvent<HTMLDivElement>) => {
    if (mode.kind === "marquee") {
      setMode({ ...mode, to: toModel(e.clientX, e.clientY) });
      return;
    }
    if (mode.kind === "pan") {
      const el = scrollerRef.current;
      if (!el) return;
      el.scrollLeft = mode.scrollX - (e.clientX - mode.fromX);
      el.scrollTop = mode.scrollY - (e.clientY - mode.fromY);
    }
  };

  const endBackground = () => {
    if (mode.kind === "marquee") {
      const r = rectOf(mode.from, mode.to);
      // A tap, not a box. Don't mint a theme from a stray click.
      if (r.w > 8 && r.h > 8) {
        const live = items.filter((it) => !dimmed.has(it.key));
        // The >=50%-coverage rule for SELECTION, which is what a Miro-trained hand expects
        // from a box: clipping a corner does not take a card, covering most of it does.
        // Membership afterwards is the centre-point test.
        const taken = new Set(coveredBy(r, live));
        onDrawRegion(
          r,
          live.filter((it) => taken.has(it.key)).map((it) => ({ itemId: it.key, x: it.x, y: it.y }))
        );
      }
      setArmed(false);
    }
    setMode({ kind: "idle" });
  };

  const marquee = mode.kind === "marquee" ? rectOf(mode.from, mode.to) : null;

  return (
    <div>
      {/* One flat row. The zoom cluster is spread in directly rather than nesting
          MapToolbar, whose own container carries a margin — align-items centres a flex
          item's MARGIN box, so nesting it sat the zoom controls above these buttons. */}
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <ZoomControls
          zoom={zoom}
          onZoom={(dir) =>
            setZoom(dir === "fit" ? "fit" : (z) => stepZoom(z, dir, fitScale || 1))
          }
        />
        {editable && (
          <>
            <button
              onClick={() => setArmed((a) => !a)}
              aria-pressed={armed}
              className={
                "rounded-[2px] border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] " +
                (armed
                  ? "border-ink bg-ink text-paper"
                  : "border-[var(--rule)] bg-paper text-muted hover:border-ink hover:text-ink")
              }
            >
              {armed ? "Drag a box…" : "＋ Draw a theme"}
            </button>
            <button
              onClick={onSpreadOut}
              title="Lay the visible implications out on a grid, so there is room to sort them"
              className="rounded-[2px] border border-[var(--rule)] bg-paper px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] text-muted hover:border-ink hover:text-ink"
            >
              Spread out
            </button>
          </>
        )}
        {trailing && <span className="ml-auto flex items-center gap-2">{trailing}</span>}
      </div>

      <div
        ref={scrollerRef}
        className="relative h-[70vh] select-none overflow-auto rounded-[3px] border border-[var(--rule)] bg-board"
        style={{ WebkitTouchCallout: "none" as React.CSSProperties["WebkitTouchCallout"] }}
      >
        <div style={{ width: width * scale, height: height * scale }}>
          <div
            ref={boxRef}
            onPointerDown={startBackground}
            onPointerMove={moveBackground}
            onPointerUp={endBackground}
            onPointerCancel={endBackground}
            className="relative"
            style={{
              width,
              height,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
              cursor: armed ? "crosshair" : mode.kind === "pan" ? "grabbing" : "grab",
            }}
          >
            {/* Regions sit under the nodes and take no pointer events: in this version a
                box only ever changes by cards moving, never by being moved or resized —
                which is what makes it impossible for the picture to drift from the data. */}
            {regionList.map((r) => (
              <div
                key={r.themeId}
                className="pointer-events-none absolute rounded-[6px] border-2 border-dashed"
                style={{
                  left: r.x,
                  top: r.y,
                  width: r.w,
                  height: r.h,
                  borderColor: "var(--rule)",
                  background: "color-mix(in srgb, var(--lime) 14%, var(--card))",
                  borderRadius: r.shape === "ellipse" ? "50%" : undefined,
                }}
              >
                <span className="absolute -top-[9px] left-2 bg-paper px-1 text-[10px] font-bold uppercase tracking-[0.05em] text-muted">
                  {themeLabel(r.themeId)}
                  {/* Its real membership, which can exceed the circles drawn inside it:
                      an implication sitting in two themes is still ONE circle, and that
                      circle can only be in one box at a time. Saying the number is what
                      stops a box that is short a twin from looking like a bug. */}
                  {memberCount(r.themeId) > 0 && (
                    <span className="ml-1 font-normal">· {memberCount(r.themeId)}</span>
                  )}
                </span>
              </div>
            ))}

            {nodes.map((n) => {
              const p = positions.get(n.key);
              if (!p) return null;
              const dragging = mode.kind === "drag" && mode.key === n.key;
              const showThemes = dragging ? mode.themes : n.themeIds;
              return (
                <div
                  key={n.key}
                  title={n.label}
                  onPointerDown={startDrag(n)}
                  onPointerMove={moveDrag(n)}
                  onPointerUp={endDrag(n)}
                  onPointerCancel={cancelDrag(n)}
                  // A text node inside a non-draggable div is still natively draggable in
                  // Firefox, which would start an HTML5 drag mid-pointer-drag.
                  onDragStart={(e) => e.preventDefault()}
                  className={
                    "absolute flex items-center justify-center rounded-full text-center shadow-[0_1px_0_rgba(36,36,34,0.08)] " +
                    (dragging ? "z-30" : "hover:z-20")
                  }
                  style={{
                    left: p.x - NODE_R,
                    top: p.y - NODE_R,
                    width: NODE_R * 2,
                    height: NODE_R * 2,
                    background: n.dim ? "var(--paper)" : orderColor(n.depth),
                    color: n.dim ? "color-mix(in srgb, var(--ink) 40%, var(--paper))" : "#fff",
                    border: `2px solid ${n.dim ? "var(--hairline)" : "transparent"}`,
                    boxShadow: showThemes.length ? "0 0 0 3px var(--ink)" : undefined,
                    opacity: n.dim ? 0.45 : 1,
                    // Only on the NODES. Put it on the scroller and a dense board makes
                    // nearly every pixel a card, so the canvas could not be scrolled by
                    // finger at all — a one-finger background drag has to stay native.
                    touchAction: "none",
                    cursor: !editable || n.dim ? "default" : dragging ? "grabbing" : "grab",
                  }}
                  {...(nodeProps?.(n.key) ?? {})}
                >
                  <span
                    className="px-2 text-[10px] leading-[1.12]"
                    style={{
                      display: "-webkit-box",
                      WebkitLineClamp: 4,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {n.label}
                  </span>
                  {/* The consequence, before you let go. The twin mechanic is the
                      cleverest thing here and the most invisible; this is what makes a
                      drop into an overlap legible rather than magic. */}
                  {!dragging && n.themeIds.length > 1 && (
                    <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-0.5 -translate-x-1/2 whitespace-nowrap text-[9px] font-bold uppercase tracking-[0.05em] text-muted">
                      also in {n.themeIds.slice(1).map(themeLabel).join(", ")}
                    </span>
                  )}
                  {dragging && showThemes.length > 0 && (
                    <span className="pointer-events-none absolute left-1/2 top-full z-40 mt-1 -translate-x-1/2 whitespace-nowrap rounded-[2px] bg-ink px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.05em] text-paper">
                      {showThemes.map(themeLabel).join(" · ")}
                    </span>
                  )}
                </div>
              );
            })}

            {marquee && (
              <div
                className="pointer-events-none absolute border-2 border-ink"
                style={{
                  left: marquee.x,
                  top: marquee.y,
                  width: marquee.w,
                  height: marquee.h,
                  background: "color-mix(in srgb, var(--blue) 12%, transparent)",
                }}
              />
            )}
          </div>
        </div>
      </div>

      <p className="mt-1.5 text-[11px] leading-snug text-muted">
        Drag an implication anywhere. A card inside a theme&rsquo;s box belongs to that
        theme; inside two overlapping boxes, it belongs to both. Drag it clear of every box
        to send it back to the tray.
      </p>
    </div>
  );
}

function rectOf(a: Pos, b: Pos): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  };
}
