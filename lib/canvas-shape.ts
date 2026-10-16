// The Session 3 clustering CANVAS — geometry, position fallback, and the membership diff.
//
// Pure. No React, no fetch, no Supabase. Everything here that can corrupt a board is
// unit-testable, because vitest.config.ts covers lib/**/*.test.ts and nothing else: the
// repo has no component or route tests, so the identity rules live here rather than in
// the component that draws them.
//
// The canvas's claim is that the picture IS the data: a card inside a theme's region is a
// member of that theme. Membership is still ripple_cards.parent_card_id, written by the
// same routes the theme rail uses — position is a layer on top that nothing depends on
// for correctness. That is what lets the canvas and the map coexist without diverging.

import type { RippleCard } from "@/lib/ripples-types";
import { implicationKey } from "@/lib/synthesis-shape";

export interface Pos {
  x: number;
  y: number;
}

export interface Region extends Pos {
  themeId: string;
  w: number;
  h: number;
  shape: "rect" | "ellipse";
}

// One saved card position, as it crosses the wire. Keyed by implicationKey, not a row id —
// one implication can be several rows but is only ever one circle on the canvas.
export interface CanvasCardPos extends Pos {
  itemId: string;
}

// How far a card's centre must travel OUTSIDE a region before it stops being a member.
//
// Without it, a 3px nudge across an overlap boundary silently deletes a database row —
// and if that row was the one carrying source_card_id, hands the Week 2 link to a sibling.
// Nobody would see it happen. 12px is about a third of NODE_R, so it reads as "still in
// the pile" rather than as stickiness.
export const HYSTERESIS = 12;

// Is `pt` inside `region`, allowing `margin` px of slack on every side?
//
// The point is the CARD'S CENTRE, deliberately, not its bounding box. One point against N
// shapes is a rule a human can predict; box overlap means a card is "in" four regions it
// barely touches. Edges count as inside.
export function containsPoint(region: Region, pt: Pos, margin = 0): boolean {
  const x = region.x - margin;
  const y = region.y - margin;
  const w = region.w + margin * 2;
  const h = region.h + margin * 2;

  if (region.shape === "ellipse") {
    const rx = w / 2;
    const ry = h / 2;
    const dx = (pt.x - (x + rx)) / rx;
    const dy = (pt.y - (y + ry)) / ry;
    return dx * dx + dy * dy <= 1;
  }

  return pt.x >= x && pt.x <= x + w && pt.y >= y && pt.y <= y + h;
}

// Which themes should hold a card whose centre is at `pt`?
//
// Returns theme ids in the order `regions` was given — board order, so the caller's
// "In theme 1, 3" read-out comes out sorted without re-sorting. `current` is the set of
// themes the card is in RIGHT NOW, and those regions get the hysteresis margin: leaving
// is harder than arriving, because leaving is the destructive direction.
export function regionsAt(regions: Region[], pt: Pos, current: Set<string>): string[] {
  return regions
    .filter((r) => containsPoint(r, pt, current.has(r.themeId) ? HYSTERESIS : 0))
    .map((r) => r.themeId);
}

// ---------------------------------------------------------------------------
// The membership diff
// ---------------------------------------------------------------------------

export type MembershipStep =
  | { kind: "unpark"; cardId: string }
  | { kind: "reparent"; cardId: string; parentId: string }
  | { kind: "untheme"; cardId: string }
  | { kind: "copy"; fromId: string; parentId: string }
  | { kind: "delete"; cardId: string }
  | { kind: "refuse"; reason: string };

export interface MembershipArgs {
  // The OPTIMISTIC board array, every card on it.
  cards: RippleCard[];
  // implicationKey of the implication that moved.
  key: string;
  // Theme ids whose region now contains it, in board order (regionsAt's output).
  desired: string[];
  // board.themes ids. A parent outside this set is a theme that has been deleted.
  liveThemeIds: Set<string>;
  // childrenOf(board, id).length — injected so this stays pure.
  childCount: (cardId: string) => number;
}

