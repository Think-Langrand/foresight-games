import { describe, it, expect } from "vitest";
import { flipsForBoard, scoresForItems, weightsForThemes } from "./cohort-analysis-shape";
import type { CardKind, CardOrder, RippleCard } from "@/lib/ripples-types";
import type { CohortTheme } from "./cohort-cluster-shape";

function card(
  id: string,
  over: Partial<RippleCard> & { order?: CardOrder; cardKind?: CardKind | null } = {}
): RippleCard {
  return {
    id,
    teamId: "T",
    authorPlayerId: "P1",
    order: over.order ?? "FIRST",
    parentId: over.parentId ?? null,
    text: over.text ?? `${id}-text`,
    lensId: null,
    flagged: false,
    greyed: false,
    sort: over.sort ?? 0,
    section: null,
    sourceCardId: over.sourceCardId ?? null,
    sourceLabel: null,
    plausibility: over.plausibility ?? null,
    impact: over.impact ?? null,
    cardKind: over.cardKind ?? null,
    parked: over.parked ?? false,
    description: over.description ?? null,
    shortlisted: over.shortlisted ?? false,
    twinKey: over.twinKey ?? null,
    createdTime: over.createdTime ?? "2026-01-01T00:00:00Z",
  };
}

// Session 2: two scored key changes, each with one implication under it. The third key
// change was never scored, which is the normal case for a group that ran out of time.
const week2 = () => [
  card("k1", { order: "FIRST", text: "fewer staff", plausibility: 4, impact: 5 }),
  card("i1", { order: "SECOND", parentId: "k1", text: "services rationed" }),
  card("k2", { order: "FIRST", text: "funding volatile", plausibility: 2, impact: 3 }),
  card("i2", { order: "SECOND", parentId: "k2", text: "programs end mid-year" }),
  card("k3", { order: "FIRST", text: "unscored change" }),
  card("i3", { order: "SECOND", parentId: "k3", text: "nobody scored this branch" }),
];

// Session 3: one theme holding copies of i1 and i2 (seeded from Session 2), with a risk on
// it; plus a fear flipped into a hope and a fear left standing.
const week3 = () => [
  card("t1", { cardKind: "theme", text: "Workforce capacity" }),
  card("c1", { parentId: "t1", sourceCardId: "i1", text: "services rationed" }),
  card("c2", { parentId: "t1", sourceCardId: "i2", text: "programs end mid-year" }),
  card("rk1", { cardKind: "risk", parentId: "t1", text: "clinics close" }),
  card("f1", { cardKind: "fear", text: "people lose access" }),
  card("h1", { cardKind: "hope", parentId: "f1", text: "access holds up" }),
  card("f2", { cardKind: "fear", text: "nothing changes" }),
];

describe("scoresForItems", () => {
  it("scores an implication from the key change it hangs under", () => {
    const s = scoresForItems({
      source: "implications",
      week2Cards: week2(),
      week3Cards: [],
      itemIds: ["i1", "i2"],
    });
    expect(s.get("i1")).toEqual({ plausibility: 4, impact: 5 });
    expect(s.get("i2")).toEqual({ plausibility: 2, impact: 3 });
  });

  it("gives no score to an implication whose key change was never scored", () => {
    const s = scoresForItems({
      source: "implications",
      week2Cards: week2(),
      week3Cards: [],
      itemIds: ["i3"],
    });
    expect(s.has("i3")).toBe(false);
  });

  // A risk is written on a Session 3 theme, and that theme holds implications that were
  // seeded from Session 2. So a risk's weight is the mean of the key-change scores behind
  // its theme -- inherited through two hops, which is why `n` travels with it everywhere.
  it("scores a risk from the key changes behind its theme's implications", () => {
    const s = scoresForItems({
      source: "risks",
      week2Cards: week2(),
      week3Cards: week3(),
      itemIds: ["rk1"],
    });
    expect(s.get("rk1")).toEqual({ plausibility: 3, impact: 4 }); // mean of (4,5) and (2,3)
  });

  it("gives no score to a board-level hope, which hangs under no theme at all", () => {
    const s = scoresForItems({
      source: "hopes",
      week2Cards: week2(),
      week3Cards: week3(),
      itemIds: ["h1"],
    });
    expect(s.has("h1")).toBe(false);
  });

  it("returns an empty map rather than throwing when there is no Session 2 board", () => {
    expect(
      scoresForItems({ source: "risks", week2Cards: [], week3Cards: week3(), itemIds: ["rk1"] }).size
    ).toBe(0);
  });
});

