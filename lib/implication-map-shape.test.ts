import { describe, it, expect } from "vitest";
import { buildMapModel, defaultBranch } from "./implication-map-shape";
import type { CardOrder, RippleCard } from "./ripples-types";

function card(id: string, order: CardOrder, o: Partial<RippleCard> = {}): RippleCard {
  return {
    id,
    teamId: "t",
    authorPlayerId: null,
    order,
    parentId: null,
    text: id,
    lensId: null,
    flagged: false,
    greyed: false,
    sort: 0,
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
    createdTime: "2026-10-01T00:00:00Z",
    ...o,
  };
}

describe("buildMapModel", () => {
  // Two scored key changes that were mapped under, one that was not, plus a sticky.
  const cards = [
    card("kcA", "FIRST", { text: "POWER: locally held", plausibility: 2, impact: 3 }),
    card("kcB", "FIRST", { text: "FUNDING: assured", plausibility: 5, impact: 5 }),
    card("kcC", "FIRST", { text: "COMPETITION: crowded", plausibility: 4, impact: 4 }),
    card("a1", "SECOND", { parentId: "kcA" }),
    card("b1", "SECOND", { parentId: "kcB" }),
    card("b2", "SECOND", { parentId: "kcB" }),
    card("b1a", "TERMINAL", { parentId: "b1" }),
    card("s1", "STICKY", { section: "implication-sandbox" }),
  ];
  const m = buildMapModel(cards);

  it("drops the brainstorm stickies from the tree", () => {
    expect(m.tree).toHaveLength(7);
    expect(m.tree.some((c) => c.id === "s1")).toBe(false);
  });

  it("offers only the key changes that were actually mapped under", () => {
    expect(m.keyChanges.map((k) => k.key)).toEqual(["kcB", "kcA"]);
    expect(m.keyChanges.some((k) => k.key === "kcC")).toBe(false);
  });

  it("ranks the pickable roots, best score first", () => {
    expect(m.roots[0].id).toBe("kcB");
  });

  it("counts everything under a key change, at any depth", () => {
    expect(m.keyChanges.find((k) => k.key === "kcB")?.count).toBe(3);
    expect(m.keyChanges.find((k) => k.key === "kcA")?.count).toBe(1);
  });

  it("counts the map by depth and totals the implications", () => {
    expect(m.orders).toEqual([
      { order: 1, count: 3 },
      { order: 2, count: 1 },
    ]);
    expect(m.total).toBe(4);
  });

  it("opens on the top-ranked mapped branch", () => {
    expect(defaultBranch(m)).toBe("kcB");
  });

  it("falls back to the whole map when nothing was mapped under", () => {
    const bare = buildMapModel([card("only", "FIRST"), card("sx", "STICKY")]);
    expect(bare.keyChanges).toEqual([]);
    expect(defaultBranch(bare)).toBeNull();
    expect(bare.total).toBe(0);
  });
});
