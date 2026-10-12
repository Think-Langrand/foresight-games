"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CARD_TEXT_MAX } from "@/lib/ripples-types";
import { ZoomControls, orderColor, stepZoom, type Zoom } from "@/components/workshop/MapControls";
import {
  NODE_RADIUS as NODE_R,
  blockers,
  cardsInRegion,
  containsPoint,
  containsRect,
  coveredBy,
  REGION_CLEARANCE,
  rectsOverlap,
  regionsAt,
  resizeFloor,
  resizeTo,
  type CanvasCardPos,
  type CanvasItem,
  type Corner,
  type PileLabel,
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

// Is "Spread out" offered? It lays the visible implications on a grid that misses every
// theme box — room to sort, when the wheel's packing is too dense to grab one card from.
// Hidden for now: a board that opens with its themes already boxed has somewhere to drag
// to, and the gesture turned out to be one more thing on a toolbar rather than one people
// reached for. Hidden rather than cut — onSpreadOut, freeGrid and their tests are all
// untouched, so this is one word to put back.
const SHOW_SPREAD_OUT = false;

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
  | { kind: "marquee"; from: Pos; to: Pos; blocked: string[] }
  | { kind: "drag"; key: string; pos: Pos; dx: number; dy: number; themes: string[] }
  // Moving or resizing a theme's box. `shown` is where it is DRAWN this frame — always
  // under the pointer — and `legal` is the last position that tested legal. Keeping the
  // two apart is what lets a blocked gesture say so instead of sticking, and it is also
  // the one-line switch to a hard clamp if the settle ever reads as a teleport.
  | {
      kind: "movebox";
      themeId: string;
      origin: Region;
      grab: Pos;
      shown: Pos;
      legal: Pos;
      blocked: string[];
      // Overlaps inherited at pointerdown, so a box drawn over another before the rule
      // existed is still movable. See `blockers`.
      tolerated: Set<string>;
      // Frozen at pointerdown: recomputing per frame would make the result depend on the
      // path the pointer took.
      travellers: string[];
      loose: CanvasItem[];
      adopt: string[];
    }
  | {
      kind: "sizebox";
      themeId: string;
      corner: Corner;
      origin: Region;
      shown: Region;
      legal: Region;
      blocked: string[];
      below: boolean;
      // Computed once at pointerdown — members do not move during a resize.
      floor: Rect | null;
      tolerated: Set<string>;
      loose: CanvasItem[];
      adopt: string[];
    };

const NO_IDS: ReadonlySet<string> = new Set();

// A theme's name, typed in its own label strip.
//
// A component of its own, at the top of the file, because it holds a DRAFT: a function
// nested in the render would be a new component type on every pass, and the board rebuilds
// on every realtime message — which would throw away a half-typed name mid-sentence. The
// same reason ImplicationTree and ClusterBoard carry the warning.
//
// Everything inside the scaled surface is sized in inverse scale, this included: at a Fit
// of 0.3 a 14px field inks at 4px and cannot be typed into.
//
// It GROWS UPWARD. The names groups write are sentences, so the field is two lines before
// anyone has typed anything and more as they go — and the strip sits on the box's top
// edge, so a field growing down would lie across the implications inside, which are the
// thing being named. Anchored by its bottom instead, it opens into the air above the box.
function RegionName({
  text,
  scale,
  width,
  onCommit,
  onCancel,
}: {
  text: string;
  scale: number;
  width: number;
  onCommit: (next: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(text);
  const ref = useRef<HTMLTextAreaElement | null>(null);

  // Focused and selected on arrival: the ✎ is a single click and the next thing people do
  // is type, so a rename of an existing name replaces it rather than appending to it.
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  // Two lines to start, and as many as the name needs. Measured off the draft rather than
  // the element, because the element is under a fractional scale() and scrollHeight there
  // is not a number worth trusting.
  const rows = Math.min(5, Math.max(2, Math.ceil(draft.length / Math.max(12, width / (9 / scale)))));

  return (
    <textarea
      ref={ref}
      value={draft}
      rows={rows}
      maxLength={CARD_TEXT_MAX}
      placeholder="What is this theme about?"
      onChange={(e) => setDraft(e.target.value)}
      // The surface captures the pointer for a marquee and the strip for a move; either
      // would mean the caret cannot be placed or a word cannot be selected by dragging
      // across it. Clicks inside a field are nobody else's business.
      onPointerDown={(e) => e.stopPropagation()}
      onPointerMove={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onBlur={() => onCommit(draft.trim())}
      onKeyDown={(e) => {
        // Enter commits: a theme name is one thought, and the field is several lines so it
        // can be READ, not so it can hold paragraphs. Shift+Enter is the escape hatch.
        // Escape abandons, and the Escape the board listens for must not also fire.
        e.stopPropagation();
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          onCommit(draft.trim());
        } else if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
      style={{
        // Anchored by its BOTTOM to where the one-line strip sits, so the extra lines go
        // up into the air above the box instead of down over its contents.
        position: "absolute",
        bottom: 0,
        left: 0,
        width,
        display: "block",
        resize: "none",
        font: "inherit",
        lineHeight: 1.3,
        letterSpacing: "inherit",
        textTransform: "none",
        color: "var(--ink)",
        background: "var(--paper)",
        border: `${1.5 / scale}px solid var(--ink)`,
        borderRadius: 2 / scale,
        padding: `${2 / scale}px ${4 / scale}px`,
        outline: "none",
        pointerEvents: "auto",
        touchAction: "auto",
        cursor: "text",
      }}
    />
  );
}

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
  onGather,
  clumps,
  onDismissClump,
  movable,
  onOpenTheme,
  themeName,
  onRenameTheme,
  onMoveRegion,
  onResizeRegion,
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
  onGather: () => void;
  // Captions over the piles, derived by the caller. Nothing is stored, so they cannot go
  // stale — they follow the cards and disappear when a pile is broken up.
  clumps: PileLabel[];
  onDismissClump: (groupId: string) => void;
  // A box can only be grabbed once its region row is REAL. A box that is still only
  // derived has nothing to write to, an adoption write in flight that would overwrite
  // anything we wrote, and a position two clients do not yet agree on.
  movable: (themeId: string) => boolean;
  // `moved` carries every traveller's new position; `adopt` is the loose cards the box
  // has come to sit over, which are the only membership change a move can make.
  onMoveRegion: (region: Region, moved: CanvasCardPos[], adopt: string[]) => void;
  // No card rows: a resize does not move anybody.
  onResizeRegion: (region: Region, adopt: string[]) => void;
  // Open this theme on its own — the sheet where it is named and read. The canvas is
  // where a theme is BUILT and the sheet is where it is said, and until this existed the
  // only way across was a square in a rail on the other side of the screen.
  onOpenTheme?: (themeId: string) => void;
  // Naming a theme without leaving the board. Half of what step 1 asks for is the name,
  // and the box's own label is where people look for it — opening the sheet to type it was
  // a detour out of the thing they are arranging. The sheet still has the field; this is
  // the same write from the other end.
  onRenameTheme?: (themeId: string, text: string) => void;
  // The theme's name as STORED — blank for one nobody has named. Separate from themeLabel,
  // which answers "what do we call this on screen" and falls back to the position; this
  // answers "what is in the field", and the two must not be confused when editing it.
  themeName?: (themeId: string) => string;
  // Pinned right on the toolbar row: state about the surface, not about the view.
  trailing?: React.ReactNode;
  nodeProps?: (key: string) => React.HTMLAttributes<HTMLDivElement>;
}) {
  const [zoom, setZoom] = useState<Zoom>("fit");
  const [fitScale, setFitScale] = useState(1);
  const [mode, setMode] = useState<Mode>({ kind: "idle" });
  // Which box's label is being typed into, if any. Not part of `mode`: that union is the
  // pointer state machine, and renaming is a keyboard thing that deliberately takes the
  // box OUT of that machine for as long as it lasts.
  const [renaming, setRenaming] = useState<string | null>(null);

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
    if (mode.kind !== "drag" && mode.kind !== "movebox" && mode.kind !== "sizebox") {
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
    // Clamped onto the surface, the same way a box move is. The surface has no negative
    // space and the scroller cannot scroll past its origin, so a card dragged off the top
    // or left — which edge auto-scroll makes easy to do by accident — would be drawn
    // outside the scrollable area and could never be grabbed again.
    const pos = {
      x: Math.max(NODE_R, pt.x - mode.dx),
      y: Math.max(NODE_R, pt.y - mode.dy),
    };
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

  // ---------------- moving and resizing a box ----------------
  //
  // Both gestures are membership-SAFE by construction. A box can never overlap another,
  // so moving one cannot carry a card out of a neighbour; a box can never shrink past its
  // own members, so resizing cannot leave one outside. The only membership change either
  // can make is additive — the loose cards the box has come to sit over.

  const looseKeys = useMemo(
    () => new Set(nodes.filter((n) => n.themeIds.length === 0).map((n) => n.key)),
    [nodes]
  );
  const looseItems = () => items.filter((it) => looseKeys.has(it.key));

  const grab = (e: React.PointerEvent<HTMLDivElement>) => {
    // Mandatory: the pan and marquee handlers are on the ancestor, so without this a grab
    // also starts a pan underneath.
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const letGo = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const startMove = (r: Region) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (!editable || !movable(r.themeId) || e.button !== 0 || !e.isPrimary) return;
    grab(e);
    const pt = toModel(e.clientX, e.clientY);
    setMode({
      kind: "movebox",
      themeId: r.themeId,
      origin: r,
      grab: { x: pt.x - r.x, y: pt.y - r.y },
      shown: { x: r.x, y: r.y },
      legal: { x: r.x, y: r.y },
      blocked: [],
      tolerated: new Set(blockers(r, regionList, NO_IDS)),
      travellers: cardsInRegion(r, items),
      loose: looseItems(),
      adopt: [],
    });
  };

  const moveBox = (e: React.PointerEvent<HTMLDivElement>) => {
    if (mode.kind !== "movebox") return;
    e.stopPropagation();
    const pt = toModel(e.clientX, e.clientY);
    // Clamped at the origin: the surface has no negative space, and a box dragged past it
    // is drawn outside the scroll area and can never be grabbed again.
    const shown = { x: Math.max(0, pt.x - mode.grab.x), y: Math.max(0, pt.y - mode.grab.y) };
    const hits = blockers({ ...mode.origin, ...shown }, regionList, mode.tolerated);
    const legal = hits.length === 0 ? shown : mode.legal;
    edgeRef.current = { x: e.clientX, y: e.clientY };
    setMode({
      ...mode,
      shown,
      legal,
      blocked: hits,
      // From `legal`, never `shown`: the preview has to describe what will be committed.
      adopt: cardsInRegion({ ...mode.origin, ...legal }, mode.loose),
    });
  };

  const endMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (mode.kind !== "movebox") return;
    letGo(e);
    const { origin, legal, travellers, adopt } = mode;
    setMode({ kind: "idle" });
    // A mis-grab, a drag blocked the whole way, or the press half of a double-click on the
    // label, must not rewrite forty rows. Measured on SCREEN, where the hand is: a couple
    // of model pixels at Fit 0.3 is a third of a pixel to the person doing it, and nobody
    // moves a theme by three pixels on purpose.
    if (Math.hypot(legal.x - origin.x, legal.y - origin.y) * scale < 3) return;
    const dx = legal.x - origin.x;
    const dy = legal.y - origin.y;
    onMoveRegion(
      { ...origin, ...legal },
      travellers
        .map((key) => {
          const at = positions.get(key);
          return at ? { itemId: key, x: at.x + dx, y: at.y + dy } : null;
        })
        .filter((v): v is CanvasCardPos => v !== null),
      adopt
    );
  };

  const startSize = (r: Region, corner: Corner) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (!editable || !movable(r.themeId) || e.button !== 0 || !e.isPrimary) return;
    grab(e);
    // Only this theme's OWN members hold the floor. A card drawn in this box while
    // belonging to another theme is a twin seated elsewhere — it travels, but it must not
    // stop this box being made smaller.
    const mine = new Set(
      nodes.filter((n) => n.themeIds.includes(r.themeId)).map((n) => n.key)
    );
    const members = items.filter((it) => mine.has(it.key) && containsPoint(r, it));
    setMode({
      kind: "sizebox",
      themeId: r.themeId,
      corner,
      origin: r,
      shown: r,
      legal: r,
      blocked: [],
      below: false,
      floor: resizeFloor(r, members),
      tolerated: new Set(blockers(r, regionList, NO_IDS)),
      loose: looseItems(),
      adopt: [],
    });
  };

  const sizeBox = (e: React.PointerEvent<HTMLDivElement>) => {
    if (mode.kind !== "sizebox") return;
    e.stopPropagation();
    const shown = resizeTo(mode.origin, mode.corner, toModel(e.clientX, e.clientY));
    const hits = blockers(shown, regionList, mode.tolerated);
    const below = mode.floor !== null && !containsRect(shown, mode.floor);
    const legal = hits.length === 0 && !below ? shown : mode.legal;
    edgeRef.current = { x: e.clientX, y: e.clientY };
    setMode({
      ...mode,
      shown,
      legal,
      blocked: hits,
      below,
      adopt: cardsInRegion(legal, mode.loose),
    });
  };

  const endSize = (e: React.PointerEvent<HTMLDivElement>) => {
    if (mode.kind !== "sizebox") return;
    letGo(e);
    const { origin, legal, adopt } = mode;
    setMode({ kind: "idle" });
    if (legal.x === origin.x && legal.y === origin.y && legal.w === origin.w && legal.h === origin.h) {
      return;
    }
    onResizeRegion(legal, adopt);
  };

  // pointercancel commits NOTHING. iOS fires it for the long-press callout, a second
  // finger, or scroll handoff, and a forty-row write nobody released is the worst thing
  // this gesture could do.
  const abandonBox = () => {
    if (mode.kind === "movebox" || mode.kind === "sizebox") setMode({ kind: "idle" });
  };

  // ---------------- background: draw a theme, or pan ----------------

  // Press and drag on empty canvas to draw a theme. No arming step: making a theme is the
  // thing this surface is for, and a button you had to press first made it two gestures.
  //
  // That takes the background drag away from panning, so panning moves to the scroller
  // itself — two-finger scroll, the wheel, the scrollbars — plus a middle-button drag for
  // a mouse. A finger on a touch screen still pans natively, because touch-action is set
  // on the cards and boxes only and never on the surface.
  const startBackground = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.isPrimary) return;
    const el = scrollerRef.current;

    const pan = () => {
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

    // Middle button pans. So does any drag for someone who cannot edit — there is nothing
    // for them to draw, and the board should still be navigable.
    if (e.button === 1 || !editable) {
      if (e.button === 1) e.preventDefault(); // or the browser starts its own autoscroll
      pan();
      return;
    }
    if (e.button !== 0) return;

    e.currentTarget.setPointerCapture(e.pointerId);
    const at = toModel(e.clientX, e.clientY);
    setMode({ kind: "marquee", from: at, to: at, blocked: [] });
  };

  const moveBackground = (e: React.PointerEvent<HTMLDivElement>) => {
    if (mode.kind === "marquee") {
      const to = toModel(e.clientX, e.clientY);
      // Boxes never overlap, and a drawn box is a box: refusing here rather than at the
      // drop is what stops a theme being minted somewhere it cannot legally sit.
      const r = rectOf(mode.from, to);
      setMode({
        ...mode,
        to,
        blocked: regionList
          .filter((x) => rectsOverlap(r, x, REGION_CLEARANCE))
          .map((x) => x.themeId),
      });
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
      // A tap or a twitch, not a box. The threshold is higher than it was now that every
      // background drag draws: a few stray pixels on the way to clicking something should
      // never mint a theme. And never over another
      // box — the overlap rule has to hold for the gesture that CREATES boxes too, or the
      // board can be put back into a state move and resize forbid.
      if (r.w > 24 && r.h > 24 && mode.blocked.length === 0) {
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
    }
    setMode({ kind: "idle" });
  };

  // A cancel is never a commit. On a touch screen the browser fires pointercancel when it
  // takes a drag over for native scrolling, so treating it as a release would mint a theme
  // out of an attempt to pan.
  const abandonBackground = () => {
    if (mode.kind === "marquee" || mode.kind === "pan") setMode({ kind: "idle" });
  };

  const marquee = mode.kind === "marquee" ? rectOf(mode.from, mode.to) : null;
  const travelling = mode.kind === "movebox" ? new Set(mode.travellers) : null;
  const travelDelta =
    mode.kind === "movebox"
      ? { x: mode.shown.x - mode.origin.x, y: mode.shown.y - mode.origin.y }
      : null;

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
              onClick={onGather}
              title="Bring the loose implications back together by key change — shows every key change"
              className="rounded-[2px] border border-[var(--rule)] bg-paper px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] text-muted hover:border-ink hover:text-ink"
            >
              Gather
            </button>
            {SHOW_SPREAD_OUT && (
              <button
                onClick={onSpreadOut}
                title="Lay the visible implications out on a grid, so there is room to sort them"
                className="rounded-[2px] border border-[var(--rule)] bg-paper px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] text-muted hover:border-ink hover:text-ink"
              >
                Spread out
              </button>
            )}
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
            onPointerCancel={abandonBackground}
            className="relative"
            style={{
              width,
              height,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
              // A plain finger over the surface, not a grab hand. `grab` is reserved for
              // the things that actually take a grab — a circle and a box's grip — so the
              // cursor says what is under it rather than announcing that the whole board
              // is draggable. Dragging the background still pans, hence `grabbing` while
              // it is actually happening.
              cursor:
                mode.kind === "marquee"
                  ? "crosshair"
                  : mode.kind === "pan"
                    ? "grabbing"
                    : "pointer",
            }}
          >
            {/* Regions sit under the nodes and take no pointer events: in this version a
                box only ever changes by cards moving, never by being moved or resized —
                which is what makes it impossible for the picture to drift from the data. */}
            {regionList.map((r) => {
              // The box mid-gesture, if it is this one.
              const live =
                (mode.kind === "movebox" || mode.kind === "sizebox") && mode.themeId === r.themeId
                  ? mode
                  : null;
              const shown: Region =
                live === null
                  ? r
                  : live.kind === "movebox"
                    ? { ...r, ...live.shown }
                    : live.shown;
              const ghost: Region | null =
                live === null
                  ? null
                  : live.kind === "movebox"
                    ? { ...r, ...live.legal }
                    : live.legal;
              const bad =
                live !== null &&
                (live.blocked.length > 0 || (live.kind === "sizebox" && live.below));
              // Typing in the label takes the box out of the pointer machine: the grip
              // would otherwise capture the pointer on mousedown inside the input — you
              // cannot place a caret in a handle — and a double-click to select a word
              // would open the sheet.
              const editingName = renaming === r.themeId;
              const grippable = editable && movable(r.themeId) && !editingName;
              const renameable = editable && Boolean(onRenameTheme);

              return (
                <div key={r.themeId}>
                  {/* Where it will actually land. Without this the settle reads as a
                      teleport; with it, the blocked box is visibly a preview. */}
                  {ghost && bad && (
                    <div
                      className="pointer-events-none absolute rounded-[6px] border-2"
                      style={{
                        left: ghost.x,
                        top: ghost.y,
                        width: ghost.w,
                        height: ghost.h,
                        borderColor: "var(--rule)",
                        borderRadius: r.shape === "ellipse" ? "50%" : undefined,
                      }}
                    />
                  )}

                  <div
                    className="pointer-events-none absolute rounded-[6px] border-2 border-dashed"
                    style={{
                      left: shown.x,
                      top: shown.y,
                      width: shown.w,
                      height: shown.h,
                      borderColor: bad ? "var(--coral)" : "var(--rule)",
                      background: bad
                        ? "color-mix(in srgb, var(--coral) 12%, var(--card))"
                        : "color-mix(in srgb, var(--lime) 14%, var(--card))",
                      borderRadius: r.shape === "ellipse" ? "50%" : undefined,
                    }}
                  >
                    {/* The label strip doubles as the grip. Everything inside the scaled
                        surface scales with it, and Fit can be 0.3 on a big board, so the
                        grip and the handles are sized in INVERSE scale to stay a constant
                        size on screen — otherwise they are 4px and unusable in the room.

                        Sized for a room, not a desk: the theme's name is the one piece of
                        text on this board that people read from across a table, and at
                        10px it was the smallest thing on screen. Taller with it, which the
                        grip wants anyway — the strip IS the handle the box moves by. */}
                    <span
                      onPointerDown={
                        grippable
                          ? startMove(r)
                          : onOpenTheme
                            ? // A box with no saved region row is not movable — every box
                              // is, until the board has written one — and without a
                              // handler here the press reaches the surface, which captures
                              // the pointer for a marquee and takes the double-click with
                              // it. Keeping the press makes the label openable on a board
                              // nobody has rearranged yet.
                              (e: React.PointerEvent<HTMLSpanElement>) => e.stopPropagation()
                            : undefined
                      }
                      onPointerMove={grippable ? moveBox : undefined}
                      onPointerUp={grippable ? endMove : undefined}
                      onPointerCancel={grippable ? abandonBox : undefined}
                      onLostPointerCapture={grippable ? abandonBox : undefined}
                      // The shortcut for people who find it. The button beside the name is
                      // the discoverable one; a double-click is what a box on a board
                      // invites, and the two cost each other nothing.
                      onDoubleClick={
                        onOpenTheme && !editingName ? () => onOpenTheme(r.themeId) : undefined
                      }
                      title={
                        editingName
                          ? undefined
                          : onOpenTheme
                            ? `${themeLabel(r.themeId)} — double-click to open`
                            : themeLabel(r.themeId)
                      }
                      className="absolute bg-paper font-bold uppercase tracking-[0.05em] text-muted"
                      style={{
                        // Centred on the box's own border: half the strip's height
                        // (fontSize × lineHeight, plus the padding) above it.
                        top: -13 / scale,
                        // Past the reach of the top-left resize handle, which is centred
                        // ON the corner and drawn after this, so anything interactive
                        // inside its 11px would be pressing the handle instead. The strip
                        // used to start at 8 and lose the ⠿ to it.
                        left: 14 / scale,
                        paddingInline: 6 / scale,
                        // Room above and below the text, because this strip is not a
                        // caption — it is the handle the whole box moves by, and a 22px
                        // band is a thin thing to catch with a finger.
                        paddingBlock: 2 / scale,
                        fontSize: 14 / scale,
                        lineHeight: 1.6,
                        // One line, always. The strip is sized to its own text inside a
                        // box that can be 140 wide, so a name that does not fit used to
                        // wrap DOWN into the box and sit on the implications. It runs to
                        // the box's right edge and no further than the gap every box keeps
                        // beside it, and a name too long for that is clipped — the title,
                        // and the rail, have it in full.
                        //
                        // The gap is the whole budget. It used to be a flat 260px, which
                        // was the readable minimum for a narrow box and is wider than a
                        // default box's own gap: with the boxes side by side in a row, and
                        // names now typed right here and written as sentences, every long
                        // name lay across its neighbour's name and made both unreadable.
                        //
                        // None of that while it is being typed into: the clip is what the
                        // reader is spared, and it would cut the caret off mid-name.
                        whiteSpace: "nowrap",
                        maxWidth: editingName
                          ? undefined
                          : Math.max(40 / scale, shown.w - 14 / scale + REGION_CLEARANCE),
                        overflow: editingName ? "visible" : "hidden",
                        textOverflow: "ellipsis",
                        pointerEvents: grippable || onOpenTheme || renameable ? "auto" : "none",
                        // The open field rises above the nodes and the neighbouring boxes;
                        // the box around it must NOT. The box is translucent and is drawn
                        // before the nodes, so raising IT paints its own fill over its own
                        // circles — which is exactly what the field is being opened to
                        // name. This span is positioned and its ancestors create no
                        // stacking context, so it rises on its own.
                        zIndex: editingName ? 5 : undefined,
                        touchAction: "none",
                        cursor: grippable ? (live ? "grabbing" : "grab") : "default",
                        color: bad ? "var(--coral)" : undefined,
                      }}
                    >
                      {/* Opens the theme. Inside the strip because the strip is the one
                          part of a box that already takes the pointer, and at its HEAD
                          because its tail reaches the top-right handle on any box whose
                          name fills its width. It stops the event itself, or the press
                          starts a move and the click never arrives — the pointer capture
                          on the grip retargets it. */}
                      {/* Names it, here, without opening anything — the one button the
                          strip carries. It used to sit beside a ↗ that opened the theme's
                          sheet; naming was the only thing most groups went there for from
                          the canvas, so the sheet is now reached by a double-click on the
                          label or by the theme's square in the rail, and the strip is left
                          saying one thing.

                          Sized well past the glyph's own 14px: it is aimed at rather than
                          read, on a tablet, on a board that may be at a Fit of 0.3. */}
                      {renameable && !live && !editingName && (
                        <button
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            setRenaming(r.themeId);
                          }}
                          aria-label={`Rename ${themeLabel(r.themeId)}`}
                          title={`Rename ${themeLabel(r.themeId)}`}
                          className="font-normal text-blue hover:text-ink"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: 24 / scale,
                            height: 24 / scale,
                            fontSize: 19 / scale,
                            lineHeight: 1,
                            marginRight: 3 / scale,
                            // Centred on the text's own line rather than hung below it:
                            // -0.3em dropped the glyph far enough to read as a separate
                            // row of furniture under the name.
                            verticalAlign: "-0.12em",
                            // Above the corner handles, which are drawn after the strip: on
                            // a narrow box — or any box at a low Fit, since the handles keep
                            // their size while the box shrinks — the top-left one reaches
                            // this far and would take the press.
                            zIndex: 1,
                            pointerEvents: "auto",
                            cursor: "pointer",
                          }}
                        >
                          <span aria-hidden>✎</span>
                        </button>
                      )}
                      {/* Bigger than the name beside it: it is the only part of the
                          strip that says "this moves", and it is aimed at rather than
                          read. inline-block at line-height 1 so a taller glyph does not
                          grow the strip's own line box. */}
                      {grippable && (
                        <span
                          aria-hidden
                          style={{
                            display: "inline-block",
                            fontSize: 18 / scale,
                            lineHeight: 1,
                            marginRight: 4 / scale,
                            verticalAlign: "-0.12em",
                          }}
                        >
                          ⠿
                        </span>
                      )}
                      {editingName ? (
                        <RegionName
                          // The theme's own name, not themeLabel's — a theme nobody has
                          // named reads as "Theme 3" on the board, and starting the field
                          // at that would make Enter alone write the number down as the
                          // real name. An unnamed theme opens an empty field.
                          text={themeName?.(r.themeId) ?? ""}
                          scale={scale}
                          width={Math.max(shown.w, 320 / scale)}
                          onCommit={(next) => {
                            setRenaming(null);
                            // Empty is a cancel, not a clear: the card route refuses a
                            // blank name with a 400, so saving one would be a silent
                            // failure, and "no name" is a state the board already says
                            // out loud rather than one to type.
                            if (next && next !== (themeName?.(r.themeId) ?? "")) {
                              onRenameTheme?.(r.themeId, next);
                            }
                          }}
                          onCancel={() => setRenaming(null)}
                        />
                      ) : (
                        themeLabel(r.themeId)
                      )}
                      {/* Its real membership, which can exceed the circles drawn inside
                          it: an implication sitting in two themes is still ONE circle,
                          and that circle can only be in one box at a time. Saying the
                          number is what stops a box short a twin from looking like a bug.

                          Not while the name is being typed: the field is anchored to the
                          strip's bottom-left and the count would sit against its side,
                          reading as part of what you are writing. */}
                      {!editingName && memberCount(r.themeId) > 0 && (
                        <span className="font-normal"> · {memberCount(r.themeId)}</span>
                      )}
                      {live && live.blocked.length > 0 && (
                        <span className="font-normal">
                          {" "}
                          · blocked by {live.blocked.map(themeLabel).join(", ")}
                        </span>
                      )}
                      {live && live.kind === "sizebox" && live.below && live.blocked.length === 0 && (
                        <span className="font-normal"> · as small as it goes</span>
                      )}
                      {live && !bad && live.adopt.length > 0 && (
                        <span className="font-normal"> · +{live.adopt.length} loose</span>
                      )}

                    </span>

                    {grippable &&
                      (["nw", "ne", "sw", "se"] as const).map((corner) => (
                        <div
                          key={corner}
                          onPointerDown={startSize(r, corner)}
                          onPointerMove={sizeBox}
                          onPointerUp={endSize}
                          onPointerCancel={abandonBox}
                          onLostPointerCapture={abandonBox}
                          aria-label={`Resize ${themeLabel(r.themeId)}`}
                          // The hit area is deliberately bigger than the mark: 22px is a
                          // usable target on a tablet, but four solid squares per box is
                          // a lot of furniture on a board that may hold ten of them.
                          style={{
                            position: "absolute",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: 22 / scale,
                            height: 22 / scale,
                            [corner[0] === "n" ? "top" : "bottom"]: -11 / scale,
                            [corner[1] === "w" ? "left" : "right"]: -11 / scale,
                            pointerEvents: "auto",
                            touchAction: "none",
                            cursor: corner === "nw" || corner === "se" ? "nwse-resize" : "nesw-resize",
                          }}
                        >
                          <span
                            aria-hidden
                            style={{
                              width: 9 / scale,
                              height: 9 / scale,
                              background: "var(--paper)",
                              border: `${1.5 / scale}px solid var(--rule)`,
                              borderRadius: 1 / scale,
                            }}
                          />
                        </div>
                      ))}
                  </div>
                </div>
              );
            })}

            {nodes.map((n) => {
              const p = positions.get(n.key);
              if (!p) return null;
              // Travellers are previewed by offsetting them here, never through onHold:
              // that would setState in useCanvasLayout and rebuild the whole board's
              // indexes sixty times a second through a 2400-line component.
              const travel = travelling?.has(n.key) ? travelDelta : null;
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
                    left: p.x - NODE_R + (travel?.x ?? 0),
                    top: p.y - NODE_R + (travel?.y ?? 0),
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

            {/* Captions over the piles, derived by the caller from where the loose cards
                actually are — so a caption follows its pile and goes away by itself once
                the pile is broken up. Drawn AFTER the nodes so the × is never underneath
                a circle, and shifted by its own height so it sits on the pile's top edge
                at any zoom without anyone having to know the font metrics. */}
            {clumps.map((c) => (
              <div
                key={c.groupId}
                className="pointer-events-none absolute flex items-center"
                style={{
                  left: c.box.x,
                  top: c.box.y,
                  maxWidth: Math.max(c.box.w, 264),
                  transform: "translateY(-100%)",
                  gap: 4 / scale,
                }}
              >
                <span
                  className="bg-board font-bold uppercase tracking-[0.05em] text-muted"
                  style={{
                    fontSize: 11 / scale,
                    lineHeight: 1.6,
                    paddingInline: 4 / scale,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {c.label} · {c.count}
                </span>
                {editable && (
                  <button
                    // Mandatory, and the same trap the grip has: the surface beneath calls
                    // setPointerCapture on pointerdown, which retargets the pointerup and
                    // means the click never reaches this button at all.
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => onDismissClump(c.groupId)}
                    aria-label={`Hide the ${c.label} label`}
                    title="Hide this label"
                    className="bg-board font-bold leading-none text-muted hover:text-ink"
                    style={{
                      pointerEvents: "auto",
                      fontSize: 12 / scale,
                      paddingInline: 3 / scale,
                      cursor: "pointer",
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}

            {marquee && mode.kind === "marquee" && (
              <div
                className="pointer-events-none absolute border-2"
                style={{
                  left: marquee.x,
                  top: marquee.y,
                  width: marquee.w,
                  height: marquee.h,
                  borderColor: mode.blocked.length ? "var(--coral)" : "var(--ink)",
                  background: mode.blocked.length
                    ? "color-mix(in srgb, var(--coral) 12%, transparent)"
                    : "color-mix(in srgb, var(--blue) 12%, transparent)",
                }}
              />
            )}
          </div>
        </div>
      </div>

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
