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

describe("classifyCard · Week 3 kinds", () => {
  // A theme is a tree root and a risk has a parent, so without card_kind a synthesis
  // board reported "key changes" and "implications" it does not have.
  it("buckets a theme as a theme and anything else with a kind as synthesis", () => {
    expect(classifyCard({ ...row("A", "FIRST"), cardKind: "theme" })).toBe("themes");
    expect(classifyCard({ ...row("A", "SECOND", { parentId: "t1" }), cardKind: "risk" })).toBe("synthesis");
    expect(classifyCard({ ...row("A", "FIRST"), cardKind: "hope" })).toBe("synthesis");
  });

  it("still counts a Week 2 implication clustered under a theme as an implication", () => {
    expect(classifyCard({ ...row("A", "SECOND", { parentId: "t1" }), cardKind: null })).toBe("implications");
  });

  it("gives Week 4's kinds their own bucket, with no flag needed", () => {
    // `response` and `milestone` exist on no other week, so the card says which board it
    // is on by itself — unlike a plain root, which needs the `synthesis` flag. Without
    // this they fell into `synthesis` and a Week 4 cell reported a backcasting timeline
    // as "answers, risks, hopes & fears".
    expect(classifyCard({ ...row("A", "FIRST"), cardKind: "response" })).toBe("commitments");
    expect(
      classifyCard({ ...row("A", "SECOND", { parentId: "r1", section: "w4-p1" }), cardKind: "milestone" })
    ).toBe("commitments");
  });

  it("buckets ALL FOUR of Week 4's kinds, including step 5's marks", () => {
    // `pick` and `settled` were missed when step 5 added them and were tallied as Session 3
    // work, so a Week 4 cell reported phantom "answers, risks, hopes & fears" on a board
    // with no themes, risks or hopes on it at all.
    for (const kind of ["response", "milestone", "pick", "settled"]) {
      expect(classifyCard({ ...row("A", "FIRST"), cardKind: kind })).toBe("commitments");
    }
  });

  it("sums the commitments bucket, like every other field", () => {
    // sumTallies gained the field on CardTally and emptyTally but not in the fold, so a
    // summed row counted those cards in `total` and showed 0 in the breakdown.
    const a = tallyCards([{ ...row("w4", "FIRST", { seq: 1 }), cardKind: "response" }]).get("W4")!;
    const b = tallyCards([{ ...row("w4", "FIRST", { seq: 2 }), cardKind: "pick" }]).get("W4")!;
    const sum = sumTallies([a, b]);
    expect(sum.commitments).toBe(2);
    expect(sum.total).toBe(2);
    // The invariant the omission broke: the buckets add up to the total.
    const buckets = sum.themes + sum.synthesis + sum.commitments + sum.keyChanges + sum.implications + sum.brainstorm + sum.answers;
    expect(buckets).toBe(sum.total);
  });

  it("tallies a Week 4 board without borrowing Week 3's bucket", () => {
    const t = tallyCards([
      { ...row("w4", "FIRST", { seq: 1 }), cardKind: "response" },
      { ...row("w4", "FIRST", { seq: 2 }), cardKind: "response" },
      { ...row("w4", "SECOND", { parentId: "r1", section: "w4-p1", seq: 3 }), cardKind: "milestone" },
      { ...row("w4", "STICKY", { section: "aspiration-statement", seq: 4 }), cardKind: null },
    ]).get("W4")!;
    // The aspiration rides the section substrate, so its answer counts as an `answer`,
    // the same as any worksheet block's.
    expect(t).toMatchObject({ commitments: 3, answers: 1, synthesis: 0, keyChanges: 0, total: 4 });
  });

  it("tallies and sums the new buckets", () => {
    const t = tallyCards([
      { ...row("abc", "FIRST", { seq: 1 }), cardKind: "theme" },
      { ...row("abc", "SECOND", { parentId: "t1", seq: 2 }), cardKind: null },
      { ...row("abc", "SECOND", { parentId: "t1", seq: 3 }), cardKind: "opportunity" },
    ]).get("ABC")!;
    expect(t).toMatchObject({ themes: 1, implications: 1, synthesis: 1, keyChanges: 0, total: 3 });
    expect(sumTallies([t, emptyTally()])).toMatchObject({ themes: 1, synthesis: 1, total: 3 });
  });
});

describe("classifyCard · a synthesis board's tray", () => {
  // A Week 3 board has no key changes of its own. Its plain roots are implications waiting
  // in the tray, and must count the same before and after they are clustered.
  it("counts an unclustered tray implication as an implication, not a key change", () => {
    const tray = row("A", "FIRST");
    expect(classifyCard(tray, true)).toBe("implications");
    expect(classifyCard(tray, false)).toBe("keyChanges"); // the same row on a Week 2 board
    expect(classifyCard(row("A", "SECOND", { parentId: "t1" }), true)).toBe("implications");
  });

  it("tallies by board kind", () => {
    const rows = [row("w3", "FIRST", { seq: 1 }), row("w2", "FIRST", { seq: 2 })];
    const t = tallyCards(rows, new Set(["W3"]));
    expect(t.get("W3")).toMatchObject({ implications: 1, keyChanges: 0 });
    expect(t.get("W2")).toMatchObject({ implications: 0, keyChanges: 1 });
  });
});
