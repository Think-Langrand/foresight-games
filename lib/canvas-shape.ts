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

// Stretch a region so it takes in every one of its members — and NEVER shrink it.
//
// This is the whole reason a theme can be grown without the drift that free resizing
// would bring. Area is only ever added, around cards that are already becoming members,
// so no gesture can leave a member sitting outside its own region and no row is silently
// unthemed. Shrinking is what v1 refuses to do; a later move-and-resize gesture has to
// show its consequences through planMembership before it writes.
export function growToFit(region: Region, members: Pos[], pad: number): Region {
  if (members.length === 0) return { ...region };
  const xs = members.map((m) => m.x);
  const ys = members.map((m) => m.y);
  const minX = Math.min(region.x, ...xs.map((x) => x - pad));
  const minY = Math.min(region.y, ...ys.map((y) => y - pad));
  const maxX = Math.max(region.x + region.w, ...xs.map((x) => x + pad));
  const maxY = Math.max(region.y + region.h, ...ys.map((y) => y + pad));
  return { ...region, x: minX, y: minY, w: maxX - minX, h: maxY - minY };
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

export interface FallbackItem {
  key: string;
  // The theme it is clustered in, in board order; null while it is in the tray.
  themeId: string | null;
  // Where the futures wheel would have drawn it — null for a card hand-typed on the
  // Week 3 board, which has no Week 2 source and therefore no node.
  wheel: Pos | null;
}

export interface ResolveArgs {
  // In board order. Order decides packing, so it must be stable across clients.
  items: FallbackItem[];
  regions: Map<string, Region>;
  saved: Map<string, Pos>;
  // Top-left of the strip where sourceless cards pile up, below the wheel's bbox.
  strip: Pos;
}

// Where does every implication sit when the canvas opens?
//
// Nothing here writes: positions are computed, identically, on every client. The ladder:
//
//   1. a saved position wins outright;
//   2. clustered under a theme that has a region -> a packed seat INSIDE that region;
//   3. otherwise, the node the futures wheel would draw -> a fresh board opens as the map;
//   4. no source at all -> the strip.
//
// Rung 2 is what keeps the view honest. The wheel groups by Week 2 branch and themes cut
// across branches, so without it a board that has already been clustered would open with
// every theme's members scattered and no region containing its own members — the canvas
// would open contradicting itself on the one claim it makes.
export function resolvePositions(args: ResolveArgs): Map<string, Pos> {
  const { items, regions, saved, strip } = args;
  const out = new Map<string, Pos>();
  const seated = new Map<string, number>();
  let stripped = 0;

  for (const item of items) {
    const savedPos = saved.get(item.key);
    if (savedPos) {
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

    if (item.wheel) {
      out.set(item.key, item.wheel);
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
    // An empty theme is sized as though it held one card, so it has somewhere to drop.
    const n = Math.max(1, t.memberCount);
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
