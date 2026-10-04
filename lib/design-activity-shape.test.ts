import { describe, it, expect } from "vitest";
import { classifyCard, emptyTally, sumTallies, tallyCards, type ActivityCardRow } from "./design-activity-shape";
import { isTreeRoot, type CardOrder, type RippleCard } from "./ripples-types";

// Tiny builder. createdAt is a zero-padded counter so ordering is deterministic.
function row(
  code: string,
  order: CardOrder,
  opts: { section?: string | null; parentId?: string | null; seq?: number; author?: string | null } = {}
): ActivityCardRow {
  return {
    code,
    order,
    parentId: opts.parentId ?? null,
    section: opts.section ?? null,
    createdAt: `2026-01-01T00:00:${String(opts.seq ?? 0).padStart(2, "0")}Z`,
    authorPlayerId: opts.author === undefined ? "P1" : opts.author,
  };
}

describe("classifyCard", () => {
  it("puts every card in exactly one bucket", () => {
    expect(classifyCard(row("A", "FIRST"))).toBe("keyChanges");
    expect(classifyCard(row("A", "SECOND", { parentId: "c1" }))).toBe("implications");
    expect(classifyCard(row("A", "STICKY"))).toBe("brainstorm");
    expect(classifyCard(row("A", "STICKY", { section: "risks" }))).toBe("answers");
  });

  it("counts a parented card as an implication whatever its order", () => {
    // Depth lives in card_order, but having a parent is what makes it an implication —
    // a seeded/edited row with an odd order must not fall through to keyChanges.
    expect(classifyCard(row("A", "TERMINAL", { parentId: "c1" }))).toBe("implications");
    expect(classifyCard(row("A", "ORDER_7", { parentId: "c1" }))).toBe("implications");
  });

  it("agrees with isTreeRoot on which cards are key changes", () => {
    const cards: RippleCard[] = (
      [
        { order: "FIRST", parentId: null, section: null },
        { order: "SECOND", parentId: "c1", section: null },
        { order: "STICKY", parentId: null, section: null },
        { order: "STICKY", parentId: null, section: "risks" },
      ] as const
    ).map((c, i) => ({ ...(c as object), id: `c${i}` }) as RippleCard);
    for (const c of cards) {
      expect(classifyCard(c) === "keyChanges").toBe(isTreeRoot(c));
    }
  });
});

describe("tallyCards", () => {
  it("splits one board four ways and sums to the total", () => {
    const t = tallyCards([
      row("abc", "FIRST"),
      row("abc", "FIRST"),
      row("abc", "SECOND", { parentId: "c1" }),
      row("abc", "TERMINAL", { parentId: "c2" }),
      row("abc", "TERMINAL", { parentId: "c3" }),
      row("abc", "STICKY"),
      row("abc", "STICKY", { section: "risks" }),
    ]).get("ABC")!;
    expect(t).toMatchObject({ keyChanges: 2, implications: 3, brainstorm: 1, answers: 1, total: 7 });
    expect(t.keyChanges + t.implications + t.brainstorm + t.answers).toBe(t.total);
  });

  it("keys by upper-cased code and keeps boards apart", () => {
    const out = tallyCards([row("abc", "FIRST"), row("ABC", "STICKY"), row("xyz", "FIRST")]);
    expect([...out.keys()].sort()).toEqual(["ABC", "XYZ"]);
    expect(out.get("ABC")!.total).toBe(2);
    expect(out.get("XYZ")!.total).toBe(1);
  });

  it("tracks the latest activity and per-author counts", () => {
    const t = tallyCards([
      row("abc", "FIRST", { seq: 5, author: "P1" }),
      row("abc", "FIRST", { seq: 9, author: "P2" }),
      row("abc", "STICKY", { seq: 2, author: "P1" }),
      row("abc", "STICKY", { seq: 1, author: null }), // an orphaned card (author deleted)
    ]).get("ABC")!;
    expect(t.lastAt).toBe("2026-01-01T00:00:09Z");
    expect(t.byAuthor).toEqual({ P1: 2, P2: 1 });
  });

  it("returns nothing for a board with no cards", () => {
    expect(tallyCards([]).size).toBe(0);
  });
});

describe("sumTallies", () => {
  it("folds boards into one row/column total", () => {
    const a = tallyCards([row("a", "FIRST", { seq: 1, author: "P1" })]).get("A")!;
    const b = tallyCards([
      row("b", "SECOND", { parentId: "c1", seq: 7, author: "P1" }),
      row("b", "STICKY", { section: "risks", seq: 3, author: "P2" }),
    ]).get("B")!;
    const sum = sumTallies([a, b]);
    expect(sum).toMatchObject({ keyChanges: 1, implications: 1, brainstorm: 0, answers: 1, total: 3 });
    expect(sum.lastAt).toBe("2026-01-01T00:00:07Z");
    expect(sum.byAuthor).toEqual({ P1: 2, P2: 1 });
  });

  it("is the identity over nothing", () => {
    expect(sumTallies([])).toEqual(emptyTally());
    expect(sumTallies([emptyTally(), emptyTally()]).lastAt).toBeNull();
  });
});
