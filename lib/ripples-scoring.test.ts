import { describe, it, expect } from "vitest";
import {
  SCORE_AXES,
  SCORE_MAX,
  SCORE_MIN,
  SCORE_VALUES,
  cardScores,
  coerceScore,
  isScore,
  isScored,
  matrixCells,
  rankByCardId,
  rankValue,
  rankedRoots,
  scoringComplete,
  scoringProgress,
  sortRootsByRank,
} from "./ripples-scoring";
import type { CardOrder, RippleCard } from "./ripples-types";

// Tiny builder. createdTime is a zero-padded counter so ordering is deterministic.
function card(
  id: string,
  order: CardOrder,
  opts: {
    parentId?: string | null;
    seq?: number;
    plausibility?: number | null;
    impact?: number | null;
  } = {}
): RippleCard {
  return {
    id,
    teamId: "T",
    authorPlayerId: "P1",
    order,
    parentId: opts.parentId ?? null,
    text: `${id}-text`,
    lensId: null,
    flagged: false,
    greyed: false,
    sort: 0,
    section: null,
    sourceCardId: null,
    sourceLabel: null,
    plausibility: opts.plausibility ?? null,
    impact: opts.impact ?? null,
    createdTime: `2026-01-01T00:00:${String(opts.seq ?? 0).padStart(2, "0")}Z`,
  };
}

// A root (key change) with both axes set.
const scored = (id: string, p: number, i: number, seq = 0) =>
  card(id, "FIRST", { plausibility: p, impact: i, seq });

describe("the scale", () => {
  it("exposes both axes and all five values", () => {
    expect(SCORE_AXES).toEqual(["plausibility", "impact"]);
    expect(SCORE_VALUES).toEqual([1, 2, 3, 4, 5]);
    expect([SCORE_MIN, SCORE_MAX]).toEqual([1, 5]);
  });

  it("isScore accepts only integers in range", () => {
    for (const v of SCORE_VALUES) expect(isScore(v)).toBe(true);
    for (const v of [0, 6, 3.5, -1, NaN, Infinity, "3", null, undefined, {}]) {
      expect(isScore(v)).toBe(false);
    }
  });

  it("coerceScore takes numbers and digit strings, rejects everything else", () => {
    expect(coerceScore(1)).toBe(1);
    expect(coerceScore(5)).toBe(5);
    // Request bodies are hand-rollable, and a digit string is unambiguous.
    expect(coerceScore("4")).toBe(4);
    expect(coerceScore(" 4 ")).toBe(4);
    for (const v of [0, 6, 3.5, -1, NaN, Infinity, "", " ", "4.5", "four", "0", "6", null, undefined, {}, []]) {
      expect(coerceScore(v)).toBeNull();
    }
  });
});

describe("per-card reads", () => {
  it("normalises out-of-range junk to null rather than throwing", () => {
    const junk = card("X", "FIRST", { plausibility: 9, impact: 0 });
    expect(cardScores(junk)).toEqual({ plausibility: null, impact: null });
    expect(isScored(junk)).toBe(false);
    expect(rankValue(junk)).toBeNull();
  });

  it("needs BOTH axes to count as scored", () => {
    expect(isScored(card("A", "FIRST", { plausibility: 4 }))).toBe(false);
    expect(isScored(card("A", "FIRST", { impact: 4 }))).toBe(false);
    expect(isScored(scored("A", 4, 4))).toBe(true);
    expect(rankValue(card("A", "FIRST", { plausibility: 4 }))).toBeNull();
  });

  it("rankValue is the product", () => {
    expect(rankValue(scored("A", 5, 5))).toBe(25);
    expect(rankValue(scored("A", 1, 1))).toBe(1);
    expect(rankValue(scored("A", 4, 3))).toBe(12);
  });
});

describe("rankedRoots", () => {
  it("orders by value desc and numbers the ranks 1..n", () => {
    const cards = [scored("low", 2, 3, 1), scored("high", 5, 5, 2), scored("mid", 4, 3, 3)];
    expect(rankedRoots(cards).map((r) => [r.card.id, r.rank])).toEqual([
      ["high", 1],
      ["mid", 2],
      ["low", 3],
    ]);
  });

  it("breaks a product tie by impact desc", () => {
    // Both are 15; the higher-impact change wins.
    const cards = [scored("p5i3", 5, 3, 1), scored("p3i5", 3, 5, 2)];
    expect(rankedRoots(cards).map((r) => r.card.id)).toEqual(["p3i5", "p5i3"]);
  });

  it("breaks a full tie by createdTime asc", () => {
    const cards = [scored("later", 4, 4, 9), scored("earlier", 4, 4, 1)];
    expect(rankedRoots(cards).map((r) => r.card.id)).toEqual(["earlier", "later"]);
  });

  it("sinks unscored and half-scored roots to the end, in createdTime order", () => {
    const cards = [
      card("half", "FIRST", { plausibility: 5, seq: 1 }),
      card("none", "FIRST", { seq: 2 }),
      scored("full", 2, 2, 3),
    ];
    const ranked = rankedRoots(cards);
    expect(ranked.map((r) => r.card.id)).toEqual(["full", "half", "none"]);
    expect(ranked.map((r) => r.rank)).toEqual([1, null, null]);
  });

  it("ignores STICKY notes and non-root cards", () => {
    const cards = [
      scored("root", 5, 5, 1),
      card("child", "SECOND", { parentId: "root", plausibility: 5, impact: 5, seq: 2 }),
      card("note", "STICKY", { plausibility: 5, impact: 5, seq: 3 }),
    ];
    expect(rankedRoots(cards).map((r) => r.card.id)).toEqual(["root"]);
  });
});