// What writes would make this implication's membership match `desired`?
//
// Expressed as "for these themes, what should membership be" rather than "this card
// moved", so the same function can answer for a HYPOTHETICAL arrangement — which is what
// a future move-and-resize gesture needs to show a confirm bar before it writes.
//
// One implication can be several rows (0023): one per theme it sits in, sharing a
// twin_key. So this is an assignment problem, not a single update — and the two
// invariants it exists to protect are:
//
//   1. NEVER ZERO ROWS. Dropping to zero frees the (code, source_card_id) slot from 0018,
//      and the facilitator seed panel would then re-offer that Week 2 answer as if the
//      group had never worked it. An implication dragged clear of every region is
//      unthemed back to the tray, not deleted.
//   2. THE ANCHOR SURVIVES. Only one row carries source_card_id — the Week 2 link that
//      drives lineage, labelOnBoard and the seed panel. When rows must go, the anchor
//      moves and a twin dies, never the other way round.
export function planMembership(args: MembershipArgs): MembershipStep[] {
  const { cards, key, desired, liveThemeIds, childCount } = args;

  // Scan the RAW array, not twinIndex(board) or seededIndex(board). Those walk only
  // board.unclustered and live themes' clusters, and indexSynthesisBoard's `case null:`
  // files any parented implication under clusters[parentId] with no reachability sweep —
  // so a row stranded under a deleted theme is invisible to both. A diff built on them
  // would conclude "no rows exist" and mint a duplicate alongside the stranded one.
  const rows = cards.filter((c) => c.cardKind === null && implicationKey(c) === key);
  if (rows.length === 0) {
    return [{ kind: "refuse", reason: "That implication is no longer on this board." }];
  }

  // The row that must survive: the one holding the Week 2 link, else the oldest.
  const byAge = [...rows].sort((a, b) => a.createdTime.localeCompare(b.createdTime));
  const anchor = byAge.find((r) => r.sourceCardId !== null) ?? byAge[0];

  // One row per live theme. A second row in the same theme can't happen (0024's unique
  // index), but if a race slipped one through, the extra falls into `reusable` below.
  const inTheme = new Map<string, RippleCard>();
  for (const r of byAge) {
    if (r.parentId && liveThemeIds.has(r.parentId) && !inTheme.has(r.parentId)) {
      inTheme.set(r.parentId, r);
    }
  }

  const keep = desired.filter((t) => inTheme.has(t));
  const keepRows = new Set(keep.map((t) => inTheme.get(t)!.id));
  const add = desired.filter((t) => !inTheme.has(t));

  // Every row not already serving a theme we're keeping is available to be moved —
  // including tray rows and rows stranded under dead themes. Anchor first, so a move
  // reuses the Week-2-linked row rather than destroying it.
  const reusable = [anchor, ...byAge.filter((r) => r.id !== anchor.id)].filter(
    (r) => !keepRows.has(r.id)
  );

  const head: MembershipStep[] = [];
  const unparked = new Set<string>();
  const unparkIfNeeded = (r: RippleCard) => {
    // Reparenting alone moves the row and leaves `parked` set — and the board files a
    // parked card under Parked whatever its parent. Mirrors placeInTheme.
    if (r.parked && !unparked.has(r.id)) {
      unparked.add(r.id);
      head.push({ kind: "unpark", cardId: r.id });
    }
  };

  const moves: MembershipStep[] = [];
  const copies: MembershipStep[] = [];

  let taken = 0;
  for (const themeId of add) {
    const row = reusable[taken];
    if (row) {
      taken += 1;
      unparkIfNeeded(row);
      moves.push({ kind: "reparent", cardId: row.id, parentId: themeId });
    } else {
      // Always from the anchor: the copy route reads the text off it and stamps the twin
      // key, writing the new row with source_card_id null (0023's stated intent).
      copies.push({ kind: "copy", fromId: anchor.id, parentId: themeId });
    }
  }

  const tail: MembershipStep[] = [];
  // Invariant 1: if nothing ends up themed, one row has to stay behind in the tray.
  let survivorFound = keep.length + add.length > 0;
  for (const row of reusable.slice(taken)) {
    if (!survivorFound) {
      survivorFound = true;
      if (row.parentId !== null) tail.push({ kind: "untheme", cardId: row.id });
      continue;
    }
    // parent_card_id is ON DELETE CASCADE (0007), and 0026's held-check only fires for
    // themes — so deleting an implication that somehow has children would silently take
    // its subtree. No UI path creates one; this is the guard for a malformed board.
    if (childCount(row.id) > 0) {
      tail.push({
        kind: "refuse",
        reason: "That implication has cards hanging off it — move those first.",
      });
      continue;
    }
    tail.push({ kind: "delete", cardId: row.id });
  }

  return [...head, ...moves, ...copies, ...tail];
}

// ---------------------------------------------------------------------------
// Marquee selection, region growth, opening positions
// ---------------------------------------------------------------------------

// Card pitch on the canvas: a node's diameter plus air. Matches the wheel's 2*NODE_R +
// NODE_GAP so a packed pile reads at the same density as the map it came from.
const PITCH = 88;