describe("weightsForThemes", () => {
  const theme = (memberIds: string[]): CohortTheme => ({
    label: "A theme",
    summary: null,
    memberIds,
    cohesion: null,
    byGroup: [],
    groupCount: 0,
  });

  it("averages the scores its members carry", () => {
    const scores = new Map([
      ["a", { plausibility: 4, impact: 5 }],
      ["b", { plausibility: 2, impact: 3 }],
    ]);
    expect(weightsForThemes([theme(["a", "b"])], scores)[0]).toEqual({
      plausibility: 3,
      impact: 4,
      n: 2,
      missing: 0,
    });
  });

  // The whole point of carrying n and missing: a theme positioned from one member out of
  // nine is a dot in the same place as a theme positioned from all nine, and the view has
  // to be able to say so. A theme with no scored member gets null, never 0 -- plotting an
  // unscored theme at the origin would read as "the cohort thought this was implausible
  // and harmless", which is the opposite of "nobody scored it".
  it("reports how many members had a score and how many did not", () => {
    const scores = new Map([["a", { plausibility: 4, impact: 4 }]]);
    expect(weightsForThemes([theme(["a", "b", "c"])], scores)[0]).toEqual({
      plausibility: 4,
      impact: 4,
      n: 1,
      missing: 2,
    });
  });

  it("gives a theme with no scored member null coordinates, not zero", () => {
    expect(weightsForThemes([theme(["x"])], new Map())[0]).toEqual({
      plausibility: null,
      impact: null,
      n: 0,
      missing: 1,
    });
  });

  it("returns one weight per theme, in the same order", () => {
    const out = weightsForThemes([theme(["a"]), theme(["b"])], new Map());
    expect(out).toHaveLength(2);
  });
});

describe("flipsForBoard", () => {
  it("pairs each fear with what the room flipped it into", () => {
    const out = flipsForBoard(week3(), "g1");
    expect(out.groupId).toBe("g1");
    expect(out.total).toBe(2);
    expect(out.flipped).toBe(1);
    const f1 = out.entries.find((e) => e.fearId === "f1");
    expect(f1?.fearText).toBe("people lose access");
    expect(f1?.hopes.map((h) => h.text)).toEqual(["access holds up"]);
    expect(f1?.flipped).toBe(true);
  });

  it("keeps a fear that was left standing, which is the more interesting half", () => {
    const f2 = flipsForBoard(week3(), "g1").entries.find((e) => e.fearId === "f2");
    expect(f2?.hopes).toEqual([]);
    expect(f2?.flipped).toBe(false);
  });

  it("finds a fear written on a theme, the way older boards wrote them", () => {
    const cards = [
      card("t1", { cardKind: "theme", text: "Workforce" }),
      card("tf1", { cardKind: "fear", parentId: "t1", text: "a themed fear" }),
      card("th1", { cardKind: "hope", parentId: "tf1", text: "its flip" }),
    ];
    const out = flipsForBoard(cards, "g1");
    expect(out.total).toBe(1);
    expect(out.flipped).toBe(1);
    expect(out.entries[0].fearText).toBe("a themed fear");
  });

  it("counts a fear once even when both walks reach it", () => {
    const out = flipsForBoard(week3(), "g1");
    expect(new Set(out.entries.map((e) => e.fearId)).size).toBe(out.entries.length);
  });

  it("reports an empty board as nothing flipped out of nothing, not as a divide by zero", () => {
    expect(flipsForBoard([], "g1")).toEqual({ groupId: "g1", entries: [], flipped: 0, total: 0 });
  });
});
