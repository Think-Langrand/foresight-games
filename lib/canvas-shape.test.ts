import { describe, it, expect } from "vitest";
import {
  HYSTERESIS,
  MIN_REGION,
  NODE_RADIUS,
  blockers,
  cardsInRegion,
  containsPoint,
  MIN_PILE,
  boundsOf,
  clumpGrid,
  containsRect,
  coveredBy,
  isPile,
  pileLabels,
  rectsOverlap,
  copySeats,
  defaultRegions,
  GATHER_ORIGIN,
  GATHER_WIDTH,
  freeGrid,
  gather,
  gatherBottom,
  gatherSeats,
  planMembership,
  regionsAt,
  resizeFloor,
  resizeTo,
  resolvePositions,
  type Pos,
  type Region,
} from "./canvas-shape";
import type { RippleCard } from "./ripples-types";
import { layout } from "./wheel-layout";

const rect = (themeId: string, x: number, y: number, w: number, h: number): Region => ({
  themeId,
  x,
  y,
  w,
  h,
  shape: "rect",
});

describe("containsPoint", () => {
  const r = rect("TH1", 100, 100, 200, 100); // x 100..300, y 100..200

  it("is true inside and false outside", () => {
    expect(containsPoint(r, { x: 200, y: 150 })).toBe(true);
    expect(containsPoint(r, { x: 50, y: 150 })).toBe(false);
    expect(containsPoint(r, { x: 200, y: 400 })).toBe(false);
  });

  it("counts the edge as inside", () => {
    expect(containsPoint(r, { x: 100, y: 100 })).toBe(true);
    expect(containsPoint(r, { x: 300, y: 200 })).toBe(true);
  });

  it("grows by the margin", () => {
    expect(containsPoint(r, { x: 310, y: 150 })).toBe(false);
    expect(containsPoint(r, { x: 310, y: 150 }, 12)).toBe(true);
    expect(containsPoint(r, { x: 313, y: 150 }, 12)).toBe(false);
  });
});

describe("regionsAt", () => {
  // TH1 x 0..100, TH2 x 80..180 — they overlap on x 80..100.
  const regions = [rect("TH1", 0, 0, 100, 100), rect("TH2", 80, 0, 100, 100)];

  it("returns every region containing the point, in the order given", () => {
    expect(regionsAt(regions, { x: 90, y: 50 }, new Set())).toEqual(["TH1", "TH2"]);
    expect(regionsAt(regions, { x: 10, y: 50 }, new Set())).toEqual(["TH1"]);
    expect(regionsAt(regions, { x: 150, y: 50 }, new Set())).toEqual(["TH2"]);
  });

  it("returns nothing when the point is clear of every region", () => {
    expect(regionsAt(regions, { x: 400, y: 400 }, new Set())).toEqual([]);
  });

  it("holds an existing member until it is clear of the hysteresis margin", () => {
    const justOutside = { x: 100 + HYSTERESIS - 1, y: 50 };
    expect(regionsAt(regions, justOutside, new Set(["TH1"]))).toContain("TH1");
    expect(regionsAt(regions, justOutside, new Set())).not.toContain("TH1");
  });

  it("does not hold a member that has gone well clear", () => {
    const wellOutside = { x: 100 + HYSTERESIS + 5, y: 50 };
    expect(regionsAt(regions, wellOutside, new Set(["TH1"]))).not.toContain("TH1");
  });
});

// ---------------------------------------------------------------------------
// planMembership — the twin diff
// ---------------------------------------------------------------------------

function impl(id: string, parentId: string | null, seq: number, extra?: Partial<RippleCard>): RippleCard {
  return {
    id,
    teamId: "T1",
    authorPlayerId: null,
    order: parentId ? "SECOND" : "FIRST",
    parentId,
    sort: 0,
    text: `${id}-text`,
    lensId: null,
    flagged: false,
    greyed: false,
    section: null,
    sourceCardId: null,
    sourceLabel: null,
    plausibility: null,
    impact: null,
    cardKind: null,
    parked: false,
    description: null,
    shortlisted: false,
    twinKey: null,
    createdTime: `2026-01-01T00:00:${String(seq).padStart(2, "0")}Z`,
    ...extra,
  };
}

const LIVE = new Set(["TH1", "TH2", "TH3"]);
const noChildren = () => 0;