// How many columns the hand-typed strip runs to before it wraps.
const STRIP_COLS = 12;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// A card as the canvas sees it: `x`/`y` are its CENTRE, `w`/`h` its drawn box.
export interface CanvasItem extends Pos {
  key: string;
  w: number;
  h: number;
}

// Which cards does a dragged marquee claim?
//
// The >=50%-of-the-card's-area rule, which is what a Miro-trained hand expects from a
// selection box: clipping a card's corner does not take it, covering most of it does.
// Note this is deliberately NOT the rule used for membership — that one tests the card's
// centre against a region (see containsPoint). In practice the two agree, since covering
// over half of a box puts its centre inside, but selection is a transient gesture where
// generosity is free and membership is a database write where predictability wins.
export function coveredBy(marquee: Rect, items: CanvasItem[]): string[] {
  return items
    .filter((it) => {
      const ox = Math.max(
        0,
        Math.min(marquee.x + marquee.w, it.x + it.w / 2) - Math.max(marquee.x, it.x - it.w / 2)
      );
      const oy = Math.max(
        0,
        Math.min(marquee.y + marquee.h, it.y + it.h / 2) - Math.max(marquee.y, it.y - it.h / 2)
      );
      return (ox * oy) / (it.w * it.h) >= 0.5;
    })
    .map((it) => it.key);
}

// A deterministic seat inside a region — always inside, however many cards pile in.
// Columns wrap and then rows wrap, so an overfull theme overlaps rather than spilling out
// of its own box, which would make the picture contradict the data.
function seatInRegion(region: Region, index: number): Pos {
  const cols = Math.max(1, Math.floor(region.w / PITCH));
  const rows = Math.max(1, Math.floor(region.h / PITCH));
  const col = index % cols;
  const row = Math.floor(index / cols) % rows;
  return {
    x: region.x + ((col + 0.5) * region.w) / cols,
    y: region.y + ((row + 0.5) * region.h) / rows,
  };
}

// How many seats does a box have, and which seat does a point sit in? seatInRegion wraps
// its index modulo this grid, so anything choosing seats has to think in slots rather than
// in ever-increasing indices — seat 9 and seat 0 are the same place in a 9-seat box.
function seatGrid(region: Region): { cols: number; rows: number; capacity: number } {
  const cols = Math.max(1, Math.floor(region.w / PITCH));
  const rows = Math.max(1, Math.floor(region.h / PITCH));
  return { cols, rows, capacity: cols * rows };
}

function seatIndexAt(region: Region, pt: Pos): number {
  const { cols, rows } = seatGrid(region);
  const col = Math.min(cols - 1, Math.max(0, Math.floor(((pt.x - region.x) / region.w) * cols)));
  const row = Math.min(rows - 1, Math.max(0, Math.floor(((pt.y - region.y) / region.h) * rows)));
  return row * cols + col;
}

// Seats inside a box for the members it cannot position.
//
// An implication in two themes is ONE circle at ONE saved position, and boxes no longer
// overlap — so the box that does not hold that position has a member it cannot draw where
// the member actually is. It draws a COPY instead, and these are the seats the copies take.
//
// `occupied` is every position already drawn inside the region. Three rules, in order:
//
//   1. a free seat, always, while the box has one;
//   2. out of seats, a copy stacks on another COPY before it stacks on a real card — a
//      copy hidden under a card you can drag is the empty-box bug all over again, and the
//      card is drawn on top of it;
//   3. only when every seat holds a real card does a copy land on one.
//
// Overfull boxes therefore overlap rather than spilling out, which is what seatInRegion
// already does for real cards. Pure and deterministic like the rest of this file: two
// clients must seat the same copies in the same places.
export function copySeats(region: Region, count: number, occupied: Pos[]): Pos[] {
  const { capacity } = seatGrid(region);
  const real = new Set(occupied.map((p) => seatIndexAt(region, p)));
  const used = new Set(real);
  const out: Pos[] = [];
  let next = 0;

  const scan = (skip: Set<number>): number => {
    for (let i = 0; i < capacity; i++) {
      const slot = (next + i) % capacity;
      if (!skip.has(slot)) return slot;
    }
    return -1;
  };

  for (let i = 0; i < count; i++) {
    let slot = scan(used);
    if (slot < 0) slot = scan(real);
    if (slot < 0) slot = next % capacity;
    used.add(slot);
    out.push(seatInRegion(region, slot));
    next = (slot + 1) % capacity;
  }
  return out;
}

