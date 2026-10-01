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
  childrenOf,
  descendantsOf,
  stakeProgress,
  hopesProgress,
  flattenChainCards,
  stakeLedger,
  shortlistCounts,
  oppositeOf,
  themeDossierCounts,
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
    shortlisted: false,
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

  // --- Week 3 step 2: what's at stake ---------------------------------------
  it("puts risks, opportunities and tensions on a theme and nowhere else", () => {
    for (const kind of ["risk", "opportunity", "tension"] as const) {
      ok(kind, "theme");
      no(kind, undefined); // never a root
      no(kind, null); // not under an implication
      no(kind, "hope");
      no(kind, "fear");
      no(kind, "risk"); // stake cards do not nest
    }
  });

  // --- Week 3 step 3: assumptions -------------------------------------------
  it("hangs an assumption off a hope or a fear only", () => {
    ok("assumption", "hope");
    ok("assumption", "fear");
    no("assumption", undefined);
    no("assumption", null);
    no("assumption", "theme"); // an assumption belongs to a hope or fear, not a theme
    no("assumption", "risk");
    no("assumption", "assumption");
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

// ---------------------------------------------------------------------------
// Week 3 step 2 & 3 kinds, and the partition guarantee
// ---------------------------------------------------------------------------
describe("indexSynthesisBoard — stake cards and assumptions", () => {
  const stakeBoard = () => [
    theme("TH", 1),
    card("I1", "SECOND", "TH", 2),
    card("R1", "SECOND", "TH", 3, { cardKind: "risk" }),
    card("R2", "SECOND", "TH", 4, { cardKind: "risk" }),
    card("O1", "SECOND", "TH", 5, { cardKind: "opportunity" }),
    card("T1", "SECOND", "TH", 6, { cardKind: "tension" }),
    card("H1", "SECOND", "TH", 7, { cardKind: "hope" }),
    card("A1", "TERMINAL", "H1", 8, { cardKind: "assumption" }),
  ];

  it("buckets each stake kind under its theme, keeping implications separate", () => {
    const b = indexSynthesisBoard(stakeBoard());
    expect(b.risks.get("TH")?.map((c) => c.id)).toEqual(["R1", "R2"]);
    expect(b.opportunities.get("TH")?.map((c) => c.id)).toEqual(["O1"]);
    expect(b.tensions.get("TH")?.map((c) => c.id)).toEqual(["T1"]);
    // The old fall-through would have swept all of these into the theme's cluster.
    expect(b.clusters.get("TH")?.map((c) => c.id)).toEqual(["I1"]);
  });

  it("hangs assumptions off their hope or fear, and keeps them OFF the chain", () => {
    const b = indexSynthesisBoard(stakeBoard());
    expect(b.assumptions.get("H1")?.map((c) => c.id)).toEqual(["A1"]);
    // Deliberately absent: an assumption is not a chain step, and the chain renderer
    // filters on hope/fear so it will never try to draw one.
    expect(b.chainDepth.has("A1")).toBe(false);
    expect(b.chainDepth.get("H1")).toBe(1);
  });

  it("orders stake lists by sort then creation time, like every other list", () => {
    const b = indexSynthesisBoard([
      theme("TH", 1),
      card("R2", "SECOND", "TH", 2, { cardKind: "risk", sort: 2000 }),
      card("R1", "SECOND", "TH", 3, { cardKind: "risk", sort: 1000 }),
    ]);
    expect(b.risks.get("TH")?.map((c) => c.id)).toEqual(["R1", "R2"]);
  });
});

describe("indexSynthesisBoard — orphans", () => {
  it("surfaces a parentless hope instead of silently discarding it", () => {
    // This used to vanish: the bucketing hit `if (c.parentId)` and fell off the end.
    const b = indexSynthesisBoard([theme("TH", 1), card("H", "FIRST", null, 2, { cardKind: "hope" })]);
    expect(b.orphans.map((c) => c.id)).toEqual(["H"]);
    expect(b.chainDepth.has("H")).toBe(false);
  });

  it("surfaces a hope hung off a clustered implication", () => {
    const b = indexSynthesisBoard([
      theme("TH", 1),
      card("I1", "SECOND", "TH", 2),
      card("GHOST", "TERMINAL", "I1", 3, { cardKind: "hope" }),
    ]);
    expect(b.orphans.map((c) => c.id)).toEqual(["GHOST"]);
  });

  it("surfaces a stake card hung off anything but a live theme", () => {
    const b = indexSynthesisBoard([
      theme("TH", 1),
      card("I1", "SECOND", "TH", 2),
      card("R", "TERMINAL", "I1", 3, { cardKind: "risk" }),
      card("O", "FIRST", null, 4, { cardKind: "opportunity" }),
    ]);
    expect(b.orphans.map((c) => c.id).sort()).toEqual(["O", "R"]);
  });

  it("surfaces an assumption whose parent is not on a chain", () => {
    const b = indexSynthesisBoard([
      theme("TH", 1),
      card("A", "SECOND", "TH", 2, { cardKind: "assumption" }),
    ]);
    expect(b.orphans.map((c) => c.id)).toEqual(["A"]);
  });

  it("leaves orphans empty for a well-formed board", () => {
    const b = indexSynthesisBoard([
      theme("TH", 1),
      card("I1", "SECOND", "TH", 2),
      card("R1", "SECOND", "TH", 3, { cardKind: "risk" }),
      card("H1", "SECOND", "TH", 4, { cardKind: "hope" }),
      card("F1", "TERMINAL", "H1", 5, { cardKind: "fear" }),
      card("A1", "TERMINAL", "H1", 6, { cardKind: "assumption" }),
    ]);
    expect(b.orphans).toEqual([]);
  });
});

describe("indexSynthesisBoard — partition property", () => {
  // The invariant that retires the invisibility trap: every non-STICKY card lands in
  // exactly ONE bucket. Two earlier bugs on this feature were cards falling through the
  // bucketing into nowhere, which TypeScript cannot catch.
  const bucketsOf = (b: ReturnType<typeof indexSynthesisBoard>) => [
    ...b.themes,
    ...b.unclustered,
    ...b.parked,
    ...b.orphans,
    ...[...b.clusters.values()].flat(),
    ...[...b.risks.values()].flat(),
    ...[...b.opportunities.values()].flat(),
    ...[...b.tensions.values()].flat(),
    ...[...b.chains.values()].flat(),
    ...[...b.assumptions.values()].flat(),
  ];

  const messyBoard = () => [
    theme("TH1", 1),
    theme("TH2", 2, { parked: true }), // parked theme
    theme("NOTROOT", 3, { cardKind: "theme" }),
    card("I1", "SECOND", "TH1", 4),
    card("I2", "FIRST", null, 5),
    card("IP", "FIRST", null, 6, { parked: true }),
    card("R1", "SECOND", "TH1", 7, { cardKind: "risk" }),
    card("O1", "SECOND", "TH1", 8, { cardKind: "opportunity" }),
    card("T1", "SECOND", "TH1", 9, { cardKind: "tension" }),
    card("H1", "SECOND", "TH1", 10, { cardKind: "hope" }),
    card("F1", "TERMINAL", "H1", 11, { cardKind: "fear" }),
    card("A1", "TERMINAL", "H1", 12, { cardKind: "assumption" }),
    card("LOOSEHOPE", "FIRST", null, 13, { cardKind: "hope" }),
    card("LOOSERISK", "FIRST", null, 14, { cardKind: "risk" }),
    card("LOOSEASSUME", "SECOND", "TH1", 15, { cardKind: "assumption" }),
    card("GHOSTPARENT", "SECOND", "missing", 16),
    card("N1", "STICKY", null, 17, { section: "synthesis-sandbox" }),
  ];

  it("places every non-STICKY card in exactly one bucket", () => {
    const cards = messyBoard();
    const placed = bucketsOf(indexSynthesisBoard(cards));
    const ids = placed.map((c) => c.id);

    expect(new Set(ids).size).toBe(ids.length); // no card in two buckets

    const expected = cards.filter((c) => c.order !== "STICKY").map((c) => c.id);
    expect([...ids].sort()).toEqual([...expected].sort()); // none missing, none invented
  });

  it("keeps stickies out of the board index entirely", () => {
    const ids = bucketsOf(indexSynthesisBoard(messyBoard())).map((c) => c.id);
    expect(ids).not.toContain("N1");
  });

  it("holds the partition for an empty board", () => {
    expect(bucketsOf(indexSynthesisBoard([]))).toEqual([]);
  });
});

describe("childrenOf", () => {
  const board = () =>
    indexSynthesisBoard([
      theme("TH", 1),
      card("I1", "SECOND", "TH", 2),
      card("R1", "SECOND", "TH", 3, { cardKind: "risk" }),
      card("O1", "SECOND", "TH", 4, { cardKind: "opportunity" }),
      card("T1", "SECOND", "TH", 5, { cardKind: "tension" }),
      card("H1", "SECOND", "TH", 6, { cardKind: "hope" }),
      card("A1", "TERMINAL", "H1", 7, { cardKind: "assumption" }),
      card("F1", "TERMINAL", "H1", 8, { cardKind: "fear" }),
    ]);

  it("unions every bucket, so a theme's true child count is one call", () => {
    expect(childrenOf(board(), "TH").map((c) => c.id).sort()).toEqual(
      ["H1", "I1", "O1", "R1", "T1"].sort()
    );
  });

  it("includes a hope's assumptions alongside its chained flip side", () => {
    expect(childrenOf(board(), "H1").map((c) => c.id).sort()).toEqual(["A1", "F1"]);
  });

  it("returns nothing for a leaf", () => {
    expect(childrenOf(board(), "I1")).toEqual([]);
  });
});

describe("stakeLedger + shortlistCounts", () => {
  const board = () =>
    indexSynthesisBoard([
      theme("TH1", 1, { sort: 1000 }),
      theme("TH2", 2, { sort: 2000 }),
      card("R1", "SECOND", "TH1", 3, { cardKind: "risk", shortlisted: true }),
      card("R2", "SECOND", "TH1", 4, { cardKind: "risk" }),
      card("R3", "SECOND", "TH2", 5, { cardKind: "risk", shortlisted: true }),
      card("O1", "SECOND", "TH1", 6, { cardKind: "opportunity", shortlisted: true }),
      card("T1", "SECOND", "TH1", 7, { cardKind: "tension" }),
    ]);

  it("reads theme-first, in the order the group arranged its themes", () => {
    const ledger = stakeLedger(board());
    expect(ledger.map((l) => l.theme.id)).toEqual(["TH1", "TH2"]);
    expect(ledger[0].risks.map((c) => c.id)).toEqual(["R1", "R2"]);
    expect(ledger[0].tensions.map((c) => c.id)).toEqual(["T1"]);
    expect(ledger[1].risks.map((c) => c.id)).toEqual(["R3"]);
  });

  it("counts the shortlist across every theme", () => {
    expect(shortlistCounts(board())).toEqual({ risks: 2, opportunities: 1 });
  });

  it("counts nothing on an untouched board", () => {
    expect(shortlistCounts(indexSynthesisBoard([theme("TH", 1)]))).toEqual({
      risks: 0,
      opportunities: 0,
    });
  });
});

describe("flattenChainCards", () => {
  const board = () =>
    indexSynthesisBoard([
      theme("TH", 1),
      card("H1", "SECOND", "TH", 2, { cardKind: "hope" }),
      card("F1", "TERMINAL", "H1", 3, { cardKind: "fear" }),
      card("H2", "ORDER_4", "F1", 4, { cardKind: "hope" }),
      card("F2", "SECOND", "TH", 5, { cardKind: "fear" }),
      card("A1", "TERMINAL", "H1", 6, { cardKind: "assumption" }),
    ]);

  it("walks depth-first, so a flipped card follows the one it came from", () => {
    expect(flattenChainCards(board(), "TH").map((e) => e.card.id)).toEqual([
      "H1",
      "F1",
      "H2",
      "F2",
    ]);
  });

  it("reports what each card was flipped from, and null for one written on the theme", () => {
    const byId = new Map(flattenChainCards(board(), "TH").map((e) => [e.card.id, e]));
    expect(byId.get("H1")!.flippedFrom).toBeNull();
    expect(byId.get("F2")!.flippedFrom).toBeNull();
    expect(byId.get("F1")!.flippedFrom?.id).toBe("H1");
    expect(byId.get("H2")!.flippedFrom?.id).toBe("F1");
  });

  it("carries chain depth, and leaves assumptions out — they are not chain cards", () => {
    const entries = flattenChainCards(board(), "TH");
    expect(entries.map((e) => e.depth)).toEqual([1, 2, 3, 1]);
    expect(entries.map((e) => e.card.id)).not.toContain("A1");
  });

  it("returns nothing for a theme with no hopes or fears", () => {
    expect(flattenChainCards(indexSynthesisBoard([theme("TH", 1)]), "TH")).toEqual([]);
  });
});

describe("descendantsOf", () => {
  const board = () =>
    indexSynthesisBoard([
      theme("TH", 1),
      card("I1", "SECOND", "TH", 2),
      card("R1", "SECOND", "TH", 3, { cardKind: "risk" }),
      card("H1", "SECOND", "TH", 4, { cardKind: "hope" }),
      card("A1", "TERMINAL", "H1", 5, { cardKind: "assumption" }),
      card("F1", "TERMINAL", "H1", 6, { cardKind: "fear" }),
      card("A2", "ORDER_4", "F1", 7, { cardKind: "assumption" }),
    ]);

  it("counts the whole subtree, not just the first level", () => {
    // Deleting H1 takes its assumption, the fear flipped from it, AND that fear's own
    // assumption — a confirmation naming only direct children would say 2, not 3.
    expect(descendantsOf(board(), "H1").map((c) => c.id).sort()).toEqual(["A1", "A2", "F1"]);
  });

  it("spans every bucket from a theme", () => {
    expect(descendantsOf(board(), "TH").map((c) => c.id).sort()).toEqual(
      ["A1", "A2", "F1", "H1", "I1", "R1"].sort()
    );
  });

  it("returns nothing for a leaf", () => {
    expect(descendantsOf(board(), "A1")).toEqual([]);
  });

  it("does not hang on a parent cycle", () => {
    const cycled = indexSynthesisBoard([
      theme("TH", 1),
      card("H", "SECOND", "TH", 2, { cardKind: "hope" }),
      card("X", "TERMINAL", "H", 3, { cardKind: "fear" }),
      card("Y", "ORDER_4", "X", 4, { cardKind: "hope" }),
    ]);
    expect(descendantsOf(cycled, "H").map((c) => c.id)).toEqual(["X", "Y"]);
  });
});

describe("themeDossierCounts", () => {
  const theTheme = theme("TH", 1);

  it("counts each list separately", () => {
    const board = indexSynthesisBoard([
      theTheme,
      card("I1", "SECOND", "TH", 2),
      card("I2", "SECOND", "TH", 3),
      card("R1", "SECOND", "TH", 4, { cardKind: "risk" }),
      card("O1", "SECOND", "TH", 5, { cardKind: "opportunity" }),
      card("O2", "SECOND", "TH", 6, { cardKind: "opportunity" }),
      card("X1", "SECOND", "TH", 7, { cardKind: "tension" }),
    ]);
    expect(themeDossierCounts(board, "TH")).toEqual({
      implications: 2,
      risks: 1,
      opportunities: 2,
      tensions: 1,
    });
  });

  // The empty themes are the reason this exists — the summary line has to read sensibly
  // rather than as "0 · 0 · 0".
  it("is all zeroes for a theme with nothing on it", () => {
    expect(themeDossierCounts(indexSynthesisBoard([theTheme]), "TH")).toEqual({
      implications: 0,
      risks: 0,
      opportunities: 0,
      tensions: 0,
    });
  });

  it("does not count hopes, fears or assumptions as dossier material", () => {
    const board = indexSynthesisBoard([
      theTheme,
      card("H", "SECOND", "TH", 2, { cardKind: "hope" }),
      card("F", "TERMINAL", "H", 3, { cardKind: "fear" }),
      card("A", "ORDER_4", "F", 4, { cardKind: "assumption" }),
    ]);
    expect(themeDossierCounts(board, "TH")).toEqual({
      implications: 0,
      risks: 0,
      opportunities: 0,
      tensions: 0,
    });
  });

  it("is all zeroes for a theme id that isn't on the board", () => {
    expect(themeDossierCounts(indexSynthesisBoard([theTheme]), "nope")).toEqual({
      implications: 0,
      risks: 0,
      opportunities: 0,
      tensions: 0,
    });
  });
});

describe("oppositeOf", () => {
  // TH ─ H(hope) ─ F(fear) ─ H2(hope)
  const theTheme = theme("TH", 1);
  const hope = card("H", "SECOND", "TH", 2, { cardKind: "hope" });
  const fear = card("F", "TERMINAL", "H", 3, { cardKind: "fear" });
  const hope2 = card("H2", "ORDER_4", "F", 4, { cardKind: "hope" });

  it("finds the fear written under a hope", () => {
    const board = indexSynthesisBoard([theTheme, hope, fear]);
    expect(oppositeOf(board, hope)?.id).toBe("F");
  });

  // The bug: the flip is stored downwards, so this direction found nothing and the fear
  // offered to write the hope it had come from.
  it("finds the hope a fear was flipped from", () => {
    const board = indexSynthesisBoard([theTheme, hope, fear]);
    expect(oppositeOf(board, fear)?.id).toBe("H");
  });

  it("prefers a child over the parent, so a chain still walks one pair at a time", () => {
    const board = indexSynthesisBoard([theTheme, hope, fear, hope2]);
    expect(oppositeOf(board, fear)?.id).toBe("H2");
    expect(oppositeOf(board, hope2)?.id).toBe("F");
  });

  it("has no opposite for a card written straight onto a theme", () => {
    const lone = card("L", "SECOND", "TH", 2, { cardKind: "fear" });
    expect(oppositeOf(indexSynthesisBoard([theTheme, lone]), lone)).toBeNull();
  });

  it("does not treat a same-kind parent as an opposite", () => {
    const under = card("H3", "TERMINAL", "H", 3, { cardKind: "hope" });
    const board = indexSynthesisBoard([theTheme, hope, under]);
    expect(oppositeOf(board, under)).toBeNull();
  });

  it("is null for anything that is not a hope or a fear", () => {
    const risk = card("R", "SECOND", "TH", 2, { cardKind: "risk" });
    expect(oppositeOf(indexSynthesisBoard([theTheme, risk]), risk)).toBeNull();
  });
});

describe("stakeProgress", () => {
  const withCards = (...cards: RippleCard[]) =>
    stakeProgress(indexSynthesisBoard([theme("TH", 1), ...cards]), "TH");

  it("is empty until something is written", () => {
    expect(withCards()).toBe("empty");
  });

  it("is done only once both sides of the analysis exist", () => {
    expect(withCards(card("R", "SECOND", "TH", 2, { cardKind: "risk" }))).toBe("started");
    expect(withCards(card("O", "SECOND", "TH", 2, { cardKind: "opportunity" }))).toBe("started");
    expect(
      withCards(
        card("R", "SECOND", "TH", 2, { cardKind: "risk" }),
        card("O", "SECOND", "TH", 3, { cardKind: "opportunity" })
      )
    ).toBe("done");
  });

  it("does not require a tension — a theme the group agreed on is finished", () => {
    expect(
      withCards(
        card("R", "SECOND", "TH", 2, { cardKind: "risk" }),
        card("O", "SECOND", "TH", 3, { cardKind: "opportunity" })
      )
    ).toBe("done");
    // …but a tension alone is a start.
    expect(withCards(card("T", "SECOND", "TH", 2, { cardKind: "tension" }))).toBe("started");
  });
});

describe("hopesProgress", () => {
  const withCards = (...cards: RippleCard[]) =>
    hopesProgress(indexSynthesisBoard([theme("TH", 1), ...cards]), "TH");
  const why = { description: "because it matters" };

  it("is empty until something is written", () => {
    expect(withCards()).toBe("empty");
  });

  it("needs both a hope and a fear", () => {
    expect(withCards(card("H", "SECOND", "TH", 2, { cardKind: "hope", ...why }))).toBe("started");
    expect(
      withCards(
        card("H", "SECOND", "TH", 2, { cardKind: "hope", ...why }),
        card("F", "SECOND", "TH", 3, { cardKind: "fear", ...why })
      )
    ).toBe("done");
  });

  it("is not done while any card is missing its why", () => {
    // The step exists to get at the value underneath; a hope with no why is the failure
    // it is meant to prevent, so it does not count as finished.
    expect(
      withCards(
        card("H", "SECOND", "TH", 2, { cardKind: "hope", ...why }),
        card("F", "SECOND", "TH", 3, { cardKind: "fear" })
      )
    ).toBe("started");
  });

  it("counts a flipped card too, at any depth", () => {
    expect(
      withCards(
        card("H", "SECOND", "TH", 2, { cardKind: "hope", ...why }),
        card("F", "TERMINAL", "H", 3, { cardKind: "fear", ...why })
      )
    ).toBe("done");
  });
});