describe("planMembership", () => {
  it("reparents a tray card into a theme — no copy, no delete", () => {
    const r1 = impl("R1", null, 1);
    const steps = planMembership({
      cards: [r1],
      key: "R1",
      desired: ["TH1"],
      liveThemeIds: LIVE,
      childCount: noChildren,
    });
    expect(steps).toEqual([{ kind: "reparent", cardId: "R1", parentId: "TH1" }]);
  });

  it("moves between themes with ONE reparent, not a copy plus a delete", () => {
    const r1 = impl("R1", "TH1", 1);
    const steps = planMembership({
      cards: [r1],
      key: "R1",
      desired: ["TH2"],
      liveThemeIds: LIVE,
      childCount: noChildren,
    });
    expect(steps).toEqual([{ kind: "reparent", cardId: "R1", parentId: "TH2" }]);
  });

  it("mints a twin from the anchor when a card enters an overlap", () => {
    const r1 = impl("R1", "TH1", 1, { sourceCardId: "W2A" });
    const steps = planMembership({
      cards: [r1],
      key: "R1",
      desired: ["TH1", "TH2"],
      liveThemeIds: LIVE,
      childCount: noChildren,
    });
    expect(steps).toEqual([{ kind: "copy", fromId: "R1", parentId: "TH2" }]);
  });

  it("deletes the twin, never the row carrying the Week 2 link, when leaving an overlap", () => {
    const anchor = impl("R1", "TH1", 1, { sourceCardId: "W2A", twinKey: "R1" });
    const twin = impl("R2", "TH2", 2, { twinKey: "R1" });
    const steps = planMembership({
      cards: [anchor, twin],
      key: "R1",
      desired: ["TH1"],
      liveThemeIds: LIVE,
      childCount: noChildren,
    });
    expect(steps).toEqual([{ kind: "delete", cardId: "R2" }]);
  });

  it("moves the anchor and deletes the twin when both themes are left for a third", () => {
    const anchor = impl("R1", "TH1", 1, { sourceCardId: "W2A", twinKey: "R1" });
    const twin = impl("R2", "TH2", 2, { twinKey: "R1" });
    const steps = planMembership({
      cards: [anchor, twin],
      key: "R1",
      desired: ["TH3"],
      liveThemeIds: LIVE,
      childCount: noChildren,
    });
    expect(steps).toEqual([
      { kind: "reparent", cardId: "R1", parentId: "TH3" },
      { kind: "delete", cardId: "R2" },
    ]);
  });

  // The headline invariant. Dropping to zero rows frees the (code, source_card_id) slot
  // from 0018, and the facilitator seed panel would re-offer that Week 2 answer.
  it("NEVER leaves zero rows — dragged clear of every region, the anchor is unthemed", () => {
    const anchor = impl("R1", "TH1", 1, { sourceCardId: "W2A", twinKey: "R1" });
    const t2 = impl("R2", "TH2", 2, { twinKey: "R1" });
    const t3 = impl("R3", "TH3", 3, { twinKey: "R1" });
    const steps = planMembership({
      cards: [anchor, t2, t3],
      key: "R1",
      desired: [],
      liveThemeIds: LIVE,
      childCount: noChildren,
    });
    expect(steps).toEqual([
      { kind: "untheme", cardId: "R1" },
      { kind: "delete", cardId: "R2" },
      { kind: "delete", cardId: "R3" },
    ]);
  });

  it("unthemes a lone card rather than deleting it", () => {
    const r1 = impl("R1", "TH1", 1);
    const steps = planMembership({
      cards: [r1],
      key: "R1",
      desired: [],
      liveThemeIds: LIVE,
      childCount: noChildren,
    });
    expect(steps).toEqual([{ kind: "untheme", cardId: "R1" }]);
  });

  it("writes nothing when the card is already exactly where it should be", () => {
    const r1 = impl("R1", "TH1", 1);
    expect(
      planMembership({
        cards: [r1],
        key: "R1",
        desired: ["TH1"],
        liveThemeIds: LIVE,
        childCount: noChildren,
      })
    ).toEqual([]);
  });

  // A row parented under a DELETED theme is invisible to twinIndex and seededIndex, which
  // walk only live themes' clusters. A diff built on those would mint a duplicate.
  it("sees a row stranded under a dead theme and reuses it", () => {
    const stranded = impl("R1", "TH_GONE", 1, { sourceCardId: "W2A" });
    const steps = planMembership({
      cards: [stranded],
      key: "R1",
      desired: ["TH1"],
      liveThemeIds: LIVE,
      childCount: noChildren,
    });
    expect(steps).toEqual([{ kind: "reparent", cardId: "R1", parentId: "TH1" }]);
  });

  it("refuses rather than cascading a delete through an implication that has children", () => {
    const anchor = impl("R1", "TH1", 1, { sourceCardId: "W2A", twinKey: "R1" });
    const twin = impl("R2", "TH2", 2, { twinKey: "R1" });
    const steps = planMembership({
      cards: [anchor, twin],
      key: "R1",
      desired: ["TH1"],
      liveThemeIds: LIVE,
      childCount: (id) => (id === "R2" ? 1 : 0),
    });
    expect(steps.some((s) => s.kind === "delete")).toBe(false);
    expect(steps.find((s) => s.kind === "refuse")).toBeTruthy();
  });

  it("unparks before theming, since reparenting alone leaves the card in the drawer", () => {
    const r1 = impl("R1", null, 1, { parked: true });
    const steps = planMembership({
      cards: [r1],
      key: "R1",
      desired: ["TH1"],
      liveThemeIds: LIVE,
      childCount: noChildren,
    });
    expect(steps).toEqual([
      { kind: "unpark", cardId: "R1" },
      { kind: "reparent", cardId: "R1", parentId: "TH1" },
    ]);
  });

  it("ignores cards belonging to other implications and non-implication kinds", () => {
    const mine = impl("R1", null, 1);
    const other = impl("X1", null, 2);
    const themeRow = impl("TH1", null, 3, { cardKind: "theme" });
    const steps = planMembership({
      cards: [mine, other, themeRow],
      key: "R1",
      desired: ["TH1"],
      liveThemeIds: LIVE,
      childCount: noChildren,
    });
    expect(steps).toEqual([{ kind: "reparent", cardId: "R1", parentId: "TH1" }]);
  });
});

// ---------------------------------------------------------------------------
// coveredBy — the marquee's >=50% rule
// ---------------------------------------------------------------------------

describe("coveredBy", () => {
  const marquee = { x: 0, y: 0, w: 100, h: 100 };
  const CARD = { w: 40, h: 40 };

  it("selects a card wholly inside", () => {
    expect(coveredBy(marquee, [{ key: "A", x: 50, y: 50, ...CARD }])).toEqual(["A"]);
  });

  it("skips a card wholly outside", () => {
    expect(coveredBy(marquee, [{ key: "A", x: 500, y: 500, ...CARD }])).toEqual([]);
  });

  it("selects a card the marquee covers more than half of", () => {
    // Centre at x=95: 15 of its 40 px width sits outside -> 62.5% covered.
    expect(coveredBy(marquee, [{ key: "A", x: 95, y: 50, ...CARD }])).toEqual(["A"]);
  });

  it("skips a card the marquee only clips", () => {
    // Centre at x=108: only 12 of 40 px inside -> 30% covered.
    expect(coveredBy(marquee, [{ key: "A", x: 108, y: 50, ...CARD }])).toEqual([]);
  });

  it("returns keys in the order given", () => {
    const sel = coveredBy(marquee, [
      { key: "A", x: 20, y: 20, ...CARD },
      { key: "Z", x: 900, y: 20, ...CARD },
      { key: "M", x: 60, y: 60, ...CARD },
    ]);
    expect(sel).toEqual(["A", "M"]);
  });
});