export interface FallbackItem {
  key: string;
  // The theme it is clustered in, in board order; null while it is in the tray.
  themeId: string | null;
  // Every theme it is in, twins included. Defaults to [themeId] when omitted.
  themeIds?: string[];
  // Where a LOOSE card goes when it has no saved position: its seat in its key change's
  // gathered clump, from gather(). The caller works that out, which is what keeps this
  // module pure and ignorant of Week 2 lineage.
  seat: Pos | null;
}

export interface ResolveArgs {
  // In board order. Order decides packing, so it must be stable across clients.
  items: FallbackItem[];
  regions: Map<string, Region>;
  saved: Map<string, Pos>;
  // Top-left of the strip, below everything the gather laid down.
  strip: Pos;
  // Keys whose saved position is taken as-is even where it disagrees with membership: a
  // card under a finger, or one whose membership write is still on its way. Without this
  // a card dropped into a box would jump out of it for the length of the round trip.
  trusted?: Set<string>;
}

// Does a saved position still tell the truth about membership?
//
// Containment IS membership on this canvas, but membership can change without the canvas
// knowing: a teammate's "Move out of theme" from the theme sheet, a merge, a membership
// write that was refused after the drop was saved. A saved point that now sits inside a
// theme the card is not in, or outside every box of the themes it is in, is stale, and
// letting it win would draw the card in the wrong theme for good. Boxes never overlap, so
// a point is in at most one region; a twin agrees if that region is any of its themes.
function agrees(pt: Pos, themeIds: string[], regions: Map<string, Region>): boolean {
  let inside: string | null = null;
  for (const r of regions.values()) {
    if (containsPoint(r, pt)) {
      inside = r.themeId;
      break;
    }
  }
  if (inside !== null) return themeIds.includes(inside);
  // Outside every box: right for a loose card, and for a themed one only while none of
  // its themes has a box to be drawn in.
  return themeIds.every((id) => !regions.has(id));
}

// Where does every implication sit when the canvas opens?
//
// Nothing here writes: positions are computed, identically, on every client. The ladder:
//
//   1. a saved position wins, so long as it agrees with membership (see agrees);
//   2. clustered under a theme that has a region -> a packed seat INSIDE that region;
//   3. otherwise, its seat in the gather -> a board opens already gathered by key change;
//   4. no seat at all -> the strip.
//
// Rung 2 is what keeps the view honest: themes cut across Week 2 branches, so without it a
// board that has already been clustered would open with every theme's members scattered
// and no region containing its own members — the canvas contradicting the one claim it
// makes.
//
// Rung 3 used to be the node the futures wheel would have drawn, so the canvas opened
// looking like the map. It opens gathered instead, and the seats come from the same
// gather() the Gather button writes down — if the two ever drifted, isPile would disagree
// with itself and captions would float over piles that are not there.
export function resolvePositions(args: ResolveArgs): Map<string, Pos> {
  const { items, regions, saved, strip, trusted } = args;
  const out = new Map<string, Pos>();
  const seated = new Map<string, number>();
  let stripped = 0;

  for (const item of items) {
    const savedPos = saved.get(item.key);
    const themeIds = item.themeIds ?? (item.themeId ? [item.themeId] : []);
    if (savedPos && (trusted?.has(item.key) || agrees(savedPos, themeIds, regions))) {
      out.set(item.key, savedPos);
      continue;
    }

    const region = item.themeId ? regions.get(item.themeId) : undefined;
    if (region) {
      const index = seated.get(region.themeId) ?? 0;
      seated.set(region.themeId, index + 1);
      out.set(item.key, seatInRegion(region, index));
      continue;
    }

    if (item.seat) {
      out.set(item.key, item.seat);
      continue;
    }

    const index = stripped;
    stripped += 1;
    out.set(item.key, {
      x: strip.x + (index % STRIP_COLS) * PITCH,
      y: strip.y + Math.floor(index / STRIP_COLS) * PITCH,
    });
  }

  return out;
}

// A node's radius on the canvas. Shared with the component that draws them, so "does this
// card overlap that box" means the same thing to the geometry and to the eye.
export const NODE_RADIUS = 38;

// How far apart "Spread out" sets cards: roomier than PITCH, because the point of the
// gesture is having space to push things around and draw a box between them.
const SPREAD_PITCH = 120;

// Air inside a default box, around its seated members.
const REGION_PAD = 26;

// Air BETWEEN two default boxes. Comfortably more than 2 * HYSTERESIS, so a card held at
// the very edge of one box can never also be caught by its neighbour.
const REGION_GAP = 40;

// A theme is never narrower than this, so an empty one is still a visible, droppable box.
const MIN_COLS = 2;

