import { describe, it, expect } from "vitest";
import { layout } from "./wheel-layout";
import type { CardOrder, RippleCard } from "./ripples-types";

function card(id: string, order: CardOrder, parentId: string | null, seq: number): RippleCard {
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
  };
}

// K1 ─ A, B(─ B1)   K2 ─ C      N1 is a brainstorm sticky, never drawn.
const board = (): RippleCard[] => [
  card("K1", "FIRST", null, 1),
  card("K2", "FIRST", null, 2),
  card("A", "SECOND", "K1", 3),
  card("B", "SECOND", "K1", 4),
  card("B1", "TERMINAL", "B", 5),
  card("C", "SECOND", "K2", 6),
  card("N1", "STICKY", null, 7),
];

describe("layout", () => {
  it("places every implication exactly once and never the stickies", () => {
    const { nodes } = layout(board());
    expect(nodes.map((n) => n.id).sort()).toEqual(["A", "B", "B1", "C", "K1", "K2"]);
  });

  it("gives every node an incoming link", () => {
    const { nodes, links } = layout(board());
    expect(links.map((l) => l.toId).sort()).toEqual(nodes.map((n) => n.id).sort());
  });

  it("puts the key changes on ring 0 and their children further out", () => {
    const byId = new Map(layout(board()).nodes.map((n) => [n.id, n]));
    expect(byId.get("K1")!.depth).toBe(0);
    expect(byId.get("A")!.depth).toBe(1);
    expect(byId.get("B1")!.depth).toBe(2);
  });

  // The canvas seeds unsaved positions from this, on every client independently — so two
  // people must compute the same wheel from the same board or their canvases disagree.
  it("is deterministic for a given board", () => {
    expect(layout(board())).toEqual(layout(board()));
  });

  it("survives an empty board with a drawable size", () => {
    const { nodes, links, size } = layout([]);
    expect(nodes).toEqual([]);
    expect(links).toEqual([]);
    expect(size).toBeGreaterThan(0);
  });
});