// ---------------------------------------------------------------------------
// resolvePositions — the fallback ladder
// ---------------------------------------------------------------------------

describe("resolvePositions", () => {
  const regions = new Map([["TH1", rect("TH1", 1000, 1000, 400, 400)]]);
  const strip = { x: 0, y: 3000 };

  it("prefers a saved position over every fallback", () => {
    const pos = resolvePositions({
      items: [{ key: "A", themeId: "TH1", seat: { x: 7, y: 9 } }],
      regions,
      saved: new Map([["A", { x: 1042, y: 1042 }]]),
      strip,
    });
    expect(pos.get("A")).toEqual({ x: 1042, y: 1042 });
  });

  // Membership can change off the canvas — "Move out of theme" on the theme sheet, a
  // teammate, a refused write — and the saved point must not keep drawing the old answer.
  it("drops a saved position inside a theme the card has since left", () => {
    const pos = resolvePositions({
      items: [{ key: "A", themeId: null, seat: { x: 7, y: 9 } }],
      regions,
      saved: new Map([["A", { x: 1100, y: 1100 }]]),
      strip,
    });
    expect(pos.get("A")).toEqual({ x: 7, y: 9 });
  });

  it("drops a saved position outside the box of a theme the card has since joined", () => {
    const pos = resolvePositions({
      items: [{ key: "A", themeId: "TH1", seat: null }],
      regions,
      saved: new Map([["A", { x: 42, y: 42 }]]),
      strip,
    });
    expect(containsPoint(regions.get("TH1")!, pos.get("A")!)).toBe(true);
  });

  it("keeps a twin's saved position inside any one of its themes", () => {
    const two = new Map([...regions, ["TH2", rect("TH2", 2000, 1000, 400, 400)]]);
    const pos = resolvePositions({
      items: [{ key: "A", themeId: "TH1", themeIds: ["TH1", "TH2"], seat: null }],
      regions: two,
      saved: new Map([["A", { x: 2100, y: 1100 }]]),
      strip,
    });
    expect(pos.get("A")).toEqual({ x: 2100, y: 1100 });
  });

  it("trusts a held or in-flight position even before membership catches up", () => {
    const pos = resolvePositions({
      items: [{ key: "A", themeId: null, seat: { x: 7, y: 9 } }],
      regions,
      saved: new Map([["A", { x: 1100, y: 1100 }]]),
      strip,
      trusted: new Set(["A"]),
    });
    expect(pos.get("A")).toEqual({ x: 1100, y: 1100 });
  });

  // Without this rung the canvas opens LYING on any worked board: the radial layout
  // groups by Week 2 branch, themes cut across branches, so no region would contain its
  // own members.
  it("seats a clustered card inside its theme's region, not at its wheel node", () => {
    const pos = resolvePositions({
      items: [{ key: "A", themeId: "TH1", seat: { x: 7, y: 9 } }],
      regions,
      saved: new Map(),
      strip,
    });
    expect(containsPoint(regions.get("TH1")!, pos.get("A")!)).toBe(true);
  });

  it("gives two cards in one theme different seats, both inside", () => {
    const pos = resolvePositions({
      items: [
        { key: "A", themeId: "TH1", seat: null },
        { key: "B", themeId: "TH1", seat: null },
      ],
      regions,
      saved: new Map(),
      strip,
    });
    expect(pos.get("A")).not.toEqual(pos.get("B"));
    expect(containsPoint(regions.get("TH1")!, pos.get("A")!)).toBe(true);
    expect(containsPoint(regions.get("TH1")!, pos.get("B")!)).toBe(true);
  });

  it("puts an unclustered card in the seat the gather gave it, so a board opens gathered", () => {
    const pos = resolvePositions({
      items: [{ key: "A", themeId: null, seat: { x: 7, y: 9 } }],
      regions,
      saved: new Map(),
      strip,
    });
    expect(pos.get("A")).toEqual({ x: 7, y: 9 });
  });

  it("falls back to its gathered seat when the card's theme has no region drawn yet", () => {
    const pos = resolvePositions({
      items: [{ key: "A", themeId: "TH_NO_REGION", seat: { x: 7, y: 9 } }],
      regions,
      saved: new Map(),
      strip,
    });
    expect(pos.get("A")).toEqual({ x: 7, y: 9 });
  });

  it("piles hand-typed cards with no Week 2 source into the strip", () => {
    const pos = resolvePositions({
      items: [
        { key: "A", themeId: null, seat: null },
        { key: "B", themeId: null, seat: null },
      ],
      regions,
      saved: new Map(),
      strip,
    });
    expect(pos.get("A")!.y).toBeGreaterThanOrEqual(strip.y);
    expect(pos.get("B")!.y).toBeGreaterThanOrEqual(strip.y);
    expect(pos.get("A")).not.toEqual(pos.get("B"));
  });

  it("is deterministic, since every client computes it independently", () => {
    const args = {
      items: [
        { key: "A", themeId: "TH1", seat: null },
        { key: "B", themeId: null, seat: null },
      ],
      regions,
      saved: new Map<string, { x: number; y: number }>(),
      strip,
    };
    expect(resolvePositions(args)).toEqual(resolvePositions(args));
  });
});

// ---------------------------------------------------------------------------
// defaultRegions — a box for every theme that has never had one
// ---------------------------------------------------------------------------