// How many seats an EMPTY theme is sized for. A box sized as though it held one card is
// barely bigger than the card, which reads as a slot for a single thing rather than as a
// pile to build — and the canvas now opens with three empty boxes on a new board, so the
// empty case is the first thing a group meets rather than a leftover. Nine seats (3 × 3)
// is room for a real cluster without taking the whole band.
const EMPTY_SEATS = 9;

// Boxes for themes that have never had one.
//
// Every board that existed before the canvas did has themes made in the rail or on the
// map, which carry no geometry at all. Without this, their members would be drawn loose
// with no box around them — a theme holding ten implications would look like ten
// unclustered cards, and the view would open contradicting the one thing it claims.
//
// Laid out left to right and wrapped, in board order, each box sized to seat its own
// members. Pure and deterministic, because every client derives these independently and
// they must agree before anyone has written anything.
export function defaultRegions(
  themes: { themeId: string; memberCount: number }[],
  band: Pos,
  maxWidth: number
): Region[] {
  const out: Region[] = [];
  let x = band.x;
  let y = band.y;
  let rowHeight = 0;

  for (const t of themes) {
    // An empty theme is sized for a cluster rather than for one card, so it reads as
    // somewhere to build a pile and has room to drop several without a resize.
    const n = t.memberCount > 0 ? t.memberCount : EMPTY_SEATS;
    const cols = Math.max(MIN_COLS, Math.ceil(Math.sqrt(n)));
    const rows = Math.max(1, Math.ceil(n / cols));
    // seatInRegion derives its grid as floor(w / PITCH), so this sizing is exactly what
    // gives it `cols` by `rows` seats — the box can always hold everything in it.
    const w = cols * PITCH + REGION_PAD * 2;
    const h = rows * PITCH + REGION_PAD * 2;

    if (x > band.x && x + w > band.x + maxWidth) {
      x = band.x;
      y += rowHeight + REGION_GAP;
      rowHeight = 0;
    }

    out.push({ themeId: t.themeId, x, y, w, h, shape: "rect" });
    x += w + REGION_GAP;
    rowHeight = Math.max(rowHeight, h);
  }

  return out;
}


// Slots for "Spread out": a tidy grid that MISSES every theme box.
//
// The wheel packs 76px circles 12px apart, so a freshly opened branch is too dense to
// grab a single card from or draw a boundary through. This hands back room — but it has
// to route around the boxes, because spreading out moves cards and nothing else. A loose
// card parked inside a theme's box would read as a member of that theme without being
// one, and the only thing that makes a card a member is a drag that ends there.
export function freeGrid(count: number, regions: Region[], origin: Pos): Pos[] {
  const out: Pos[] = [];
  if (count <= 0) return out;

  const cols = Math.max(4, Math.ceil(Math.sqrt(count)));
  // Generous, and only a backstop: the grid marches downward forever, and the boxes are
  // finite, so it always finds room. The bound just refuses to hang on absurd input.
  const limit = count * 8 + 1000;

  for (let slot = 0; out.length < count && slot < limit; slot++) {
    const p = {
      x: origin.x + (slot % cols) * SPREAD_PITCH,
      y: origin.y + Math.floor(slot / cols) * SPREAD_PITCH,
    };
    // NODE_RADIUS of clearance, so a card does not merely miss a box's centre but clears
    // its edge — half a circle poking into a theme reads as being in it.
    if (regions.some((r) => containsPoint(r, p, NODE_RADIUS))) continue;
    out.push(p);
  }

  return out;
}

// ---------------------------------------------------------------------------
// Moving and resizing a theme's box
// ---------------------------------------------------------------------------

// Minimum air between two boxes. Two reasons, and the larger one decides the number:
//
//   CORRECTNESS needs only > 0. containsPoint counts an edge as inside, and regionsAt
//   gives the hysteresis margin only to regions a card is ALREADY in — so two boxes
//   sharing an edge would make a card whose centre sits on that edge a member of both,
//   silently, with no gesture at all.
//
//   LEGIBILITY needs about this much: a box's label strip is drawn 9px ABOVE its own top
//   edge, so anything much less puts a theme's name on its neighbour's border, and two
//   dashed edges a few pixels apart read as one box.
export const REGION_CLEARANCE = 24;

// The smallest a box may be made: one seat plus its air. Below this, seatInRegion's
// floor(w / PITCH) stops yielding a usable grid, the box is too small to drop into, and
// 0028's CHECK (w > 0, h > 0) turns a degenerate box into a 500.
export const MIN_REGION = 140;

export type Corner = "nw" | "ne" | "sw" | "se";

