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
  clusterProgress,
  exploreProgress,
  flipProgress,
  boardChainCards,
  flattenChainCards,
  stakeLedger,
  shortlistCounts,
  oppositeOf,
  themeDossierCounts,
  assumptionLedger,
  implicationKey,
  twinIndex,
  themeCountFor,
  READING_FIELDS,
  readingsFor,
  readingProgress,
  themeAnswers,
  answerOf,
  answersOf,
  boardAnswersOf,
  VALUES_FIELDS,
  ROLE_FIELDS,
  implicationOrder,
  ordinal,
  keyChangeLabel,
  branchOf,
  seededIndex,
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
    twinKey: null,
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
    expect(l.A).toEqual({ keyChange: "K1-text", keyChangeId: "K1", chain: ["K1-text", "A-text"] });
    expect(l.B).toEqual({
      keyChange: "K1-text",
      keyChangeId: "K1",
      chain: ["K1-text", "A-text", "B-text"],
    });
  });

  it("gives a root itself as its own key change", () => {
    expect(lineageByCardId(week2()).K1).toEqual({
      keyChange: "K1-text",
      keyChangeId: "K1",
      chain: ["K1-text"],
    });
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

  it("lets a hope or fear stand on the board (step 3), but never under an implication", () => {
    ok("hope", undefined);
    ok("fear", undefined);
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
  it("puts a risk or opportunity on the board (the role step) or on a theme (older boards), nowhere else", () => {
    for (const kind of ["risk", "opportunity"] as const) {
      ok(kind, undefined); // a root: the board's answer
      ok(kind, "theme");
      no(kind, null); // not under an implication
      no(kind, "hope");
      no(kind, "fear");
      no(kind, "risk"); // stake cards do not nest
    }
  });

  it("puts a tension on a theme and nowhere else", () => {
    ok("tension", "theme");
    no("tension", undefined);
    no("tension", null);
    no("tension", "hope");
    no("tension", "risk");
  });

  // --- Week 3 step 3: assumptions -------------------------------------------
  it("hangs an assumption off a theme (step 2B), or off a hope or a fear (the older shape)", () => {
    ok("assumption", "theme");
    ok("assumption", "hope");
    ok("assumption", "fear");
    no("assumption", undefined);
    no("assumption", null);
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
  it("keeps a parentless hope as the board's own — step 3 writes them there", () => {
    // This used to be an orphan (and before that vanished entirely); now it is the shape
    // the hopes & fears step produces.
    const b = indexSynthesisBoard([theme("TH", 1), card("H", "FIRST", null, 2, { cardKind: "hope" })]);
    expect(b.hopesFears.map((c) => c.id)).toEqual(["H"]);
    expect(b.chainDepth.get("H")).toBe(1);
    expect(b.orphans).toEqual([]);
  });

  it("surfaces a hope hung off a clustered implication", () => {
    const b = indexSynthesisBoard([
      theme("TH", 1),
      card("I1", "SECOND", "TH", 2),
      card("GHOST", "TERMINAL", "I1", 3, { cardKind: "hope" }),
    ]);
    expect(b.orphans.map((c) => c.id)).toEqual(["GHOST"]);
  });

  it("surfaces a stake card hung off anything but a live theme — a root one is the board's answer", () => {
    const b = indexSynthesisBoard([
      theme("TH", 1),
      card("I1", "SECOND", "TH", 2),
      card("R", "TERMINAL", "I1", 3, { cardKind: "risk" }),
      card("O", "FIRST", null, 4, { cardKind: "opportunity" }),
      card("T", "FIRST", null, 5, { cardKind: "tension" }),
    ]);
    expect(b.orphans.map((c) => c.id).sort()).toEqual(["R", "T"]);
    expect(b.boardAnswers.map((c) => c.id)).toEqual(["O"]);
  });

  it("surfaces an assumption whose parent is neither a theme nor on a chain", () => {
    const b = indexSynthesisBoard([
      theme("TH", 1),
      card("I", "SECOND", "TH", 2),
      card("A", "TERMINAL", "I", 3, { cardKind: "assumption" }),
    ]);
    expect(b.orphans.map((c) => c.id)).toEqual(["A"]);
  });

  it("keeps an assumption written straight on a theme — that is step 2B's answer", () => {
    const b = indexSynthesisBoard([
      theme("TH", 1),
      card("A", "SECOND", "TH", 2, { cardKind: "assumption" }),
    ]);
    expect(b.orphans).toEqual([]);
    expect(b.assumptions.get("TH")?.map((c) => c.id)).toEqual(["A"]);
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
    ...b.hopesFears,
    ...b.unclustered,
    ...b.parked,
    ...b.orphans,
    ...[...b.clusters.values()].flat(),
    ...[...b.risks.values()].flat(),
    ...[...b.opportunities.values()].flat(),
    ...[...b.tensions.values()].flat(),
    ...[...b.chains.values()].flat(),
    ...[...b.assumptions.values()].flat(),
    ...[...b.readings.values()].flat(),
    ...[...b.readingFields.values()].flat(),
    ...[...b.concerns.values()].flat(),
    ...[...b.answers.values()].flat(),
    ...b.boardAnswers,
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
    // Step 2's readings, including the ones that must end up orphaned: a field whose
    // reading hangs off nothing, and a reading hung off an implication.
    card("RD1", "SECOND", "TH1", 18, { cardKind: "reading" }),
    card("RF1", "TERMINAL", "RD1", 19, { cardKind: "experience" }),
    card("RF2", "TERMINAL", "RD1", 20, { cardKind: "mechanism" }),
    card("LOOSEREADING", "FIRST", null, 21, { cardKind: "reading" }),
    card("READINGONIMPL", "TERMINAL", "I1", 22, { cardKind: "reading" }),
    card("ORPHANFIELD", "TERMINAL", "READINGONIMPL", 23, { cardKind: "question" }),
    card("LOOSEFIELD", "SECOND", "TH1", 24, { cardKind: "assumed_role" }),
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
      card("RD1", "SECOND", "TH", 9, { cardKind: "reading" }),
      card("E1", "TERMINAL", "RD1", 10, { cardKind: "experience" }),
    ]);

  it("unions every bucket, so a theme's true child count is one call", () => {
    expect(childrenOf(board(), "TH").map((c) => c.id).sort()).toEqual(
      ["H1", "I1", "O1", "R1", "RD1", "T1"].sort()
    );
  });

  it("includes a reading's answers, so deleting a theme counts the reading work", () => {
    expect(childrenOf(board(), "RD1").map((c) => c.id)).toEqual(["E1"]);
  });

  it("includes a hope's assumptions alongside its chained flip side", () => {
    expect(childrenOf(board(), "H1").map((c) => c.id).sort()).toEqual(["A1", "F1"]);
  });

  it("returns nothing for a leaf", () => {
    expect(childrenOf(board(), "I1")).toEqual([]);
  });
});

describe("assumptionLedger", () => {
  // TH1 ─ H1(hope) ─ A1, A2
  //              └ F1(fear) ─ A3
  // TH2 ─ H2(hope) ─ A4
  const cards = () => [
    theme("TH1", 1, { sort: 1000 }),
    theme("TH2", 2, { sort: 2000 }),
    card("H1", "SECOND", "TH1", 3, { cardKind: "hope" }),
    card("A1", "TERMINAL", "H1", 4, { cardKind: "assumption" }),
    card("A2", "TERMINAL", "H1", 5, { cardKind: "assumption" }),
    card("F1", "TERMINAL", "H1", 6, { cardKind: "fear" }),
    card("A3", "ORDER_4", "F1", 7, { cardKind: "assumption" }),
    card("H2", "SECOND", "TH2", 8, { cardKind: "hope" }),
    card("A4", "TERMINAL", "H2", 9, { cardKind: "assumption" }),
  ];

  it("gives every assumption the card and the theme it was written under", () => {
    const got = assumptionLedger(indexSynthesisBoard(cards()));
    expect(got.map((e) => [e.card.id, e.source.id, e.theme.id])).toEqual([
      ["A1", "H1", "TH1"],
      ["A2", "H1", "TH1"],
      ["A3", "F1", "TH1"],
      ["A4", "H2", "TH2"],
    ]);
  });

  it("is empty when nothing has been assumed", () => {
    expect(assumptionLedger(indexSynthesisBoard([theme("TH", 1)]))).toEqual([]);
  });

  // The ledger walks reachable chains, so an assumption nobody can see on step 3 is not
  // offered on step 4 either — otherwise the shortlist would list a card with no home.
  it("skips an assumption whose chain is unreachable from any theme", () => {
    const got = assumptionLedger(
      indexSynthesisBoard([
        theme("TH", 1),
        card("LOOSE", "SECOND", "ghost", 2, { cardKind: "hope" }),
        card("A", "TERMINAL", "LOOSE", 3, { cardKind: "assumption" }),
      ])
    );
    expect(got).toEqual([]);
  });

  it("counts a shortlisted assumption", () => {
    const withPick = cards().map((c) =>
      c.id === "A3" ? { ...c, shortlisted: true } : c
    );
    expect(shortlistCounts(indexSynthesisBoard(withPick)).assumptions).toBe(1);
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
    expect(shortlistCounts(board())).toEqual({ risks: 2, opportunities: 1, assumptions: 0 });
  });

  it("counts nothing on an untouched board", () => {
    expect(shortlistCounts(indexSynthesisBoard([theme("TH", 1)]))).toEqual({
      risks: 0,
      opportunities: 0,
      assumptions: 0,
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
      card("RD", "SECOND", "TH", 8, { cardKind: "reading" }),
    ]);
    expect(themeDossierCounts(board, "TH")).toEqual({
      implications: 2,
      readings: 1,
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
      readings: 0,
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
      readings: 0,
      risks: 0,
      opportunities: 0,
      tensions: 0,
    });
  });

  it("is all zeroes for a theme id that isn't on the board", () => {
    expect(themeDossierCounts(indexSynthesisBoard([theTheme]), "nope")).toEqual({
      implications: 0,
      readings: 0,
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

describe("twinIndex / implicationKey / themeCountFor", () => {
  // TH1 and TH2 each hold a copy of one implication (twin "T"); I2 sits only in TH1;
  // I3 is still in the tray.
  const cards = () => [
    theme("TH1", 1, { sort: 1000 }),
    theme("TH2", 2, { sort: 2000 }),
    card("C1", "SECOND", "TH1", 3, { twinKey: "T", sourceCardId: "W2-CARD" }),
    card("C2", "SECOND", "TH2", 4, { twinKey: "T" }),
    card("I2", "SECOND", "TH1", 5),
    card("I3", "FIRST", null, 6),
  ];

  it("treats a card with no twin as its own group of one", () => {
    const b = indexSynthesisBoard(cards());
    const idx = twinIndex(b);
    expect(implicationKey(b.clusters.get("TH1")!.find((c) => c.id === "I2")!)).toBe("I2");
    expect(idx.get("I2")?.themeIds).toEqual(["TH1"]);
  });

  it("gathers copies of one implication under a single key, in board order", () => {
    const idx = twinIndex(indexSynthesisBoard(cards()));
    const info = idx.get("T");
    expect(info?.cards.map((c) => c.id).sort()).toEqual(["C1", "C2"]);
    expect(info?.themeIds).toEqual(["TH1", "TH2"]);
  });

  // A copy is written with a null sourceCardId so it stays out of 0018's unique
  // constraint; it still has to be able to say where it came from.
  it("carries the Week 2 link from whichever copy holds it", () => {
    const idx = twinIndex(indexSynthesisBoard(cards()));
    expect(idx.get("T")?.sourceCardId).toBe("W2-CARD");
  });

  it("counts the themes a card's implication appears in", () => {
    const b = indexSynthesisBoard(cards());
    const idx = twinIndex(b);
    const c1 = b.clusters.get("TH1")!.find((c) => c.id === "C1")!;
    const i2 = b.clusters.get("TH1")!.find((c) => c.id === "I2")!;
    expect(themeCountFor(idx, c1)).toBe(2);
    expect(themeCountFor(idx, i2)).toBe(1);
    // Still in the tray: in no theme at all.
    expect(themeCountFor(idx, b.unclustered[0])).toBe(0);
  });

  it("does not double-count two copies that ended up in the same theme", () => {
    const b = indexSynthesisBoard([
      theme("TH1", 1),
      card("C1", "SECOND", "TH1", 2, { twinKey: "T" }),
      card("C2", "SECOND", "TH1", 3, { twinKey: "T" }),
    ]);
    expect(twinIndex(b).get("T")?.themeIds).toEqual(["TH1"]);
  });

  it("returns an empty index for an empty board", () => {
    expect(twinIndex(indexSynthesisBoard([])).size).toBe(0);
  });
});

describe("a theme's four questions — placement, answers and progress", () => {
  // The four answers, straight on the theme.
  const full = () => [
    theme("TH", 1),
    card("BE", "SECOND", "TH", 2, { cardKind: "benefit", text: "Residents who attend gain a say" }),
    card("CO", "SECOND", "TH", 3, { cardKind: "cost", text: "Night-shift workers lose access" }),
    card("EX", "SECOND", "TH", 4, { cardKind: "experience", text: "Small towns feel it as a loss" }),
    card("ME", "SECOND", "TH", 5, { cardKind: "mechanism", text: "Budget panels that can overrule" }),
  ];
  // The older shape: a reading (the concrete example) carrying its answers.
  const legacy = () => [
    theme("TH", 1),
    card("RD", "SECOND", "TH", 2, { cardKind: "reading", text: "A team considers a commitment" }),
    card("EX", "TERMINAL", "RD", 3, { cardKind: "experience", text: "Teams could sustain prevention" }),
    card("ME", "TERMINAL", "RD", 4, { cardKind: "mechanism", text: "Stable funding creates room" }),
    card("AR", "TERMINAL", "RD", 5, { cardKind: "assumed_role", text: "We imagine a steward" }),
    card("QU", "TERMINAL", "RD", 6, { cardKind: "question", text: "How would we justify priorities" }),
  ];

  it("puts an answer on a theme, and still accepts one on a legacy reading", () => {
    for (const f of READING_FIELDS) {
      expect(placementError(f, "theme")).toBeNull();
      expect(placementError(f, "reading")).toBeNull();
    }
    expect(placementError("reading", "theme")).toBeNull();
  });

  it("refuses an answer anywhere else", () => {
    for (const f of READING_FIELDS) {
      expect(placementError(f, undefined)).toMatch(/belongs on a theme/);
      expect(placementError(f, null)).toMatch(/belongs on a theme/);
      expect(placementError(f, "hope")).toMatch(/belongs on a theme/);
    }
  });

  it("indexes a theme's own answers rather than orphaning them", () => {
    const b = indexSynthesisBoard(full());
    expect(b.orphans).toEqual([]);
    expect((b.readingFields.get("TH") ?? []).map((c) => c.id).sort()).toEqual(["BE", "CO", "EX", "ME"]);
  });

  it("keys the answers by question", () => {
    const got = themeAnswers(indexSynthesisBoard(full()), "TH");
    expect(got.benefit?.id).toBe("BE");
    expect(got.cost?.id).toBe("CO");
    expect(got.experience?.id).toBe("EX");
    expect(got.mechanism?.id).toBe("ME");
  });

  it("keeps the first card when a question somehow has two answers", () => {
    const got = themeAnswers(
      indexSynthesisBoard([...full(), card("EX2", "SECOND", "TH", 7, { cardKind: "experience", text: "later" })]),
      "TH"
    );
    expect(got.experience?.id).toBe("EX");
  });

  it("lets a legacy reading's answer stand in where the theme has none of its own", () => {
    const got = themeAnswers(indexSynthesisBoard(legacy()), "TH");
    expect(got.experience?.id).toBe("EX");
    expect(got.mechanism?.id).toBe("ME");
    expect(got.benefit).toBeUndefined();
  });

  it("prefers the theme's own answer over a legacy reading's", () => {
    const got = themeAnswers(
      indexSynthesisBoard([...legacy(), card("EX9", "SECOND", "TH", 9, { cardKind: "experience", text: "newer" })]),
      "TH"
    );
    expect(got.experience?.id).toBe("EX9");
  });

  it("still shapes a legacy reading, example and all", () => {
    const got = readingsFor(indexSynthesisBoard(legacy()), "TH");
    expect(got).toHaveLength(1);
    expect(got[0].card.text).toBe("A team considers a commitment");
    expect(got[0].fields.experience?.id).toBe("EX");
  });

  it("is done only once all four questions are answered", () => {
    expect(readingProgress(indexSynthesisBoard(full()), "TH")).toBe("done");
  });

  it("is started with three of four", () => {
    expect(readingProgress(indexSynthesisBoard(full().filter((c) => c.id !== "ME")), "TH")).toBe("started");
  });

  it("treats a blank answer as unanswered", () => {
    const blank = full().map((c) => (c.id === "ME" ? { ...c, text: "   " } : c));
    expect(readingProgress(indexSynthesisBoard(blank), "TH")).toBe("started");
  });

  it("is started, not done, for a fully written legacy reading — two of its questions changed", () => {
    expect(readingProgress(indexSynthesisBoard(legacy()), "TH")).toBe("started");
  });

  it("is started for a legacy reading with no answers at all", () => {
    expect(readingProgress(indexSynthesisBoard(legacy().slice(0, 2)), "TH")).toBe("started");
  });

  it("is empty with nothing written", () => {
    expect(readingProgress(indexSynthesisBoard([theme("TH", 1)]), "TH")).toBe("empty");
  });
});

describe("steps 2 and 3 — placement, answers, progress and the share-out", () => {
  const b = () => [
    theme("TH", 1),
    card("H1", "SECOND", "TH", 2, { cardKind: "hope", text: "A hope", description: "because trust" }),
    card("C1", "TERMINAL", "H1", 3, { cardKind: "concerns", text: "Night-shift workers" }),
    card("F1", "TERMINAL", "H1", 4, { cardKind: "fear", text: "A fear" }),
    card("A1", "ORDER_4", "F1", 5, { cardKind: "assumption", text: "legacy, under a fear" }),
    card("CO", "SECOND", "TH", 6, { cardKind: "condition", text: "Durable funding stays" }),
    card("AS", "SECOND", "TH", 7, { cardKind: "assumption", text: "Panels can overrule" }),
    card("AL", "SECOND", "TH", 8, { cardKind: "alternative", text: "Rotating seats" }),
    card("TE", "SECOND", "TH", 9, { cardKind: "test", text: "Who still misses out" }),
    // The role step: one set for the board, as root cards.
    card("DR", "FIRST", null, 10, { cardKind: "desired_role", text: "Convener" }),
    card("OP", "FIRST", null, 11, { cardKind: "opportunity", text: "Reach" }),
    card("RI", "FIRST", null, 12, { cardKind: "risk", text: "Gatekeeping" }),
    card("IN", "FIRST", null, 13, { cardKind: "investigate", text: "Authority needed" }),
  ];

  it("places the new kinds where the steps write them, and nowhere else", () => {
    expect(placementError("concerns", "hope")).toBeNull();
    expect(placementError("concerns", "theme")).toMatch(/hope or a fear/);
    expect(placementError("assumption", "theme")).toBeNull();
    expect(placementError("assumption", "fear")).toBeNull();
    expect(placementError("assumption", null)).toMatch(/belongs on a theme/);
    for (const k of ["condition", "alternative", "test"] as const) {
      expect(placementError(k, "theme")).toBeNull();
      expect(placementError(k, "hope")).toMatch(/belongs on a theme/);
      expect(placementError(k, undefined)).toMatch(/belongs on a theme/);
    }
    // The role step's four are board-level root cards; a theme parent is tolerated.
    for (const k of ROLE_FIELDS) {
      expect(placementError(k, undefined)).toBeNull();
      expect(placementError(k, "theme")).toBeNull();
      expect(placementError(k, "hope")).toMatch(/belongs on the board/);
    }
  });

  it("indexes everything into a bucket with no orphans", () => {
    const board = indexSynthesisBoard(b());
    expect(board.orphans).toEqual([]);
    expect(board.concerns.get("H1")?.map((c) => c.id)).toEqual(["C1"]);
    expect(board.assumptions.get("TH")?.map((c) => c.id)).toEqual(["AS"]);
    expect(board.assumptions.get("F1")?.map((c) => c.id)).toEqual(["A1"]);
    expect((board.answers.get("TH") ?? []).map((c) => c.id).sort()).toEqual(["AL", "CO", "TE"]);
    expect(board.boardAnswers.map((c) => c.id).sort()).toEqual(["DR", "IN", "OP", "RI"]);
  });

  it("keeps an older board's per-theme risk under its theme, not in the board's answers", () => {
    const board = indexSynthesisBoard([theme("TH", 1), card("R", "SECOND", "TH", 2, { cardKind: "risk" })]);
    expect(board.risks.get("TH")?.map((c) => c.id)).toEqual(["R"]);
    expect(board.boardAnswers).toEqual([]);
  });

  it("keeps a concerns note under one of the board's own hopes", () => {
    const board = indexSynthesisBoard([
      theme("TH", 1),
      card("ROOTHOPE", "FIRST", null, 2, { cardKind: "hope" }),
      card("C", "SECOND", "ROOTHOPE", 3, { cardKind: "concerns", text: "x" }),
    ]);
    expect(board.orphans).toEqual([]);
    expect(board.concerns.get("ROOTHOPE")?.map((c) => c.id)).toEqual(["C"]);
  });

  it("orphans a concerns note whose hope is unreachable", () => {
    const board = indexSynthesisBoard([
      theme("TH", 1),
      card("I", "SECOND", "TH", 2),
      card("GHOST", "TERMINAL", "I", 3, { cardKind: "hope" }),
      card("C", "ORDER_4", "GHOST", 4, { cardKind: "concerns", text: "x" }),
    ]);
    expect(board.orphans.map((c) => c.id).sort()).toEqual(["C", "GHOST"]);
  });

  it("finds one answer per question across buckets", () => {
    const board = indexSynthesisBoard(b());
    expect(answerOf(board, "TH", "assumption")?.id).toBe("AS");
    expect(answerOf(board, "H1", "concerns")?.id).toBe("C1");
    expect(answerOf(board, "TH", "benefit")).toBeNull();
    const values = answersOf(board, "TH", VALUES_FIELDS);
    expect(values.condition?.id).toBe("CO");
    expect(values.assumption?.id).toBe("AS");
    const role = boardAnswersOf(board);
    expect(role.desired_role?.id).toBe("DR");
    expect(role.opportunity?.id).toBe("OP");
    expect(role.risk?.id).toBe("RI");
    expect(role.investigate?.id).toBe("IN");
  });

  it("keeps the first card when a question has two answers", () => {
    const board = indexSynthesisBoard([...b(), card("RI2", "FIRST", null, 14, { cardKind: "risk", text: "later" })]);
    expect(boardAnswersOf(board).risk?.id).toBe("RI");
  });

});

describe("the board's own hopes and fears (steps 3 and 4)", () => {
  // Two fears and a hope written on the board; F1 has been flipped into H2.
  const b = () => [
    theme("TH", 1),
    card("F1", "FIRST", null, 2, { cardKind: "fear" }),
    card("H1", "FIRST", null, 3, { cardKind: "hope" }),
    card("F2", "FIRST", null, 4, { cardKind: "fear" }),
    card("H2", "SECOND", "F1", 5, { cardKind: "hope" }),
  ];

  it("indexes root hopes and fears as the board's, in order, with the flip chained off", () => {
    const board = indexSynthesisBoard(b());
    expect(board.hopesFears.map((c) => c.id)).toEqual(["F1", "H1", "F2"]);
    expect(board.chains.get("F1")?.map((c) => c.id)).toEqual(["H2"]);
    expect(board.chainDepth.get("F1")).toBe(1);
    expect(board.chainDepth.get("H2")).toBe(2);
    expect(board.orphans).toEqual([]);
  });

  it("boardChainCards walks depth-first, a flipped hope right after its fear", () => {
    const entries = boardChainCards(indexSynthesisBoard(b()));
    expect(entries.map((e) => e.card.id)).toEqual(["F1", "H2", "H1", "F2"]);
    expect(entries.map((e) => e.depth)).toEqual([1, 2, 1, 1]);
    expect(entries[1].flippedFrom?.id).toBe("F1");
    expect(entries[0].flippedFrom).toBeNull();
  });

  it("oppositeOf finds the pair from either side of a flipped root fear", () => {
    const board = indexSynthesisBoard(b());
    const f1 = board.hopesFears.find((c) => c.id === "F1")!;
    const h2 = board.chains.get("F1")![0];
    expect(oppositeOf(board, f1)?.id).toBe("H2");
    expect(oppositeOf(board, h2)?.id).toBe("F1");
    const f2 = board.hopesFears.find((c) => c.id === "F2")!;
    expect(oppositeOf(board, f2)).toBeNull();
  });

  it("flipProgress counts the fears with a hope on their other side", () => {
    expect(flipProgress(indexSynthesisBoard(b()))).toEqual({ flipped: 1, total: 2 });
    expect(flipProgress(indexSynthesisBoard([theme("TH", 1)]))).toEqual({ flipped: 0, total: 0 });
  });

  it("a hope flipped from a fear deletes with it", () => {
    expect(descendantsOf(indexSynthesisBoard(b()), "F1").map((c) => c.id)).toEqual(["H2"]);
  });
});

describe("clusterProgress / exploreProgress", () => {
  it("step 1 is done once a theme holds an implication, empty until then", () => {
    expect(clusterProgress(indexSynthesisBoard([theme("TH", 1)]), "TH")).toBe("empty");
    expect(clusterProgress(indexSynthesisBoard([theme("TH", 1), card("I", "SECOND", "TH", 2)]), "TH")).toBe("done");
  });

  const answered = () =>
    READING_FIELDS.map((k, i) => card(`Q${i}`, "SECOND", "TH", 10 + i, { cardKind: k, text: "an answer" }));
  const stakes = () => [
    card("R", "SECOND", "TH", 20, { cardKind: "risk" }),
    card("O", "SECOND", "TH", 21, { cardKind: "opportunity" }),
  ];

  it("step 2 is done with the four answers AND a risk and an opportunity", () => {
    expect(exploreProgress(indexSynthesisBoard([theme("TH", 1), ...answered(), ...stakes()]), "TH")).toBe("done");
  });

  it("step 2 is started with only one half, empty with neither", () => {
    expect(exploreProgress(indexSynthesisBoard([theme("TH", 1), ...answered()]), "TH")).toBe("started");
    expect(exploreProgress(indexSynthesisBoard([theme("TH", 1), ...stakes()]), "TH")).toBe("started");
    expect(exploreProgress(indexSynthesisBoard([theme("TH", 1), stakes()[0]]), "TH")).toBe("started");
    expect(exploreProgress(indexSynthesisBoard([theme("TH", 1)]), "TH")).toBe("empty");
  });
});

describe("implicationOrder / ordinal", () => {
  // lineageByCardId puts the key change first and the card itself last, so a direct child
  // of a key change has a chain of two.
  const week2 = () => [
    card("K1", "FIRST", null, 1),
    card("A", "SECOND", "K1", 2),
    card("B", "TERMINAL", "A", 3),
    card("C", "ORDER_4", "B", 4),
  ];

  it("counts steps out from the key change, not chain length", () => {
    const l = lineageByCardId(week2());
    expect(implicationOrder(l.A)).toBe(1);
    expect(implicationOrder(l.B)).toBe(2);
    expect(implicationOrder(l.C)).toBe(3);
  });

  // A key change is not an implication of anything, and a hand-typed card has no ancestry.
  it("has no order for a key change or a card with no lineage", () => {
    const l = lineageByCardId(week2());
    expect(implicationOrder(l.K1)).toBeNull();
    expect(implicationOrder(undefined)).toBeNull();
  });

  it("numbers ordinals the way English does, including the teens", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23].map(ordinal)).toEqual([
      "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd",
    ]);
  });
});

describe("keyChangeLabel", () => {
  it("uses the shouted topic before the colon, which is what the group calls it", () => {
    expect(
      keyChangeLabel("DECENTRALIZATION: Public health is hyperlocal, posing limits to coordination.")
    ).toBe("DECENTRALIZATION");
    expect(keyChangeLabel("FUNDING and BUDGET: Key local services are protected.")).toBe(
      "FUNDING and BUDGET"
    );
  });

  it("truncates when there is no colon to use", () => {
    // 19 characters plus the ellipsis, so the chip width is predictable.
    expect(keyChangeLabel("Power moves to community members over a long period", 20)).toBe(
      "Power moves to comm…"
    );
  });

  it("ignores a colon that arrives too late to be a label", () => {
    const late = "A very long preamble indeed before any colon: and then the rest";
    expect(keyChangeLabel(late, 20)).toBe("A very long preambl…");
  });

  it("leaves a short key change alone", () => {
    expect(keyChangeLabel("Funding is stable")).toBe("Funding is stable");
  });

  it("survives empty text", () => {
    expect(keyChangeLabel("")).toBe("");
  });
});

describe("branchOf", () => {
  // K1 ─ A ─ B ─ C, and K1 ─ D. K2 is a separate key change entirely.
  const week2 = () => [
    card("K1", "FIRST", null, 1),
    card("A", "SECOND", "K1", 2),
    card("B", "TERMINAL", "A", 3),
    card("C", "ORDER_4", "B", 4),
    card("D", "SECOND", "K1", 5),
    card("K2", "FIRST", null, 6),
    card("E", "SECOND", "K2", 7),
  ];

  it("returns the key change, its whole branch, and the path down to the card", () => {
    const got = branchOf(week2(), "B");
    expect(got?.root.id).toBe("K1");
    expect(got?.subtree.map((c) => c.id).sort()).toEqual(["A", "B", "C", "D", "K1"]);
    expect([...(got?.pathIds ?? [])].sort()).toEqual(["A", "B", "K1"]);
  });

  // The whole point is to show ONE branch, not the six-key-change map.
  it("leaves the other key changes out", () => {
    const ids = branchOf(week2(), "B")?.subtree.map((c) => c.id) ?? [];
    expect(ids).not.toContain("K2");
    expect(ids).not.toContain("E");
  });

  it("handles a key change asked about directly", () => {
    const got = branchOf(week2(), "K1");
    expect(got?.root.id).toBe("K1");
    expect([...(got?.pathIds ?? [])]).toEqual(["K1"]);
  });

  it("is null for a card that is not on the map", () => {
    expect(branchOf(week2(), "ghost")).toBeNull();
  });

  it("does not hang on a parent cycle", () => {
    const cycled = [
      card("X", "SECOND", "Y", 1),
      card("Y", "TERMINAL", "X", 2),
    ];
    const got = branchOf(cycled, "X");
    expect(got).not.toBeNull();
    expect(got!.subtree.length).toBeLessThanOrEqual(2);
  });
});

describe("lineageByCardId — keyChangeId", () => {
  it("carries the root's id down every branch, not just its text", () => {
    const l = lineageByCardId([
      card("K1", "FIRST", null, 1),
      card("A", "SECOND", "K1", 2),
      card("B", "TERMINAL", "A", 3),
      card("K2", "FIRST", null, 4),
      card("C", "SECOND", "K2", 5),
    ]);
    expect(l.A.keyChangeId).toBe("K1");
    expect(l.B.keyChangeId).toBe("K1");
    expect(l.C.keyChangeId).toBe("K2");
  });

  // Two key changes can read alike; the id is what makes the map pick the right branch.
  it("tells apart two key changes with identical text", () => {
    const same = [
      { ...card("K1", "FIRST", null, 1), text: "Same wording" },
      { ...card("A", "SECOND", "K1", 2), text: "under one" },
      { ...card("K2", "FIRST", null, 3), text: "Same wording" },
      { ...card("B", "SECOND", "K2", 4), text: "under the other" },
    ];
    const l = lineageByCardId(same);
    expect(l.A.keyChange).toBe(l.B.keyChange);
    expect(l.A.keyChangeId).not.toBe(l.B.keyChangeId);
  });
});

describe("seededIndex", () => {
  const board = () =>
    indexSynthesisBoard([
      theme("TH", 1),
      card("W3A", "SECOND", "TH", 2, { sourceCardId: "W2A" }),
      card("W3B", "FIRST", null, 3, { sourceCardId: "W2B" }),
      card("W3C", "FIRST", null, 4, { sourceCardId: "W2C", parked: true }),
      card("TYPED", "FIRST", null, 5), // typed here by hand — no Week 2 origin
    ]);

  it("maps a Week 2 id to the Week 3 card and the theme it sits in", () => {
    const idx = seededIndex(board());
    expect(idx.get("W2A")?.card.id).toBe("W3A");
    expect(idx.get("W2A")?.themeId).toBe("TH");
  });

  it("reports a tray card as being in no theme", () => {
    const idx = seededIndex(board());
    expect(idx.get("W2B")?.themeId).toBeNull();
    expect(idx.get("W2B")?.parked).toBe(false);
  });

  it("tells a parked card apart from a tray one", () => {
    expect(seededIndex(board()).get("W2C")?.parked).toBe(true);
  });

  // The case the map has to render rather than hide: nothing on this board came from it.
  it("is absent for a Week 2 card that was never seeded", () => {
    expect(seededIndex(board()).get("W2-NEVER-SEEDED")).toBeUndefined();
  });

  it("skips a card typed here by hand", () => {
    const vals = [...seededIndex(board()).values()].map((v) => v.card.id);
    expect(vals).not.toContain("TYPED");
  });

  // A twin copy carries a null sourceCardId, so one Week 2 card maps to one original.
  it("maps a duplicated implication to its original only", () => {
    const idx = seededIndex(
      indexSynthesisBoard([
        theme("T1", 1, { sort: 1000 }),
        theme("T2", 2, { sort: 2000 }),
        card("ORIG", "SECOND", "T1", 3, { sourceCardId: "W2X", twinKey: "K" }),
        card("COPY", "SECOND", "T2", 4, { twinKey: "K" }),
      ])
    );
    expect(idx.size).toBe(1);
    expect(idx.get("W2X")?.card.id).toBe("ORIG");
  });
});
