import { describe, it, expect } from "vitest";
import {
  DEFAULT_RIPPLES_CONFIG,
  buildChildrenMap,
  chipCountByCard,
  enumerateChains,
  longestChain,
  mostBranchedFirstOrder,
  mostChippedCards,
  resolveConfig,
  secondsForPhase,
  stepPhase,
  type CardOrder,
  type RippleCard,
  type RippleChip,
} from "./ripples-types";

// Tiny builders. createdTime is a zero-padded counter so ordering is deterministic.
function card(
  id: string,
  order: CardOrder,
  parentId: string | null,
  teamId: string,
  seq: number
): RippleCard {
  return {
    id,
    teamId,
    authorPlayerId: null,
    order,
    parentId,
    sort: 0,
    text: `${id}-text`,
    lensId: null,
    flagged: false,
    greyed: false,
    createdTime: `2026-01-01T00:00:${String(seq).padStart(2, "0")}Z`,
  };
}
function chip(id: string, playerId: string, cardId: string, teamId: string): RippleChip {
  return { id, teamId, playerId, cardId, createdTime: "2026-01-01T00:01:00Z" };
}

// Board:
//   T1:  A(first) ─ B(second) ─ C(terminal)
//                 └ D(second)
//        E(first, no children)
//   T2:  F(first) ─ G(second)
const cards: RippleCard[] = [
  card("A", "FIRST", null, "T1", 1),
  card("B", "SECOND", "A", "T1", 2),
  card("C", "TERMINAL", "B", "T1", 3),
  card("D", "SECOND", "A", "T1", 4),
  card("E", "FIRST", null, "T1", 5),
  card("F", "FIRST", null, "T2", 6),
  card("G", "SECOND", "F", "T2", 7),
];
const t1 = cards.filter((c) => c.teamId === "T1");

// B has 2 chips, D has 1.
const chips: RippleChip[] = [
  chip("c1", "p1", "B", "T1"),
  chip("c2", "p2", "B", "T1"),
  chip("c3", "p1", "D", "T1"),
];

describe("buildChildrenMap", () => {
  it("groups children by parent, roots under null, sorted by createdTime", () => {
    const m = buildChildrenMap(t1);
    expect(m.get(null)!.map((c) => c.id)).toEqual(["A", "E"]);
    expect(m.get("A")!.map((c) => c.id)).toEqual(["B", "D"]);
    expect(m.get("B")!.map((c) => c.id)).toEqual(["C"]);
    expect(m.get("D")).toBeUndefined();
  });
});

describe("chipCountByCard", () => {
  it("counts chips per card", () => {
    const m = chipCountByCard(chips);
    expect(m.get("B")).toBe(2);
    expect(m.get("D")).toBe(1);
    expect(m.get("A")).toBeUndefined();
  });
});

describe("longestChain", () => {
  it("finds the deepest root→leaf path and its team", () => {
    const res = longestChain(cards);
    expect(res).not.toBeNull();
    expect(res!.teamId).toBe("T1");
    expect(res!.chain.map((c) => c.id)).toEqual(["A", "B", "C"]);
  });
  it("returns null for an empty board", () => {
    expect(longestChain([])).toBeNull();
  });
  it("scopes to the cards passed in", () => {
    const res = longestChain(cards.filter((c) => c.teamId === "T2"));
    expect(res!.chain.map((c) => c.id)).toEqual(["F", "G"]);
  });
});

describe("mostChippedCards", () => {
  it("ranks by chip count, filters zero-chip cards", () => {
    const top = mostChippedCards(t1, chips, 3);
    expect(top.map((x) => x.card.id)).toEqual(["B", "D"]);
    expect(top[0].chipTotal).toBe(2);
  });
  it("respects topN", () => {
    expect(mostChippedCards(t1, chips, 1).map((x) => x.card.id)).toEqual(["B"]);
  });
});

describe("mostBranchedFirstOrder", () => {
  it("picks the first-order card with the most direct branches", () => {
    const res = mostBranchedFirstOrder(t1);
    expect(res!.card.id).toBe("A");
    expect(res!.branchCount).toBe(2);
    expect(res!.subtreeSize).toBe(3); // B, C, D
  });
});

describe("enumerateChains", () => {
  it("flattens every root→leaf path with summed chips", () => {
    const chains = enumerateChains(cards, chips, "T1");
    const ids = chains.map((c) => c.chain);
    expect(ids).toContainEqual(["A-text", "B-text", "C-text"]);
    expect(ids).toContainEqual(["A-text", "D-text"]);
    expect(ids).toContainEqual(["E-text"]);
    const abc = chains.find((c) => c.chain.length === 3)!;
    expect(abc.chipTotal).toBe(2); // only B is chipped on that path
    const ad = chains.find((c) => c.chain[1] === "D-text")!;
    expect(ad.chipTotal).toBe(1);
  });
});

describe("resolveConfig", () => {
  it("fills defaults from an empty blob", () => {
    expect(resolveConfig({})).toEqual(DEFAULT_RIPPLES_CONFIG);
    expect(resolveConfig(null)).toEqual(DEFAULT_RIPPLES_CONFIG);
  });
  it("merges overrides and coerces resolutions", () => {
    const c = resolveConfig({
      chainSeconds: 900,
      chipsPerPlayer: 5,
      challengeEnabled: false,
      resolutions: [{ uncertaintyId: "u1", title: "Trust", resolution: "Local" }],
      premise: "Some world",
    });
    expect(c.chainSeconds).toBe(900);
    expect(c.chipsPerPlayer).toBe(5);
    expect(c.challengeEnabled).toBe(false);
    expect(c.premise).toBe("Some world");
    expect(c.resolutions).toEqual([{ uncertaintyId: "u1", title: "Trust", resolution: "Local" }]);
    // untouched key falls back to default
    expect(c.ripple1Seconds).toBe(DEFAULT_RIPPLES_CONFIG.ripple1Seconds);
  });
  it("ignores invalid values", () => {
    const c = resolveConfig({ chainSeconds: -5, chipsPerPlayer: "lots" as unknown });
    expect(c.chainSeconds).toBe(DEFAULT_RIPPLES_CONFIG.chainSeconds);
    expect(c.chipsPerPlayer).toBe(DEFAULT_RIPPLES_CONFIG.chipsPerPlayer);
  });
});

describe("secondsForPhase", () => {
  it("returns the build length for BUILD, null otherwise", () => {
    const cfg = resolveConfig({ ripple1Seconds: 120 });
    expect(secondsForPhase(cfg, "BUILD")).toBe(120);
    expect(secondsForPhase(cfg, "LOBBY")).toBeNull();
    expect(secondsForPhase(cfg, "PREMISE")).toBeNull();
    expect(secondsForPhase(cfg, "HARVEST")).toBeNull();
  });
});

describe("stepPhase", () => {
  it("advances and clamps across the worksheet flow", () => {
    expect(stepPhase("LOBBY", 1)).toBe("PREMISE");
    expect(stepPhase("PREMISE", 1)).toBe("BUILD");
    expect(stepPhase("BUILD", 1)).toBe("HARVEST");
    expect(stepPhase("HARVEST", 1)).toBe("CLOSED");
    expect(stepPhase("LOBBY", -1)).toBe("LOBBY");
    expect(stepPhase("CLOSED", 1)).toBe("CLOSED");
    expect(stepPhase("BUILD", -1)).toBe("PREMISE");
  });
});