export function rectsOverlap(a: Rect, b: Rect, clearance = 0): boolean {
  return !(
    a.x + a.w + clearance <= b.x ||
    b.x + b.w + clearance <= a.x ||
    a.y + a.h + clearance <= b.y ||
    b.y + b.h + clearance <= a.y
  );
}

// Which of `others` does `box` collide with that it was NOT already colliding with?
//
// `tolerated` is the collision set frozen when the gesture STARTED, and it is the whole
// reason this is not a plain predicate. Before boxes were forbidden to overlap, the
// marquee could draw one straight over another — regions are inert, so the drag ran
// underneath them — and real boards hold such pairs. A strict test would find every
// position of such a box illegal and leave it permanently stuck with nothing on screen
// to explain why. Tolerating what you inherited makes the gesture monotone: it can walk
// a bad board back toward a good one, and can never make it worse.
//
// An ellipse is tested by its bounding box, deliberately: "these two do not touch" has to
// be a rule a hand can predict, and v1 only ever writes 'rect'.
export function blockers(
  box: Region,
  others: Region[],
  tolerated: ReadonlySet<string>,
  clearance = REGION_CLEARANCE
): string[] {
  return others
    .filter(
      (o) =>
        o.themeId !== box.themeId &&
        !tolerated.has(o.themeId) &&
        rectsOverlap(box, o, clearance)
    )
    .map((o) => o.themeId);
}

// Which drawn cards sit inside this box? The CARD'S CENTRE against the region — the same
// rule membership uses, so "what is in the box" means one thing on this canvas.
export function cardsInRegion(region: Region, items: CanvasItem[], margin = 0): string[] {
  return items.filter((it) => containsPoint(region, it, margin)).map((it) => it.key);
}

export function containsRect(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  );
}

