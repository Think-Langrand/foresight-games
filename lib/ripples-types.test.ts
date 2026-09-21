import { describe, it, expect } from "vitest";
import {
  DEFAULT_RIPPLES_CONFIG,
  MAX_TREE_DEPTH,
  TREE_ORDERS,
  buildChildrenMap,
  childOrderOf,
  chipCountByCard,
  depthByCard,
  depthOfOrder,
  enumerateChains,
  isTreeOrder,
  longestChain,
  maxRenderedDepth,
  mostBranchedFirstOrder,
  mostChippedCards,
  orderAtDepth,
  orderLabelForDepth,
  ordinal,
  prefixForDepth,
  resolveConfig,
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
    section: null,
    sourceCardId: null,
    sourceLabel: null,
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

// ---------------------------------------------------------------------------
// Depth model — the order alphabet, the cap, and the labels
// ---------------------------------------------------------------------------

// A chain as deep as the cap allows, built with orderAtDepth so it can't drift
// out of step with the alphabet. D0 is the root, D9 the deepest legal card.
const deepChain: RippleCard[] = Array.from({ length: MAX_TREE_DEPTH + 1 }, (_, d) =>
  card(`D${d}`, orderAtDepth(d)!, d === 0 ? null : `D${d - 1}`, "T3", 10 + d)
);

describe("the order alphabet", () => {
  it("pins the legacy names to their depths, so old boards keep reading correctly", () => {
    expect(depthOfOrder("FIRST")).toBe(0);
    expect(depthOfOrder("SECOND")).toBe(1);
    expect(depthOfOrder("TERMINAL")).toBe(2);
    expect(depthOfOrder("ORDER_4")).toBe(3);
  });

  it("round-trips every tree order through depth and back", () => {
    for (const order of TREE_ORDERS) {
      expect(orderAtDepth(depthOfOrder(order)!)).toBe(order);
    }
  });

  it("has no depth for a note or for junk", () => {
    expect(depthOfOrder("STICKY")).toBeNull();
    expect(depthOfOrder("NONSENSE")).toBeNull();
    expect(depthOfOrder("ORDER_0")).toBeNull();
    expect(depthOfOrder("ORDER_999")).toBeNull();
    expect(isTreeOrder("STICKY")).toBe(false);
    expect(isTreeOrder("TERMINAL")).toBe(true);
  });

  it("caps the map at ten levels", () => {
    // Pinned literally: appending to TREE_ORDERS is a product decision, not a typo.
    expect(MAX_TREE_DEPTH).toBe(9);
    expect(TREE_ORDERS).toHaveLength(10);
    expect(orderAtDepth(MAX_TREE_DEPTH)).not.toBeNull();
    expect(orderAtDepth(MAX_TREE_DEPTH + 1)).toBeNull();
  });
});

describe("childOrderOf", () => {
  it("walks the chain one level at a time, past the old three-level limit", () => {
    expect(childOrderOf(null)).toBe("FIRST");
    expect(childOrderOf("FIRST")).toBe("SECOND");
    expect(childOrderOf("SECOND")).toBe("TERMINAL");
    expect(childOrderOf("TERMINAL")).toBe("ORDER_4");
    expect(childOrderOf("ORDER_4")).toBe("ORDER_5");
  });

  it("stops exactly at the cap", () => {
    expect(childOrderOf(orderAtDepth(MAX_TREE_DEPTH - 1))).toBe(orderAtDepth(MAX_TREE_DEPTH));
    expect(childOrderOf(orderAtDepth(MAX_TREE_DEPTH))).toBeNull();
  });

  it("refuses to give a note or a junk order any children", () => {
    expect(childOrderOf("STICKY")).toBeNull();
    expect(childOrderOf("NONSENSE" as CardOrder)).toBeNull();
  });
});

describe("level labels", () => {
  it("names the roots as key changes and counts implications outward from there", () => {
    expect(orderLabelForDepth(0)).toBe("Key change");
    expect(orderLabelForDepth(1)).toBe("1st order");
    expect(orderLabelForDepth(2)).toBe("2nd order");
    expect(orderLabelForDepth(3)).toBe("3rd order");
    expect(orderLabelForDepth(9)).toBe("9th order");
  });

  it("gets the teens right", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111, 112, 113].map(ordinal)).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "13th",
      "21st",
      "22nd",
      "23rd",
      "101st",
      "111th",
      "112th",
      "113th",
    ]);
  });

  it("keeps the first two build prompts and repeats the third from then on", () => {
    expect(prefixForDepth(0)).toBe("In this world…");
    expect(prefixForDepth(1)).toBe("Because of that…");
    for (let d = 2; d <= MAX_TREE_DEPTH; d++) {
      expect(prefixForDepth(d)).toBe("And this causes…");
    }
  });
});

