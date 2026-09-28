import { describe, it, expect } from "vitest";
import { MAX_TREE_DEPTH, TREE_ORDERS, type CardOrder, type RippleCard } from "./ripples-types";
import {
  flipOf,
  implicationSeedCandidates,
  indexSynthesisBoard,
  lineageByCardId,
  insertionPoint,
  placementError,
  planReorder,
} from "./synthesis-shape";

function card(
  id: string,
  order: CardOrder,
  parentId: string | null,
  seq: number,
  extra?: Partial<RippleCard>
): RippleCard {
  return {
    id,
    teamId: "T1",
    authorPlayerId: null,
    order,
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
    createdTime: `2026-01-01T00:00:${String(seq).padStart(2, "0")}Z`,
    ...extra,
  };
}

const theme = (id: string, seq: number, extra?: Partial<RippleCard>) =>
  card(id, "FIRST", null, seq, { cardKind: "theme", ...extra });

describe("flipOf", () => {
  it("pairs a hope with a fear both ways", () => {
    expect(flipOf("hope")).toBe("fear");
    expect(flipOf("fear")).toBe("hope");
  });
});

describe("indexSynthesisBoard", () => {
  // TH1 ─ I1, I2 (clustered implications)
  //     └ H1(hope) ─ F1(fear)
  //     └ F2(fear)
  // I3 sits unclustered; N1 is a brainstorm sticky.
  function board(): RippleCard[] {
    return [
      theme("TH1", 1),
      card("I1", "SECOND", "TH1", 2),
      card("I2", "SECOND", "TH1", 3),
      card("H1", "SECOND", "TH1", 4, { cardKind: "hope" }),
      card("F1", "TERMINAL", "H1", 5, { cardKind: "fear" }),
      card("F2", "SECOND", "TH1", 6, { cardKind: "fear" }),
      card("I3", "FIRST", null, 7),
      card("N1", "STICKY", null, 8),
    ];
  }

  it("separates a theme's implication children from its hope/fear children", () => {
    const b = indexSynthesisBoard(board());
    expect(b.themes.map((c) => c.id)).toEqual(["TH1"]);
    expect(b.clusters.get("TH1")?.map((c) => c.id)).toEqual(["I1", "I2"]);
    expect(b.chains.get("TH1")?.map((c) => c.id)).toEqual(["H1", "F2"]);
    expect(b.chains.get("H1")?.map((c) => c.id)).toEqual(["F1"]);
  });

  it("puts unclustered implications in the tray and leaves stickies out entirely", () => {
    const b = indexSynthesisBoard(board());
    expect(b.unclustered.map((c) => c.id)).toEqual(["I3"]);
    const everywhere = [
      ...b.themes,
      ...b.unclustered,
      ...b.parked,
      ...[...b.clusters.values()].flat(),
      ...[...b.chains.values()].flat(),
    ];
    expect(everywhere.map((c) => c.id)).not.toContain("N1");
  });

  it("depths the hope/fear chain from its theme, ignoring the implications beside it", () => {
    const b = indexSynthesisBoard(board());
    expect(b.chainDepth.get("TH1")).toBe(0);
    expect(b.chainDepth.get("H1")).toBe(1);
    expect(b.chainDepth.get("F2")).toBe(1);
    expect(b.chainDepth.get("F1")).toBe(2);
    // A clustered implication is NOT part of the chain, so it has no chain depth.
    expect(b.chainDepth.has("I1")).toBe(false);
  });

  it("omits a hope hung off a clustered implication — it is unreachable from any theme", () => {
    // This is the invisibility trap the POST route exists to prevent: the card is on the
    // board but no view can draw it, so nobody could see or delete it.
    const cards = [...board(), card("ORPHANHOPE", "TERMINAL", "I1", 9, { cardKind: "hope" })];
    const b = indexSynthesisBoard(cards);
    expect(b.chainDepth.has("ORPHANHOPE")).toBe(false);
  });

  it("excludes parked cards from the themes, the tray and the clusters", () => {
    const cards = [
      theme("TH1", 1),
      theme("TH2", 2, { parked: true }),
      card("I1", "SECOND", "TH1", 3, { parked: true }),
      card("I2", "FIRST", null, 4, { parked: true }),
      card("I3", "FIRST", null, 5),
    ];
    const b = indexSynthesisBoard(cards);
    expect(b.themes.map((c) => c.id)).toEqual(["TH1"]);
    expect(b.unclustered.map((c) => c.id)).toEqual(["I3"]);
    expect(b.clusters.get("TH1") ?? []).toEqual([]);
    expect(b.parked.map((c) => c.id).sort()).toEqual(["I1", "I2", "TH2"]);
  });

  it("truncates a chain past MAX_TREE_DEPTH rather than drawing it", () => {
    const cards: RippleCard[] = [theme("TH1", 1)];
    for (let d = 1; d <= MAX_TREE_DEPTH + 2; d++) {
      cards.push(
        card(`C${d}`, TREE_ORDERS[Math.min(d, TREE_ORDERS.length - 1)], d === 1 ? "TH1" : `C${d - 1}`, 1 + d, {
          cardKind: d % 2 === 1 ? "hope" : "fear",
        })
      );
    }
    const b = indexSynthesisBoard(cards);
    expect(b.chainDepth.get(`C${MAX_TREE_DEPTH}`)).toBe(MAX_TREE_DEPTH);
    expect(b.chainDepth.has(`C${MAX_TREE_DEPTH + 1}`)).toBe(false);
  });

  it("does not hang on a parent cycle", () => {
    const cards = [
      theme("TH1", 1),
      card("A", "SECOND", "B", 2, { cardKind: "hope" }),
      card("B", "TERMINAL", "A", 3, { cardKind: "fear" }),
    ];
    const b = indexSynthesisBoard(cards);
    expect(b.chainDepth.get("TH1")).toBe(0);
    expect(b.chainDepth.has("A")).toBe(false);
    expect(b.chainDepth.has("B")).toBe(false);
  });

  it("returns stable empties for an empty board", () => {
    const b = indexSynthesisBoard([]);
    expect(b.themes).toEqual([]);
    expect(b.unclustered).toEqual([]);
    expect(b.parked).toEqual([]);
    expect(b.clusters.size).toBe(0);
    expect(b.chains.size).toBe(0);
    expect(b.chainDepth.size).toBe(0);
  });
});