// The smallest this box may be shrunk to, so a resize can never put a member outside the
// region that says it belongs to it.
//
// Built from the members drawn inside, grown by a node's radius, and then INTERSECTED
// with the box as it stands. The intersection is load-bearing: a member drawn hard
// against an edge would otherwise push the padded floor outside the box, the floor would
// be unsatisfied the instant the handle was grabbed, and the box would refuse to resize
// in any direction with nothing on screen to say why. Every member's centre is inside the
// region, so the intersection always holds every centre and is always satisfied at the
// moment the gesture starts.
//
// `pad` is NODE_RADIUS rather than REGION_PAD because the test that matters for the data
// is centre-based, but a box cutting a member's circle in half READS as dropping it.
//
// null when the box holds no members of its own; then only MIN_REGION applies.
export function resizeFloor(region: Region, members: Pos[], pad = NODE_RADIUS): Rect | null {
  if (members.length === 0) return null;
  const xs = members.map((m) => m.x);
  const ys = members.map((m) => m.y);
  const x0 = Math.max(region.x, Math.min(...xs) - pad);
  const y0 = Math.max(region.y, Math.min(...ys) - pad);
  const x1 = Math.min(region.x + region.w, Math.max(...xs) + pad);
  const y1 = Math.min(region.y + region.h, Math.max(...ys) + pad);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// The box you get by dragging `corner` to `pointer`. The OPPOSITE corner anchors.
//
// The dragged corner is clamped so it can never cross its anchor — a box flipped through
// its own anchor would jump to the other side of a neighbour and land somewhere nobody
// aimed at — and x/y are clamped at 0, because the surface has no negative space and a box
// at x < 0 is drawn outside the scrollable area and can never be grabbed again.
export function resizeTo(
  region: Region,
  corner: Corner,
  pointer: Pos,
  min = MIN_REGION
): Region {
  const west = corner === "nw" || corner === "sw";
  const north = corner === "nw" || corner === "ne";
  const ax = west ? region.x + region.w : region.x; // the anchored edge
  const ay = north ? region.y + region.h : region.y;

  const x = west ? Math.max(0, Math.min(pointer.x, ax - min)) : ax;
  const y = north ? Math.max(0, Math.min(pointer.y, ay - min)) : ay;
  // max(min, …) on the anchored side too: a box jammed against the origin can have less
  // than `min` of room, and 0028 would reject a degenerate one outright.
  const w = west ? Math.max(min, ax - x) : Math.max(min, pointer.x - ax);
  const h = north ? Math.max(min, ay - y) : Math.max(min, pointer.y - ay);

  return { ...region, x, y, w, h };
}

// ---------------------------------------------------------------------------
// Gather — the reverse of Spread out
// ---------------------------------------------------------------------------

// Room above a clump for its caption. The caption is inverse-scaled so it stays a constant
// size on screen, which at Fit (~0.3 on Group 1) makes it about 59 MODEL pixels tall — so
// 24 would put it straight through whatever sits above the pile.
const CAPTION_H = 56;
// Air between two clumps. Comfortably more than PITCH, so the piles read as separate
// objects rather than as one field with gaps in it.
const CLUMP_GAP = 120;

export interface GatherClump {
  groupId: string;
  label: string;
  keys: string[];
  // The clump's footprint, caption band included, so the caller can draw the name above
  // it without re-deriving the box.
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GatherPlan {
  positions: CanvasCardPos[];
  clumps: GatherClump[];
}

export interface GatherGroup {
  groupId: string;
  label: string;
  keys: string[];
}

// Gather's frame. The opening layout and the Gather button must lay down the SAME lattice
// or isPile disagrees with itself, so the numbers live here rather than as literals at a
// call site that could quietly gain a second copy.
export const GATHER_ORIGIN: Pos = { x: 60, y: 60 };
export const GATHER_WIDTH = 1600;

// The seats a plan hands to resolvePositions.
export function gatherSeats(plan: GatherPlan): Map<string, Pos> {
  return new Map(plan.positions.map((p) => [p.itemId, { x: p.x, y: p.y }]));
}

// The bottom of everything a plan drew — where the strip starts, and what the band of
// theme boxes is placed below. Derived from the gather rather than from a wheel that is
// no longer on screen.
export function gatherBottom(plan: GatherPlan): number {
  let bottom = 0;
  for (const c of plan.clumps) bottom = Math.max(bottom, c.y + c.h);
  for (const p of plan.positions) bottom = Math.max(bottom, p.y + NODE_RADIUS);
  return bottom;
}

// A few meaningful piles instead of one big grid.
//
// `groups` arrives in the order the caller wants them read — key-change rank, which is
// the board's own ranking, so "the first pile" means what the group meant when it ranked
// its key changes. Empty groups are dropped rather than drawn as an empty caption.
//
// Honours the same constraint freeGrid does — NO PILE LANDS ON A THEME BOX — but at the
// granularity of a whole clump, so a pile stays a pile instead of being shredded around
// the boxes. That still satisfies the per-card rule: a card's centre sits at least
// PITCH / 2 = 44px inside its footprint's edge, and 44 > NODE_RADIUS, so a footprint that
// clears every box means every card in it clears every box too.
export function gather(args: {
  groups: GatherGroup[];
  regions: Region[];
  origin?: Pos;
  maxWidth?: number;
}): GatherPlan {
  const { groups, regions, origin = GATHER_ORIGIN, maxWidth = GATHER_WIDTH } = args;
  const live = groups.filter((g) => g.keys.length > 0);
  const clumps: GatherClump[] = [];
  const positions: CanvasCardPos[] = [];

  let x = origin.x;
  let y = origin.y;
  let rowHeight = 0;
  // Only a backstop: the cursor marches downward forever and the boxes are finite, so a
  // free spot always exists. This just refuses to hang on absurd input.
  const limit = live.length * 64 + 256;

  for (const group of live) {
    const n = group.keys.length;
    const { cols, rows } = clumpGrid(n);
    const w = cols * PITCH;
    const h = CAPTION_H + rows * PITCH;

    let placed = false;
    for (let step = 0; step < limit; step++) {
      if (x > origin.x && x + w > origin.x + maxWidth) {
        x = origin.x;
        y += rowHeight + CLUMP_GAP;
        rowHeight = 0;
      }
      const foot = { x, y, w, h };
      const blocked =
        regions.some((r) => rectsOverlap(foot, r, REGION_CLEARANCE)) ||
        clumps.some((c) => rectsOverlap(foot, c, CLUMP_GAP / 2));
      if (!blocked) {
        placed = true;
        break;
      }
      x += w + CLUMP_GAP;
    }

    if (!placed) {
      // Nowhere this pile fits as a pile. Fall back to the per-card walk, which cannot
      // land on a box either — better a scattered group than a lost one.
      const slots = freeGrid(n, regions, { x: origin.x, y: y + rowHeight + CLUMP_GAP });
      // Guarded rather than spread blindly: freeGrid can return fewer slots than keys at
      // its own backstop, and `...undefined` writes a position with no x or y. That was
      // survivable while this only ran on a button press; as the OPENING layout it would
      // draw NaN on every client.
      group.keys.forEach((key, i) => {
        const at = slots[i];
        if (at) positions.push({ itemId: key, ...at });
      });
      continue;
    }

    clumps.push({ groupId: group.groupId, label: group.label, keys: group.keys, x, y, w, h });
    group.keys.forEach((key, i) =>
      positions.push({
        itemId: key,
        x: x + ((i % cols) + 0.5) * PITCH,
        y: y + CAPTION_H + (Math.floor(i / cols) + 0.5) * PITCH,
      })
    );

    x += w + CLUMP_GAP;
    rowHeight = Math.max(rowHeight, h);
  }

  return { positions, clumps };
}


// ---------------------------------------------------------------------------
// Pile labels — a caption while the cards are still in a pile
// ---------------------------------------------------------------------------

// Below this, a "pile" is just some cards. It is also where almost every false positive
// on the opening wheel lives: a lone branch node passes every geometric test there is.
export const MIN_PILE = 3;

// How far a card may be nudged and still count as being in its slot — a quarter of a card.
export const PILE_SNAP = PITCH / 4;

export interface PileGroup {
  groupId: string;
  // Already shortened by the caller; this module does no text work.
  label: string;
  // The unshortened label, for the caption's tooltip. Carried, never read — a key change
  // is a paragraph and `label` is the 28-character head of it, so the canvas has no way
  // to show the whole thing without being handed it.
  title?: string;
  cards: Pos[];
}

export interface PileLabel {
  groupId: string;
  label: string;
  title?: string;
  count: number;
  // The DRAWN pile — the centres grown by a card's radius. The caption sits on its top edge.
  box: Rect;
}

// The grid Gather packs a clump into. Extracted so ONE formula answers both "where do
// these cards go" and "are these cards still where they were put". If the two ever
// drifted, a pile would be labelled the instant it was made and never again.
export function clumpGrid(n: number): { cols: number; rows: number } {
  const count = Math.max(1, n);
  const cols = Math.max(2, Math.ceil(Math.sqrt(count)));
  return { cols, rows: Math.max(1, Math.ceil(count / cols)) };
}

export function boundsOf(points: Pos[]): Rect | null {
  if (points.length === 0) return null;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

// Do these cards still sit in the block Gather would pack them into?
//
// This is the test that tells a gathered pile apart from the opening wheel, and it had to
// be ARRANGEMENT rather than separation. The obvious rule — "this group's bounding box is
// disjoint from the others'" — fails, because the wheel's `place()` puts every node at the
// MIDPOINT of its angular span: a branch hugs its mid-ray and never fills its wedge, so
// branches are spokes, not wedges, and spokes separate cleanly. A three-key board would
// open with all three branches captioned. Gather, by contrast, lays cards on an
// axis-aligned lattice of pitch PITCH, which nothing else on this surface does.
//
// Three conditions: no bigger than the block, every centre on a lattice node measured from
// the group's OWN corner (so a pile dragged bodily is still a pile), and one card per cell.
export function isPile(cards: Pos[]): boolean {
  const box = boundsOf(cards);
  if (!box) return false;

  const { cols, rows } = clumpGrid(cards.length);
  if (box.w > cols * PITCH || box.h > rows * PITCH) return false;

  const seen = new Set<string>();
  for (const c of cards) {
    const col = Math.round((c.x - box.x) / PITCH);
    const row = Math.round((c.y - box.y) / PITCH);
    if (Math.abs(c.x - box.x - col * PITCH) > PILE_SNAP) return false;
    if (Math.abs(c.y - box.y - row * PITCH) > PILE_SNAP) return false;
    const cell = `${col},${row}`;
    if (seen.has(cell)) return false;
    seen.add(cell);
  }
  return true;
}

// Which groups have earned a caption, in the order given.
//
// Nothing is stored — call it every render. A label therefore cannot go stale: it is
// derived from where the cards actually are, so it follows them, and it disappears by
// itself once the pile it names has been broken up.
//
// A pile must be DISTINCT as well as tidy. Every gather() output satisfies that by
// construction (its footprints are laid out apart), so the test only ever bites when
// someone has shoved two piles together — which is exactly when a caption would start
// pointing at a mixture.
export function pileLabels(groups: PileGroup[], min = MIN_PILE): PileLabel[] {
  const tidy = groups
    .filter((g) => g.cards.length >= min && isPile(g.cards))
    .map((g) => {
      const b = boundsOf(g.cards)!;
      return {
        groupId: g.groupId,
        label: g.label,
        title: g.title,
        count: g.cards.length,
        box: {
          x: b.x - NODE_RADIUS,
          y: b.y - NODE_RADIUS,
          w: b.w + NODE_RADIUS * 2,
          h: b.h + NODE_RADIUS * 2,
        },
      };
    });

  return tidy.filter(
    (c) => !tidy.some((o) => o.groupId !== c.groupId && rectsOverlap(c.box, o.box))
  );
}