describe("copySeats", () => {
  // 316 x 316 is what an empty theme gets: a 3 x 3 grid, nine seats.
  const region: Region = { themeId: "TH", x: 0, y: 0, w: 316, h: 316, shape: "rect" };
  const at = (p: Pos) => `${p.x},${p.y}`;

  it("seats every copy inside the box, however many there are", () => {
    for (const p of copySeats(region, 30, [])) expect(containsPoint(region, p)).toBe(true);
  });

  it("gives each copy a seat of its own while the box has one", () => {
    const seats = copySeats(region, 6, []);
    expect(new Set(seats.map(at)).size).toBe(6);
  });

  // The whole point: a copy hidden under a card you can drag is the empty-box bug again.
  it("misses the seats real cards are sitting in", () => {
    const real = copySeats(region, 3, []);
    const copies = copySeats(region, 6, real);
    const realSeats = new Set(real.map(at));
    expect(copies.filter((c) => realSeats.has(at(c)))).toEqual([]);
  });

  // Nine seats, three of them taken, eight copies: four of them have nowhere of their own
  // to go. They stack on each other, and still not on the real cards.
  it("stacks copies on copies before it stacks them on a real card", () => {
    const real = copySeats(region, 3, []);
    const copies = copySeats(region, 8, real);
    const realSeats = new Set(real.map(at));
    expect(copies).toHaveLength(8);
    expect(copies.filter((c) => realSeats.has(at(c)))).toEqual([]);
    for (const p of copies) expect(containsPoint(region, p)).toBe(true);
  });

  it("fills every free seat before it doubles up at all", () => {
    expect(new Set(copySeats(region, 9, []).map(at)).size).toBe(9);
  });

  it("is deterministic, since every client seats them independently", () => {
    const occupied = [{ x: 50, y: 50 }];
    expect(copySeats(region, 12, occupied)).toEqual(copySeats(region, 12, occupied));
  });

  it("asks for none, gets none", () => {
    expect(copySeats(region, 0, [])).toEqual([]);
  });
});

describe("defaultRegions", () => {
  const band = { x: 0, y: 1000 };
  const themes = [
    { themeId: "TH1", memberCount: 10 },
    { themeId: "TH2", memberCount: 9 },
    { themeId: "TH3", memberCount: 10 },
    { themeId: "TH4", memberCount: 5 },
    { themeId: "TH5", memberCount: 0 },
  ];

  it("gives every theme a box, in the order given", () => {
    const out = defaultRegions(themes, band, 2000);
    expect(out.map((r) => r.themeId)).toEqual(["TH1", "TH2", "TH3", "TH4", "TH5"]);
  });

  it("gives an empty theme a box you can still see and drop into", () => {
    const empty = defaultRegions(themes, band, 2000).find((r) => r.themeId === "TH5")!;
    expect(empty.w).toBeGreaterThan(0);
    expect(empty.h).toBeGreaterThan(0);
  });

  // The canvas opens with three empty themes on a board that has none, so the empty box is
  // the first thing a group meets and the thing it drags a pile into. Sized for one card it
  // read as a slot for one thing; it has to hold a real cluster without being resized.
  it("sizes an empty theme for a cluster, not for one card", () => {
    const empty = defaultRegions(themes, band, 2000).find((r) => r.themeId === "TH5")!;
    const seats = resolvePositions({
      items: Array.from({ length: 9 }, (_, i) => ({
        key: `TH5-${i}`,
        themeId: "TH5",
        seat: null,
      })),
      regions: new Map([["TH5", empty]]),
      saved: new Map(),
      strip: { x: 0, y: 0 },
    });
    expect(seats.size).toBe(9);
    // Every one inside the box, and every one in a seat of its own: seatInRegion wraps
    // its grid, so an overfull box stacks circles on top of each other rather than
    // spilling, and "it fits" has to mean nine distinct seats.
    for (const p of seats.values()) expect(containsPoint(empty, p)).toBe(true);
    expect(new Set([...seats.values()].map((p) => `${p.x},${p.y}`)).size).toBe(9);
  });

  // The whole point: a box has to be able to hold its own members, or the view opens
  // showing a theme in violation of itself.
  it("makes a box big enough to seat every member inside it", () => {
    for (const r of defaultRegions(themes, band, 2000)) {
      const n = themes.find((t) => t.themeId === r.themeId)!.memberCount;
      const seats = resolvePositions({
        items: Array.from({ length: n }, (_, i) => ({
          key: `${r.themeId}-${i}`,
          themeId: r.themeId,
          seat: null,
        })),
        regions: new Map([[r.themeId, r]]),
        saved: new Map(),
        strip: { x: 0, y: 0 },
      });
      expect(seats.size).toBe(n);
      for (const p of seats.values()) expect(containsPoint(r, p)).toBe(true);
    }
  });

  it("never overlaps two boxes, so a card is never in two themes by accident", () => {
    const out = defaultRegions(themes, band, 900);
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i];
        const b = out[j];
        const apart =
          a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
        expect(apart).toBe(true);
      }
    }
  });

  it("wraps onto a new row rather than running off to the right forever", () => {
    const out = defaultRegions(themes, band, 900);
    expect(out.every((r) => r.x + r.w <= band.x + 900)).toBe(true);
    expect(new Set(out.map((r) => r.y)).size).toBeGreaterThan(1);
  });

  it("starts at the band and never above it", () => {
    for (const r of defaultRegions(themes, band, 2000)) {
      expect(r.x).toBeGreaterThanOrEqual(band.x);
      expect(r.y).toBeGreaterThanOrEqual(band.y);
    }
  });

  it("is deterministic, since every client derives it independently", () => {
    expect(defaultRegions(themes, band, 900)).toEqual(defaultRegions(themes, band, 900));
  });
});

// ---------------------------------------------------------------------------
// freeGrid — "Spread out" has to miss every box
// ---------------------------------------------------------------------------

