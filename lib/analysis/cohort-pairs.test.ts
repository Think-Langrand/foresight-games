import { describe, it, expect } from "vitest";
import { topCrossGroupPairs } from "./cohort-pairs";
import type { LabeledVector } from "./cluster";

// Unit vectors, so cosine is just the dot product and every expectation below is
// arithmetic a reader can check.
const v = (id: string, vector: number[]): LabeledVector => ({ id, vector });

const vectors: LabeledVector[] = [
  v("i1", [1, 0]), // g1
  v("i2", [1, 0]), // g2 — identical to i1, different room: the headline case
  v("i3", [0.6, 0.8]), // g2
  v("i4", [0, 1]), // g3
];
const owners = new Map(
  Object.entries({ i1: "g1", i2: "g2", i3: "g2", i4: "g3" })
);

describe("topCrossGroupPairs", () => {
  it("finds the same sentence written in two different rooms", () => {
    const got = topCrossGroupPairs(vectors, owners, { floor: 0.5, max: 10 });
    expect(got[0].aId).toBe("i1");
    expect(got[0].bId).toBe("i2");
    expect(got[0].similarity).toBeCloseTo(1, 6);
  });

  it("never returns a pair from inside one group — that is not the finding", () => {
    // i2 and i3 are both g2 and sit 0.6 apart, which would otherwise rank third.
    const got = topCrossGroupPairs(vectors, owners, { floor: 0, max: 50 });
    for (const p of got) {
      expect(owners.get(p.aId)).not.toBe(owners.get(p.bId));
    }
  });

  it("ranks closest first", () => {
    const got = topCrossGroupPairs(vectors, owners, { floor: 0.5, max: 10 });
    expect(got.map((p) => [p.aId, p.bId])).toEqual([
      ["i1", "i2"], // 1.0
      ["i3", "i4"], // 0.8
      ["i1", "i3"], // 0.6
    ]);
  });

  it("drops everything under the floor", () => {
    const got = topCrossGroupPairs(vectors, owners, { floor: 0.7, max: 10 });
    expect(got).toHaveLength(2);
    expect(got.every((p) => p.similarity >= 0.7)).toBe(true);
  });

  it("stops at max, keeping the closest", () => {
    const got = topCrossGroupPairs(vectors, owners, { floor: 0, max: 2 });
    expect(got).toHaveLength(2);
    expect(got.map((p) => p.aId)).toEqual(["i1", "i3"]);
  });

  it("lists a pair once, not once per direction", () => {
    const got = topCrossGroupPairs(vectors, owners, { floor: 0, max: 50 });
    const keys = got.map((p) => [p.aId, p.bId].sort().join("|"));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("skips a vector it cannot attribute to a group", () => {
    const got = topCrossGroupPairs(
      [...vectors, v("ghost", [1, 0])],
      owners,
      { floor: 0, max: 50 }
    );
    expect(got.some((p) => p.aId === "ghost" || p.bId === "ghost")).toBe(false);
  });

  it("returns nothing when there is only one group, however similar the material", () => {
    const got = topCrossGroupPairs(
      [v("a", [1, 0]), v("b", [1, 0])],
      new Map([["a", "g1"], ["b", "g1"]]),
      { floor: 0, max: 50 }
    );
    expect(got).toEqual([]);
  });

  it("handles a pool too small to pair", () => {
    expect(topCrossGroupPairs([v("a", [1, 0])], new Map([["a", "g1"]]), {})).toEqual([]);
    expect(topCrossGroupPairs([], new Map(), {})).toEqual([]);
  });
});