describe("lineageByCardId", () => {
  // K1(key change) ─ A ─ B, and K1 ─ C. Plus a second root K2.
  const week2 = () => [
    card("K1", "FIRST", null, 1),
    card("A", "SECOND", "K1", 2),
    card("B", "TERMINAL", "A", 3),
    card("C", "SECOND", "K1", 4),
    card("K2", "FIRST", null, 5),
  ];

  it("gives each card its ancestor path, root text first and its own text last", () => {
    const l = lineageByCardId(week2());
    expect(l.A).toEqual({ keyChange: "K1-text", chain: ["K1-text", "A-text"] });
    expect(l.B).toEqual({ keyChange: "K1-text", chain: ["K1-text", "A-text", "B-text"] });
  });

  it("gives a root itself as its own key change", () => {
    expect(lineageByCardId(week2()).K1).toEqual({ keyChange: "K1-text", chain: ["K1-text"] });
  });

  it("gives each branch its own path, never a merged one", () => {
    const l = lineageByCardId(week2());
    expect(l.C.chain).toEqual(["K1-text", "C-text"]);
    expect(l.B.chain).not.toContain("C-text");
  });

  it("omits orphans and stickies", () => {
    const l = lineageByCardId([
      ...week2(),
      card("ORPHAN", "SECOND", "ghost", 6),
      card("N1", "STICKY", null, 7),
    ]);
    expect(l.ORPHAN).toBeUndefined();
    expect(l.N1).toBeUndefined();
  });
});