describe("freeGrid", () => {
  const regions = [rect("TH1", 300, 0, 400, 400), rect("TH2", 0, 600, 500, 300)];

  it("returns exactly as many slots as asked for", () => {
    expect(freeGrid(25, [], { x: 120, y: 120 })).toHaveLength(25);
    expect(freeGrid(25, regions, { x: 120, y: 120 })).toHaveLength(25);
    expect(freeGrid(0, regions, { x: 120, y: 120 })).toHaveLength(0);
  });

  // The whole point. A loose card dropped inside a theme's box would read as a member of
  // that theme without being one, and membership only changes on a drag.
  it("never puts a card where it would touch a theme's box", () => {
    for (const p of freeGrid(60, regions, { x: 120, y: 120 })) {
      for (const r of regions) {
        expect(containsPoint(r, p, NODE_RADIUS)).toBe(false);
      }
    }
  });

  it("gives every card its own slot", () => {
    const out = freeGrid(60, regions, { x: 120, y: 120 });
    expect(new Set(out.map((p) => `${p.x},${p.y}`)).size).toBe(out.length);
  });

  it("lays out a plain grid when nothing is in the way", () => {
    const out = freeGrid(4, [], { x: 100, y: 100 });
    expect(out[0]).toEqual({ x: 100, y: 100 });
    expect(out.every((p) => p.x >= 100 && p.y >= 100)).toBe(true);
  });

  it("is deterministic", () => {
    expect(freeGrid(40, regions, { x: 120, y: 120 })).toEqual(
      freeGrid(40, regions, { x: 120, y: 120 })
    );
  });

  it("gets out of the way even when a box sits right on the origin", () => {
    const over = [rect("TH1", 0, 0, 1200, 500)];
    for (const p of freeGrid(12, over, { x: 120, y: 120 })) {
      expect(containsPoint(over[0], p, NODE_RADIUS)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// blockers — boxes never overlap
// ---------------------------------------------------------------------------

const NONE: ReadonlySet<string> = new Set();

describe("blockers", () => {
  const a = rect("A", 0, 0, 200, 200);

  it("never reports the box against itself", () => {
    expect(blockers(a, [a], NONE)).toEqual([]);
  });

  it("reports collisions in the order the boxes were given", () => {
    const near1 = rect("B", 190, 0, 100, 100);
    const near2 = rect("C", 0, 190, 100, 100);
    expect(blockers(a, [near2, near1], NONE)).toEqual(["C", "B"]);
  });

  it("enforces the clearance exactly", () => {
    // A ends at x=200. A neighbour starting 23px later is too close; 24 is clear.
    expect(blockers(a, [rect("B", 223, 0, 50, 50)], NONE)).toEqual(["B"]);
    expect(blockers(a, [rect("B", 224, 0, 50, 50)], NONE)).toEqual([]);
  });

  it("treats a shared edge as a collision", () => {
    // containsPoint counts edges as inside, so two boxes meeting exactly would make a
    // card on that edge a member of both with no gesture at all.
    expect(blockers(a, [rect("B", 200, 0, 50, 50)], NONE)).toEqual(["B"]);
  });

  it("ignores an overlap it inherited, so an already-overlapping box stays movable", () => {
    const sitting = rect("B", 100, 100, 200, 200); // drawn over A before the rule existed
    expect(blockers(a, [sitting], NONE)).toEqual(["B"]);
    expect(blockers(a, [sitting], new Set(["B"]))).toEqual([]);
  });

  it("still reports a NEW collision while tolerating an old one", () => {
    const old = rect("B", 100, 100, 200, 200);
    const fresh = rect("C", 190, 0, 100, 100);
    expect(blockers(a, [old, fresh], new Set(["B"]))).toEqual(["C"]);
  });

  it("is clear when everything is far away", () => {
    expect(blockers(a, [rect("B", 900, 900, 50, 50)], NONE)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// cardsInRegion — what travels with a box
// ---------------------------------------------------------------------------

describe("cardsInRegion", () => {
  const box = rect("TH1", 100, 100, 200, 200);
  const card = (key: string, x: number, y: number) => ({ key, x, y, w: 76, h: 76 });

  it("takes a card whose CENTRE is inside, and leaves one whose centre is outside", () => {
    expect(cardsInRegion(box, [card("in", 150, 150), card("out", 500, 500)])).toEqual(["in"]);
  });

  it("counts a centre exactly on the edge as inside", () => {
    expect(cardsInRegion(box, [card("edge", 100, 100)])).toEqual(["edge"]);
  });

  it("keeps the order it was given", () => {
    const out = cardsInRegion(box, [card("a", 110, 110), card("z", 900, 900), card("m", 200, 200)]);
    expect(out).toEqual(["a", "m"]);
  });
});

// ---------------------------------------------------------------------------
// resizeFloor / containsRect — a box can never shrink past its members
// ---------------------------------------------------------------------------

describe("resizeFloor", () => {
  const box = rect("TH1", 100, 100, 400, 400);

  it("is null when the box holds nothing of its own", () => {
    expect(resizeFloor(box, [])).toBeNull();
  });

  it("contains every member it was built from", () => {
    const members = [{ x: 150, y: 150 }, { x: 420, y: 300 }];
    const floor = resizeFloor(box, members)!;
    for (const m of members) {
      expect(m.x).toBeGreaterThanOrEqual(floor.x);
      expect(m.x).toBeLessThanOrEqual(floor.x + floor.w);
      expect(m.y).toBeGreaterThanOrEqual(floor.y);
      expect(m.y).toBeLessThanOrEqual(floor.y + floor.h);
    }
  });

  // Without the intersection, a member drawn hard against an edge pushes the padded floor
  // outside the box — the floor is unsatisfied the instant the handle is grabbed and the
  // box cannot be resized in ANY direction, with nothing on screen to say why.
  it("never escapes the box it came from, even for a member hard against an edge", () => {
    const floor = resizeFloor(box, [{ x: 100, y: 100 }, { x: 500, y: 500 }])!;
    expect(containsRect(box, floor)).toBe(true);
  });

  it("stays inside the box for any members drawn inside it", () => {
    // Deterministic pseudo-random, so a failure is reproducible.
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let trial = 0; trial < 200; trial++) {
      const members = Array.from({ length: 1 + Math.floor(rnd() * 6) }, () => ({
        x: box.x + rnd() * box.w,
        y: box.y + rnd() * box.h,
      }));
      expect(containsRect(box, resizeFloor(box, members)!)).toBe(true);
    }
  });
});

describe("containsRect", () => {
  it("is true for a rect wholly within, including flush edges", () => {
    expect(containsRect({ x: 0, y: 0, w: 100, h: 100 }, { x: 0, y: 0, w: 100, h: 100 })).toBe(true);
    expect(containsRect({ x: 0, y: 0, w: 100, h: 100 }, { x: 10, y: 10, w: 20, h: 20 })).toBe(true);
  });
  it("is false when the inner rect pokes out on any side", () => {
    const o = { x: 0, y: 0, w: 100, h: 100 };
    expect(containsRect(o, { x: -1, y: 0, w: 10, h: 10 })).toBe(false);
    expect(containsRect(o, { x: 95, y: 0, w: 10, h: 10 })).toBe(false);
    expect(containsRect(o, { x: 0, y: 95, w: 10, h: 10 })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// resizeTo — the opposite corner anchors
// ---------------------------------------------------------------------------

describe("resizeTo", () => {
  const box = rect("TH1", 100, 100, 400, 300); // 100..500 x, 100..400 y

  it("holds the opposite corner still, for every corner", () => {
    expect(resizeTo(box, "se", { x: 700, y: 600 })).toMatchObject({ x: 100, y: 100 });
    expect(resizeTo(box, "nw", { x: 50, y: 60 })).toMatchObject({ x: 50, y: 60, w: 450, h: 340 });
    const ne = resizeTo(box, "ne", { x: 700, y: 60 });
    expect(ne).toMatchObject({ x: 100, y: 60 });
    expect(ne.x + ne.w).toBe(700);
    const sw = resizeTo(box, "sw", { x: 50, y: 600 });
    expect(sw).toMatchObject({ x: 50, y: 100 });
    expect(sw.y + sw.h).toBe(600);
  });

  it("never lets the dragged corner cross its anchor", () => {
    // Dragging SE far past the NW anchor would flip the box through itself and land it
    // somewhere nobody aimed at.
    const flipped = resizeTo(box, "se", { x: -500, y: -500 });
    expect(flipped.w).toBe(MIN_REGION);
    expect(flipped.h).toBe(MIN_REGION);
    expect(flipped.x).toBe(100);
    expect(flipped.y).toBe(100);
  });

  it("clamps at the origin, because the surface has no negative space", () => {
    const r = resizeTo(box, "nw", { x: -300, y: -300 });
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
  });

  it("always returns a drawable box — 0028 has CHECK (w > 0, h > 0)", () => {
    for (const corner of ["nw", "ne", "sw", "se"] as const) {
      for (const pt of [{ x: 0, y: 0 }, { x: 1e6, y: 1e6 }, { x: 300, y: 250 }, { x: -1e6, y: 5 }]) {
        const r = resizeTo(box, corner, pt);
        expect(r.w).toBeGreaterThan(0);
        expect(r.h).toBeGreaterThan(0);
        expect(r.w).toBeGreaterThanOrEqual(MIN_REGION);
        expect(r.h).toBeGreaterThanOrEqual(MIN_REGION);
      }
    }
  });

  it("keeps the theme it belongs to", () => {
    expect(resizeTo(box, "se", { x: 600, y: 600 }).themeId).toBe("TH1");
  });
});

// ---------------------------------------------------------------------------
// gather — the reverse of Spread out
// ---------------------------------------------------------------------------

describe("gather", () => {
  const groups = [
    { groupId: "K1", label: "Cross-sector work", keys: ["a", "b", "c", "d", "e", "f"] },
    { groupId: "K2", label: "Decentralization", keys: ["g", "h", "i"] },
    { groupId: "K3", label: "Funding", keys: ["j", "k"] },
  ];
  const origin = { x: 60, y: 60 };

  it("places every key exactly once", () => {
    const { positions } = gather({ groups, regions: [], origin, maxWidth: 2000 });
    expect(positions.map((p) => p.itemId).sort()).toEqual(
      ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k"]
    );
  });

  it("drops empty groups rather than drawing an empty caption", () => {
    const { clumps } = gather({
      groups: [...groups, { groupId: "K4", label: "Unused", keys: [] }],
      regions: [],
      origin,
      maxWidth: 2000,
    });
    expect(clumps.map((c) => c.groupId)).toEqual(["K1", "K2", "K3"]);
  });

  // The same invariant freeGrid holds, but tested at clump granularity so a pile stays a
  // pile instead of being shredded around the boxes.
  it("never puts a card where it would touch a theme's box", () => {
    const regions = [rect("TH1", 0, 0, 600, 400), rect("TH2", 800, 300, 400, 400)];
    const { positions } = gather({ groups, regions, origin, maxWidth: 2200 });
    expect(positions).toHaveLength(11);
    for (const p of positions) {
      for (const r of regions) {
        expect(containsPoint(r, p, NODE_RADIUS)).toBe(false);
      }
    }
  });

  it("keeps the clumps apart from each other", () => {
    const { clumps } = gather({ groups, regions: [], origin, maxWidth: 2000 });
    for (let i = 0; i < clumps.length; i++) {
      for (let j = i + 1; j < clumps.length; j++) {
        const a = clumps[i];
        const b = clumps[j];
        const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
        expect(apart).toBe(true);
      }
    }
  });

  it("puts each clump's own cards inside its own footprint", () => {
    const { positions, clumps } = gather({ groups, regions: [], origin, maxWidth: 2000 });
    const at = new Map(positions.map((p) => [p.itemId, p]));
    for (const clump of clumps) {
      for (const key of clump.keys) {
        const p = at.get(key)!;
        expect(p.x).toBeGreaterThanOrEqual(clump.x);
        expect(p.x).toBeLessThanOrEqual(clump.x + clump.w);
        expect(p.y).toBeGreaterThanOrEqual(clump.y);
        expect(p.y).toBeLessThanOrEqual(clump.y + clump.h);
      }
    }
  });

  it("carries the label through for the caption", () => {
    const { clumps } = gather({ groups, regions: [], origin, maxWidth: 2000 });
    expect(clumps.map((c) => c.label)).toEqual(["Cross-sector work", "Decentralization", "Funding"]);
  });

  it("is deterministic, since every client lays it out independently", () => {
    const args = { groups, regions: [rect("TH1", 0, 0, 500, 500)], origin, maxWidth: 1400 };
    expect(gather(args)).toEqual(gather(args));
  });

  it("still places everything when boxes cover the origin area", () => {
    const regions = Array.from({ length: 6 }, (_, i) =>
      rect(`TH${i}`, 0, i * 300, 2000, 280)
    );
    const { positions } = gather({ groups, regions, origin, maxWidth: 1800 });
    expect(positions).toHaveLength(11);
    for (const p of positions) {
      for (const r of regions) expect(containsPoint(r, p, NODE_RADIUS)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// pileLabels — a caption only while the cards are still in a pile
// ---------------------------------------------------------------------------

const pos = (x: number, y: number) => ({ x, y });
const groupOf = (groupId: string, cards: { x: number; y: number }[]) => ({
  groupId,
  label: groupId,
  cards,
});

describe("isPile", () => {
  // Gather's own lattice: PITCH apart, axis-aligned.
  const lattice = (n: number) => {
    const { cols } = clumpGrid(n);
    return Array.from({ length: n }, (_, i) =>
      pos(500 + (i % cols) * 88, 300 + Math.floor(i / cols) * 88)
    );
  };

  it("accepts what Gather lays down, at every size", () => {
    for (let n = 1; n <= 24; n++) expect(isPile(lattice(n))).toBe(true);
  });

  it("does not care where the pile sits — only how it is arranged", () => {
    const moved = lattice(9).map((p) => pos(p.x + 1234.5, p.y - 77.25));
    expect(isPile(moved)).toBe(true);
  });

  it("survives a card being nudged, and a card leaving", () => {
    const nudged = lattice(9).map((p, i) => (i === 4 ? pos(p.x + 20, p.y - 18) : p));
    expect(isPile(nudged)).toBe(true);
    expect(isPile(lattice(9).slice(0, 8))).toBe(true);
  });

  it("breaks when a card is dragged a whole slot out", () => {
    const broken = lattice(9).map((p, i) => (i === 4 ? pos(p.x + 420, p.y + 260) : p));
    expect(isPile(broken)).toBe(false);
  });

  it("refuses two cards stacked in one slot", () => {
    const stacked = [...lattice(6)];
    stacked[5] = { ...stacked[0] };
    expect(isPile(stacked)).toBe(false);
  });

  it("refuses a Spread out grid, whose pitch and columns are different", () => {
    for (let n = 4; n <= 24; n++) {
      expect(isPile(freeGrid(n, [], { x: 120, y: 120 }))).toBe(false);
    }
  });
});

describe("pileLabels", () => {
  const lattice = (n: number, ox: number, oy: number) => {
    const { cols } = clumpGrid(n);
    return Array.from({ length: n }, (_, i) =>
      pos(ox + (i % cols) * 88, oy + Math.floor(i / cols) * 88)
    );
  };

  // The round trip. This is the test that fails if anyone changes PITCH or the clump grid
  // on one side only — a pile would then be labelled the instant it was made and never
  // again.
  it("labels every clump Gather itself produces", () => {
    for (let n = MIN_PILE; n <= 24; n++) {
      const keys = Array.from({ length: n }, (_, i) => `c${i}`);
      const plan = gather({
        groups: [{ groupId: "K1", label: "Key one", keys }],
        regions: [],
        origin: { x: 60, y: 60 },
        maxWidth: 2000,
      });
      const labels = pileLabels([groupOf("K1", plan.positions)]);
      expect(labels.map((l) => l.groupId)).toEqual(["K1"]);
      expect(labels[0].count).toBe(n);
    }
  });

  it("labels nothing after a Spread out", () => {
    const slots = freeGrid(18, [], { x: 120, y: 120 });
    expect(pileLabels([groupOf("K1", slots)])).toEqual([]);
  });

  it("honours the minimum, so two cards are not a pile", () => {
    expect(pileLabels([groupOf("K1", lattice(2, 100, 100))])).toEqual([]);
    expect(pileLabels([groupOf("K1", lattice(3, 100, 100))]).length).toBe(1);
  });

  it("drops both labels when two piles are pushed into each other", () => {
    const apart = [groupOf("A", lattice(6, 100, 100)), groupOf("B", lattice(6, 900, 100))];
    expect(pileLabels(apart).map((l) => l.groupId)).toEqual(["A", "B"]);
    const overlapping = [groupOf("A", lattice(6, 100, 100)), groupOf("B", lattice(6, 180, 140))];
    expect(pileLabels(overlapping)).toEqual([]);
  });

  it("boxes the pile so a caption can sit on its top edge", () => {
    const [l] = pileLabels([groupOf("K1", lattice(6, 500, 400))]);
    for (const p of lattice(6, 500, 400)) {
      expect(p.x).toBeGreaterThanOrEqual(l.box.x);
      expect(p.y).toBeGreaterThanOrEqual(l.box.y);
      expect(p.x).toBeLessThanOrEqual(l.box.x + l.box.w);
      expect(p.y).toBeLessThanOrEqual(l.box.y + l.box.h);
    }
    // Grown by a card's radius, so the box is the DRAWN pile, not the centres.
    expect(l.box.x).toBe(500 - NODE_RADIUS);
  });

  it("keeps the order it was given, and is deterministic", () => {
    const gs = [groupOf("B", lattice(5, 100, 100)), groupOf("A", lattice(5, 900, 900))];
    expect(pileLabels(gs).map((l) => l.groupId)).toEqual(["B", "A"]);
    expect(pileLabels(gs)).toEqual(pileLabels(gs));
  });
});

describe("pileLabels on the opening wheel", () => {
  // A board of `keys` key changes, each fanning out `orders` levels. Depth is walked from
  // parentage (depthByCard), so the order string on a descendant does not matter.
  function wheelBoard(keys: number, orders: number, fanout = 3) {
    const cards: RippleCard[] = [];
    const rootOf = new Map<string, string>();
    let seq = 0;
    for (let k = 0; k < keys; k++) {
      const rootId = `K${k}`;
      cards.push(impl(rootId, null, seq++));
      let level = [rootId];
      for (let o = 0; o < orders; o++) {
        const next: string[] = [];
        for (const parent of level) {
          for (let f = 0; f < fanout; f++) {
            const id = `${parent}_${o}${f}`;
            cards.push(impl(id, parent, seq++));
            rootOf.set(id, rootId);
            next.push(id);
          }
        }
        level = next;
      }
    }
    return { cards, rootOf };
  }

  // The premise this replaced: that wheel branches would overlap and so stay unlabelled.
  // They do not — place() puts each node at the MIDPOINT of its angular span, so a branch
  // hugs its mid-ray and the branches are spokes rather than wedges. Spokes separate
  // cleanly, and a disjointness test would caption every branch of a small board the
  // moment the canvas opened. The lattice test is what actually tells the wheel apart
  // from a gathered pile.
  for (const [keys, orders] of [
    [2, 1],
    [3, 2],
    [4, 2],
    [5, 2],
    [3, 3],
  ] as const) {
    it(`says nothing about a ${keys}-key, ${orders}-order wheel`, () => {
      const { cards, rootOf } = wheelBoard(keys, orders);
      const nodes = new Map(layout(cards).nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
      const groups = new Map<string, { x: number; y: number }[]>();
      for (const [id, root] of rootOf) {
        const at = nodes.get(id);
        if (at) groups.set(root, [...(groups.get(root) ?? []), at]);
      }
      const asGroups = [...groups].map(([root, cardsAt]) => groupOf(root, cardsAt));

      // The teeth of this test: the branches ARE mutually disjoint, so the bounding-box
      // rule this replaced would have captioned every one of them the moment the canvas
      // opened. Spokes separate; only the lattice test tells them from a gathered pile.
      const boxes = asGroups.map((g) => boundsOf(g.cards)!);
      const someDisjoint = boxes.some((a, i) =>
        boxes.some((b, j) => i !== j && !rectsOverlap(a, b))
      );
      expect(someDisjoint).toBe(true);

      expect(pileLabels(asGroups)).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------
// The opening layout and the Gather button lay down the same lattice
// ---------------------------------------------------------------------------

describe("gather feeding resolvePositions", () => {
  const groups = [
    { groupId: "K1", label: "Cross-sector work", keys: ["a", "b", "c", "d", "e", "f"] },
    { groupId: "K2", label: "Decentralization", keys: ["g", "h", "i", "j"] },
    { groupId: "K3", label: "Funding", keys: ["k", "l", "m"] },
  ];

  // THE test for this design. A board opens on seats taken straight from gather(), and the
  // pile rule reads those same seats back. If the two ever drift — a different origin, a
  // different pitch, a stray literal at one call site — captions float over piles that are
  // not there. This is the assertion that makes that impossible to do quietly.
  it("opens gathered, and every pile it draws is one pileLabels recognises", () => {
    const plan = gather({ groups, regions: [] });
    const positions = resolvePositions({
      items: groups.flatMap((g) =>
        g.keys.map((key) => ({ key, themeId: null, seat: gatherSeats(plan).get(key) ?? null }))
      ),
      regions: new Map(),
      saved: new Map(),
      strip: { x: 0, y: gatherBottom(plan) },
    });

    const labels = pileLabels(
      groups.map((g) => groupOf(g.groupId, g.keys.map((k) => positions.get(k)!)))
    );
    expect(labels.map((l) => l.groupId)).toEqual(["K1", "K2", "K3"]);
  });

  it("seats every key exactly once", () => {
    const seats = gatherSeats(gather({ groups, regions: [] }));
    expect([...seats.keys()].sort()).toEqual(groups.flatMap((g) => g.keys).sort());
  });

  it("takes its frame from the shared constants when none is given", () => {
    expect(gather({ groups, regions: [] })).toEqual(
      gather({ groups, regions: [], origin: GATHER_ORIGIN, maxWidth: GATHER_WIDTH })
    );
  });

  it("puts the bottom below every card it placed, so the strip and the band clear it", () => {
    const plan = gather({ groups, regions: [] });
    const bottom = gatherBottom(plan);
    for (const p of plan.positions) expect(p.y + NODE_RADIUS).toBeLessThanOrEqual(bottom);
  });

  it("places everything even when a clump cannot be laid out as a clump", () => {
    // Boxes tiling the origin area force the freeGrid fallback, which is the path that
    // used to be able to emit a position with no coordinates.
    const regions = Array.from({ length: 8 }, (_, i) => rect(`TH${i}`, 0, i * 300, 4000, 280));
    const plan = gather({ groups, regions });
    expect(plan.positions).toHaveLength(13);
    for (const p of plan.positions) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });
});