describe("depthByCard", () => {
  it("walks depth from the roots, not from the stored order", () => {
    const depths = depthByCard(cards);
    expect(depths.get("A")).toBe(0);
    expect(depths.get("B")).toBe(1);
    expect(depths.get("C")).toBe(2);
    expect(depths.get("D")).toBe(1);
    expect(depths.get("F")).toBe(0);
  });

  it("trusts position over a mislabelled order", () => {
    // X claims to be a key change but hangs off a root — it's a 1st-order card.
    const mislabelled = [card("W", "FIRST", null, "T4", 1), card("X", "FIRST", "W", "T4", 2)];
    expect(depthByCard(mislabelled).get("X")).toBe(1);
  });

  it("covers a chain all the way to the cap", () => {
    const depths = depthByCard(deepChain);
    expect(depths.size).toBe(MAX_TREE_DEPTH + 1);
    expect(depths.get(`D${MAX_TREE_DEPTH}`)).toBe(MAX_TREE_DEPTH);
  });

  it("leaves out brainstorm notes, orphans, and cycles", () => {
    const sticky = card("S", "STICKY", null, "T5", 1);
    const orphan = card("O", "SECOND", "missing", "T5", 2);
    const loopA = card("LA", "SECOND", "LB", "T5", 3);
    const loopB = card("LB", "SECOND", "LA", "T5", 4);
    const depths = depthByCard([sticky, orphan, loopA, loopB]);
    expect(depths.size).toBe(0);
  });
});

describe("maxRenderedDepth", () => {
  it("reports only the occupied columns when read-only", () => {
    expect(maxRenderedDepth(cards)).toBe(2);
    expect(maxRenderedDepth([])).toBe(-1);
  });

  it("leaves room for the ＋ column when interactive", () => {
    expect(maxRenderedDepth(cards, { interactive: true })).toBe(3);
    // No cards yet, but the add-a-key-change ＋ still needs column 0.
    expect(maxRenderedDepth([], { interactive: true })).toBe(0);
  });

  it("adds no ＋ column for a greyed leaf, which can't take children", () => {
    const leaf = card("B", "SECOND", "A", "T6", 2);
    const root = card("A", "FIRST", null, "T6", 1);
    // Live leaf at depth 1 → its ＋ opens column 2. Greyed, it opens nothing, and
    // the widest row is A's own ＋ back at column 1.
    expect(maxRenderedDepth([root, leaf], { interactive: true })).toBe(2);
    expect(maxRenderedDepth([root, { ...leaf, greyed: true }], { interactive: true })).toBe(1);
  });

  it("adds no ＋ column past the cap", () => {
    expect(maxRenderedDepth(deepChain, { interactive: true })).toBe(MAX_TREE_DEPTH);
  });

  it("gives the same answer from a precomputed depth map", () => {
    // The tree passes its own map in so the walk happens once per render.
    for (const board of [cards, deepChain, []]) {
      for (const interactive of [true, false]) {
        expect(maxRenderedDepth(board, { interactive, depths: depthByCard(board) })).toBe(
          maxRenderedDepth(board, { interactive })
        );
      }
    }
  });
});

describe("deep chains in the derivations", () => {
  it("follows a chain past the old three-level limit", () => {
    const best = longestChain(deepChain);
    expect(best?.chain).toHaveLength(MAX_TREE_DEPTH + 1);
    expect(best?.chain.map((c) => c.id)).toEqual(deepChain.map((c) => c.id));
  });

  it("enumerates a deep chain as one root→leaf path", () => {
    const chains = enumerateChains(deepChain, [], "T3");
    expect(chains).toHaveLength(1);
    expect(chains[0].chain).toHaveLength(MAX_TREE_DEPTH + 1);
  });
});