describe("rankByCardId", () => {
  it("maps only fully scored roots, with no gaps in the ranks", () => {
    const cards = [scored("a", 5, 5, 1), card("b", "FIRST", { seq: 2 }), scored("c", 2, 2, 3)];
    const ranks = rankByCardId(cards);
    expect([...ranks.entries()].sort()).toEqual([
      ["a", 1],
      ["c", 2],
    ]);
    expect(ranks.has("b")).toBe(false);
  });
});

describe("sortRootsByRank", () => {
  it("leaves an unscored board in exactly the order it was given", () => {
    // The regression guard for the solo/standalone game and every pre-scoring board.
    const roots = [card("a", "FIRST", { seq: 1 }), card("b", "FIRST", { seq: 2 }), card("c", "FIRST", { seq: 3 })];
    expect(sortRootsByRank(roots).map((c) => c.id)).toEqual(["a", "b", "c"]);
  });

  it("returns a new array without mutating the input", () => {
    const roots = [scored("low", 1, 1, 1), scored("high", 5, 5, 2)];
    const out = sortRootsByRank(roots);
    expect(out).not.toBe(roots);
    expect(roots.map((c) => c.id)).toEqual(["low", "high"]);
    expect(out.map((c) => c.id)).toEqual(["high", "low"]);
  });
});

describe("matrixCells", () => {
  it("always returns 25 cells, impact 5→1 by row and plausibility 1→5 within a row", () => {
    const cells = matrixCells([]);
    expect(cells).toHaveLength(25);
    expect(cells[0]).toMatchObject({ impact: 5, plausibility: 1 });
    expect(cells[4]).toMatchObject({ impact: 5, plausibility: 5 });
    expect(cells[24]).toMatchObject({ impact: 1, plausibility: 5 });
  });

  it("places each scored root in exactly one cell", () => {
    const cards = [scored("a", 2, 4, 1), scored("b", 5, 1, 2)];
    const cells = matrixCells(cards);
    const placed = cells.flatMap((c) => c.cards.map((card) => [card.id, c.plausibility, c.impact]));
    expect(placed).toEqual([
      ["a", 2, 4],
      ["b", 5, 1],
    ]);
  });

  it("places nothing for half-scored, non-root or STICKY cards", () => {
    const cards = [
      card("half", "FIRST", { plausibility: 3, seq: 1 }),
      card("child", "SECOND", { parentId: "r", plausibility: 3, impact: 3, seq: 2 }),
      card("note", "STICKY", { plausibility: 3, impact: 3, seq: 3 }),
    ];
    expect(matrixCells(cards).every((c) => c.cards.length === 0)).toBe(true);
  });

  it("orders several cards in one cell by rank", () => {
    // Identical scores, so rank order is createdTime order.
    const cards = [scored("later", 3, 3, 9), scored("earlier", 3, 3, 1)];
    const cell = matrixCells(cards).find((c) => c.plausibility === 3 && c.impact === 3);
    expect(cell?.cards.map((c) => c.id)).toEqual(["earlier", "later"]);
  });
});

describe("progress", () => {
  it("counts only key changes toward the total", () => {
    const cards = [
      scored("a", 5, 5, 1),
      card("b", "FIRST", { seq: 2 }),
      card("child", "SECOND", { parentId: "a", seq: 3 }),
      card("note", "STICKY", { seq: 4 }),
    ];
    expect(scoringProgress(cards)).toEqual({ scored: 1, total: 2 });
    expect(scoringComplete(cards)).toBe(false);
  });

  it("is complete only when every key change has both axes", () => {
    expect(scoringComplete([scored("a", 1, 1, 1), scored("b", 5, 5, 2)])).toBe(true);
    expect(scoringComplete([scored("a", 1, 1, 1), card("b", "FIRST", { plausibility: 5, seq: 2 })])).toBe(false);
  });

  it("is NOT complete on a board with no key changes at all", () => {
    // Otherwise an unseeded board would vacuously show "all ranked".
    expect(scoringComplete([card("note", "STICKY")])).toBe(false);
    expect(scoringProgress([])).toEqual({ scored: 0, total: 0 });
  });
});