describe("implicationSeedCandidates", () => {
  it("offers the implications, labelled with the key change they came from", () => {
    const got = implicationSeedCandidates([
      card("K1", "FIRST", null, 1),
      card("A", "SECOND", "K1", 2),
      card("B", "TERMINAL", "A", 3),
    ]);
    expect(got).toEqual([
      { id: "A", text: "A-text", keyChange: "K1-text", depth: 1, createdAt: got[0].createdAt },
      { id: "B", text: "B-text", keyChange: "K1-text", depth: 2, createdAt: got[1].createdAt },
    ]);
  });

  it("excludes the key changes themselves, stickies, and challenged-out cards", () => {
    const ids = implicationSeedCandidates([
      card("K1", "FIRST", null, 1),
      card("A", "SECOND", "K1", 2),
      card("G", "SECOND", "K1", 3, { greyed: true }),
      card("N1", "STICKY", null, 4),
    ]).map((c) => c.id);
    expect(ids).toEqual(["A"]);
  });

  it("orders by creation time", () => {
    const ids = implicationSeedCandidates([
      card("K1", "FIRST", null, 1),
      card("LATE", "SECOND", "K1", 9),
      card("EARLY", "SECOND", "K1", 2),
    ]).map((c) => c.id);
    expect(ids).toEqual(["EARLY", "LATE"]);
  });
});

describe("placementError", () => {
  const ok = (k: Parameters<typeof placementError>[0], p: Parameters<typeof placementError>[1]) =>
    expect(placementError(k, p)).toBeNull();
  const no = (k: Parameters<typeof placementError>[0], p: Parameters<typeof placementError>[1]) =>
    expect(placementError(k, p)).toBeTypeOf("string");

  it("lets a theme be a root and nothing else", () => {
    ok("theme", undefined);
    no("theme", null);
    no("theme", "theme");
    no("theme", "hope");
  });

  it("lets a hope or fear hang off a theme", () => {
    ok("hope", "theme");
    ok("fear", "theme");
  });

  it("chains a hope to a fear and back, but never to its own kind", () => {
    ok("fear", "hope");
    ok("hope", "fear");
    no("hope", "hope");
    no("fear", "fear");
  });

  it("refuses a hope or fear that would float free of every theme", () => {
    // A root hope, or one hung off an implication, is unreachable from any theme — so it
    // would be drawn by no view at all.
    no("hope", undefined);
    no("fear", undefined);
    no("hope", null);
    no("fear", null);
  });

  it("lets an implication sit in the tray or under a theme, but not in a chain", () => {
    ok(null, undefined);
    ok(null, "theme");
    ok(null, null); // under another implication is how Week 2's maps already read
    no(null, "hope");
    no(null, "fear");
  });
});

describe("indexSynthesisBoard ordering", () => {
  it("falls back to creation order while every card is still at sort 0", () => {
    const b = indexSynthesisBoard([
      card("B", "FIRST", null, 2),
      card("A", "FIRST", null, 1),
      card("C", "FIRST", null, 3),
    ]);
    expect(b.unclustered.map((c) => c.id)).toEqual(["A", "B", "C"]);
  });

  it("honours an explicit sort once cards have been dragged", () => {
    const b = indexSynthesisBoard([
      card("B", "FIRST", null, 2, { sort: 10 }),
      card("A", "FIRST", null, 1, { sort: 30 }),
      card("C", "FIRST", null, 3, { sort: 20 }),
    ]);
    expect(b.unclustered.map((c) => c.id)).toEqual(["B", "C", "A"]);
  });

  it("orders themes and the cards inside a theme the same way", () => {
    const b = indexSynthesisBoard([
      theme("T2", 1, { sort: 20 }),
      theme("T1", 2, { sort: 10 }),
      card("I2", "SECOND", "T1", 3, { sort: 20 }),
      card("I1", "SECOND", "T1", 4, { sort: 10 }),
    ]);
    expect(b.themes.map((c) => c.id)).toEqual(["T1", "T2"]);
    expect(b.clusters.get("T1")?.map((c) => c.id)).toEqual(["I1", "I2"]);
  });
});

