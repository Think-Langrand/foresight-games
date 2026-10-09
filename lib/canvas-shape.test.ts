import { describe, it, expect } from "vitest";
import {
  HYSTERESIS,
  containsPoint,
  coveredBy,
  defaultRegions,
  growToFit,
  planMembership,
  regionsAt,
  resolvePositions,
  type Region,
} from "./canvas-shape";
import type { RippleCard } from "./ripples-types";

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
// growToFit — regions grow, never shrink
// ---------------------------------------------------------------------------

describe("growToFit", () => {
  const r = rect("TH1", 100, 100, 100, 100); // 100..200 both axes

  it("leaves a region alone when every member is already inside", () => {
    expect(growToFit(r, [{ x: 150, y: 150 }], 0)).toEqual(r);
  });

  it("stretches to take in a member that has moved outside", () => {
    const grown = growToFit(r, [{ x: 150, y: 150 }, { x: 400, y: 150 }], 0);
    expect(containsPoint(grown, { x: 400, y: 150 })).toBe(true);
    expect(containsPoint(grown, { x: 150, y: 150 })).toBe(true);
  });

  it("never shrinks, however tightly the members cluster", () => {
    const grown = growToFit(r, [{ x: 150, y: 150 }], 0);
    expect(grown.x).toBeLessThanOrEqual(r.x);
    expect(grown.y).toBeLessThanOrEqual(r.y);
    expect(grown.w).toBeGreaterThanOrEqual(r.w);
    expect(grown.h).toBeGreaterThanOrEqual(r.h);
  });

  it("leaves padding around a newly taken-in member", () => {
    const grown = growToFit(r, [{ x: 400, y: 150 }], 30);
    expect(containsPoint(grown, { x: 425, y: 150 })).toBe(true);
  });

  it("keeps a region drawable when it has no members at all", () => {
    expect(growToFit(r, [], 20)).toEqual(r);
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
      items: [{ key: "A", themeId: "TH1", wheel: { x: 7, y: 9 } }],
      regions,
      saved: new Map([["A", { x: 42, y: 42 }]]),
      strip,
    });
    expect(pos.get("A")).toEqual({ x: 42, y: 42 });
  });

  // Without this rung the canvas opens LYING on any worked board: the radial layout
  // groups by Week 2 branch, themes cut across branches, so no region would contain its
  // own members.
  it("seats a clustered card inside its theme's region, not at its wheel node", () => {
    const pos = resolvePositions({
      items: [{ key: "A", themeId: "TH1", wheel: { x: 7, y: 9 } }],
      regions,
      saved: new Map(),
      strip,
    });
    expect(containsPoint(regions.get("TH1")!, pos.get("A")!)).toBe(true);
  });

  it("gives two cards in one theme different seats, both inside", () => {
    const pos = resolvePositions({
      items: [
        { key: "A", themeId: "TH1", wheel: null },
        { key: "B", themeId: "TH1", wheel: null },
      ],
      regions,
      saved: new Map(),
      strip,
    });
    expect(pos.get("A")).not.toEqual(pos.get("B"));
    expect(containsPoint(regions.get("TH1")!, pos.get("A")!)).toBe(true);
    expect(containsPoint(regions.get("TH1")!, pos.get("B")!)).toBe(true);
  });

  it("puts an unclustered card at its wheel node, so a fresh board opens as the map", () => {
    const pos = resolvePositions({
      items: [{ key: "A", themeId: null, wheel: { x: 7, y: 9 } }],
      regions,
      saved: new Map(),
      strip,
    });
    expect(pos.get("A")).toEqual({ x: 7, y: 9 });
  });

  it("falls back to the wheel when the card's theme has no region drawn yet", () => {
    const pos = resolvePositions({
      items: [{ key: "A", themeId: "TH_NO_REGION", wheel: { x: 7, y: 9 } }],
      regions,
      saved: new Map(),
      strip,
    });
    expect(pos.get("A")).toEqual({ x: 7, y: 9 });
  });

  it("piles hand-typed cards with no Week 2 source into the strip", () => {
    const pos = resolvePositions({
      items: [
        { key: "A", themeId: null, wheel: null },
        { key: "B", themeId: null, wheel: null },
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
        { key: "A", themeId: "TH1", wheel: null },
        { key: "B", themeId: null, wheel: null },
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

  // The whole point: a box has to be able to hold its own members, or the view opens
  // showing a theme in violation of itself.
  it("makes a box big enough to seat every member inside it", () => {
    for (const r of defaultRegions(themes, band, 2000)) {
      const n = themes.find((t) => t.themeId === r.themeId)!.memberCount;
      const seats = resolvePositions({
        items: Array.from({ length: n }, (_, i) => ({
          key: `${r.themeId}-${i}`,
          themeId: r.themeId,
          wheel: null,
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
