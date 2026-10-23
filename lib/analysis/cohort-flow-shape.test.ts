import { describe, it, expect } from "vitest";
import { flowLayout } from "./cohort-flow-shape";

const links = [
  { groupId: "g1", themeIndex: 0, count: 6 },
  { groupId: "g1", themeIndex: 1, count: 2 },
  { groupId: "g2", themeIndex: 0, count: 2 },
];

const opts = { height: 300, nodeWidth: 10, gap: 8 };

describe("flowLayout", () => {
  it("sizes a node by what flows through it", () => {
    const l = flowLayout(["g1", "g2"], 2, links, opts);
    const g1 = l.sources.find((n) => n.key === "g1")!;
    const g2 = l.sources.find((n) => n.key === "g2")!;
    expect(g1.value).toBe(8);
    expect(g2.value).toBe(2);
    expect(g1.h).toBeGreaterThan(g2.h);
  });

  it("gives every link a ribbon with a thickness proportional to its count", () => {
    const l = flowLayout(["g1", "g2"], 2, links, opts);
    expect(l.ribbons).toHaveLength(3);
    const big = l.ribbons.find((r) => r.groupId === "g1" && r.themeIndex === 0)!;
    const small = l.ribbons.find((r) => r.groupId === "g1" && r.themeIndex === 1)!;
    expect(big.thickness).toBeGreaterThan(small.thickness);
    expect(big.path).toMatch(/^M/);
  });

  // The thing that makes a Sankey wrong rather than ugly: ribbons leaving a node have to
  // exactly fill it, or the picture claims a group contributed more or less than it did.
  it("packs each node's ribbons to exactly fill it", () => {
    const l = flowLayout(["g1", "g2"], 2, links, opts);
    for (const n of [...l.sources, ...l.targets]) {
      const mine = l.ribbons.filter((r) => (n.side === "source" ? r.groupId : String(r.themeIndex)) === n.key);
      if (mine.length === 0) continue;
      const sum = mine.reduce((s, r) => s + r.thickness, 0);
      expect(sum).toBeCloseTo(n.h, 4);
    }
  });

  it("keeps nodes inside the canvas", () => {
    const l = flowLayout(["g1", "g2"], 2, links, opts);
    for (const n of [...l.sources, ...l.targets]) {
      expect(n.y).toBeGreaterThanOrEqual(0);
      expect(n.y + n.h).toBeLessThanOrEqual(opts.height + 0.001);
    }
  });

  it("drops a node nothing flows through rather than drawing a zero-height sliver", () => {
    const l = flowLayout(["g1", "g2", "g3"], 2, links, opts);
    expect(l.sources.map((n) => n.key)).toEqual(["g1", "g2"]);
  });

  it("returns an empty layout for no links instead of dividing by zero", () => {
    const l = flowLayout(["g1"], 1, [], opts);
    expect(l.ribbons).toEqual([]);
    expect(l.sources).toEqual([]);
    expect(l.targets).toEqual([]);
  });

  it("orders source nodes as given, so a group sits where its colour says it should", () => {
    const l = flowLayout(["g2", "g1"], 2, links, opts);
    expect(l.sources.map((n) => n.key)).toEqual(["g2", "g1"]);
  });

  it("survives one node carrying everything", () => {
    const l = flowLayout(["g1"], 1, [{ groupId: "g1", themeIndex: 0, count: 5 }], opts);
    expect(l.sources[0].h).toBeCloseTo(opts.height, 4);
    expect(l.ribbons[0].thickness).toBeCloseTo(opts.height, 4);
  });
});