describe("planReorder", () => {
  const list = (...ids: string[]) =>
    ids.map((id, i) => card(id, "SECOND", "T1", i + 1, { sort: (i + 1) * 1000 }));

  it("moves a card up, renumbering the rows that shifted", () => {
    const writes = planReorder(list("A", "B", "C"), "C", "A");
    // C now leads, so every position changed.
    expect(writes).toEqual([
      { cardId: "C", sort: 1000 },
      { cardId: "A", sort: 2000 },
      { cardId: "B", sort: 3000 },
    ]);
  });

  it("moves a card to the end when no target is given", () => {
    const writes = planReorder(list("A", "B", "C"), "A", null);
    expect(writes).toEqual([
      { cardId: "B", sort: 1000 },
      { cardId: "C", sort: 2000 },
      { cardId: "A", sort: 3000 },
    ]);
  });

  it("writes nothing but the moved card when the order is unchanged", () => {
    // A onto B is where A already sits.
    expect(planReorder(list("A", "B", "C"), "A", "B")).toEqual([{ cardId: "A", sort: 1000 }]);
  });

  it("inserts a card arriving from another list", () => {
    const writes = planReorder(list("A", "B"), "NEW", "B");
    expect(writes).toEqual([
      { cardId: "NEW", sort: 2000 },
      { cardId: "B", sort: 3000 },
    ]);
  });

  it("appends a card arriving from another list", () => {
    expect(planReorder(list("A", "B"), "NEW", null)).toEqual([{ cardId: "NEW", sort: 3000 }]);
  });

  it("assigns real sorts to a list that has never been reordered", () => {
    const flat = ["A", "B", "C"].map((id, i) => card(id, "SECOND", "T1", i + 1)); // all sort 0
    expect(planReorder(flat, "C", "A")).toEqual([
      { cardId: "C", sort: 1000 },
      { cardId: "A", sort: 2000 },
      { cardId: "B", sort: 3000 },
    ]);
  });

  it("does nothing when the drop target has vanished", () => {
    expect(planReorder(list("A", "B"), "A", "GONE")).toEqual([]);
  });

  it("handles a single-card list and an empty one", () => {
    expect(planReorder(list("A"), "A", null)).toEqual([{ cardId: "A", sort: 1000 }]);
    expect(planReorder([], "NEW", null)).toEqual([{ cardId: "NEW", sort: 1000 }]);
  });
});

describe("insertionPoint", () => {
  const list = (...ids: string[]) => ids.map((id, i) => card(id, "SECOND", "T1", i + 1));

  it("drops before the anchor when the near side was hit", () => {
    expect(insertionPoint(list("A", "B", "C"), "B", false, "X")).toBe("B");
  });

  it("drops before the NEXT card when the far side was hit", () => {
    expect(insertionPoint(list("A", "B", "C"), "B", true, "X")).toBe("C");
  });

  it("drops at the end past the far side of the last card", () => {
    expect(insertionPoint(list("A", "B", "C"), "C", true, "X")).toBeNull();
  });

  it("skips the card being moved when working out the neighbour", () => {
    // Moving B, dropping just after A: B is already there, so this means "before C".
    expect(insertionPoint(list("A", "B", "C"), "A", true, "B")).toBe("C");
  });

  it("drops at the end when the anchor IS the card being moved", () => {
    expect(insertionPoint(list("A", "B"), "A", false, "A")).toBeNull();
  });

  it("drops at the end when the anchor has vanished", () => {
    expect(insertionPoint(list("A", "B"), "GONE", false, "X")).toBeNull();
  });
});
