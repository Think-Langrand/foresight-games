import { describe, it, expect } from "vitest";
import { clusterVectors, cosineSimilarity, centerVectors, type LabeledVector } from "./cluster";

describe("cosineSimilarity", () => {
  it("is 1 for identical directions and 0 for orthogonal", () => {
    expect(cosineSimilarity([1, 0], [2, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("returns 0 when either vector is all zeros", () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

// Three tight groups in 3-D, well separated along the axes.
function threeGroups(): LabeledVector[] {
  const jitter = (base: number[], d: number) => base.map((v) => v + d);
  return [
    { id: "a1", vector: jitter([1, 0, 0], 0.01) },
    { id: "a2", vector: jitter([1, 0, 0], -0.01) },
    { id: "a3", vector: [0.98, 0.02, 0] },
    { id: "b1", vector: jitter([0, 1, 0], 0.01) },
    { id: "b2", vector: [0.02, 0.98, 0] },
    { id: "c1", vector: [0, 0, 1] },
  ];
}

describe("clusterVectors", () => {
  it("returns [] for no points and a singleton for one", () => {
    expect(clusterVectors([])).toEqual([]);
    const one = clusterVectors([{ id: "x", vector: [1, 2, 3] }]);
    expect(one).toEqual([{ ids: ["x"], size: 1, cohesion: 1 }]);
  });

  it("recovers the natural groups and assigns every id exactly once", () => {
    const clusters = clusterVectors(threeGroups(), { minSimilarity: 0.5 });
    expect(clusters).toHaveLength(3);

    const byId = new Map<string, string[]>();
    for (const c of clusters) for (const id of c.ids) byId.set(id, c.ids);
    // a's cluster together, b's together, singleton c on its own.
    expect(new Set(byId.get("a1"))).toEqual(new Set(["a1", "a2", "a3"]));
    expect(new Set(byId.get("b1"))).toEqual(new Set(["b1", "b2"]));
    expect(byId.get("c1")).toEqual(["c1"]);

    // Every input id present, no dupes across clusters.
    const all = clusters.flatMap((c) => c.ids);
    expect(all).toHaveLength(6);
    expect(new Set(all).size).toBe(6);

    // Largest cluster comes first.
    expect(clusters[0].size).toBe(3);
  });

  it("an unreachable threshold leaves everything as singletons", () => {
    // Cosine is capped at 1, so 1.1 can never be met — no merge ever happens.
    const clusters = clusterVectors(threeGroups(), { minSimilarity: 1.1 });
    expect(clusters).toHaveLength(6);
    expect(clusters.every((c) => c.size === 1)).toBe(true);
  });

  it("a low threshold collapses everything into one cluster", () => {
    const clusters = clusterVectors(threeGroups(), { minSimilarity: -1 });
    expect(clusters).toHaveLength(1);
    expect(clusters[0].size).toBe(6);
  });

  it("centering separates an anisotropic corpus that raw cosine cannot", () => {
    // All vectors share a large common component (the '10' on axis 0) plus a
    // small distinguishing signal — the shape of real embeddings. Raw cosine is
    // ~1 for every pair, so nothing separates; centering removes the common
    // component and recovers the two natural groups.
    const points: LabeledVector[] = [
      { id: "x1", vector: [10, 1, 0] },
      { id: "x2", vector: [10, 1.1, 0] },
      { id: "y1", vector: [10, 0, 1] },
      { id: "y2", vector: [10, 0, 1.1] },
    ];
    // Raw: everything collapses into one cluster even at a high cutoff.
    expect(clusterVectors(points, { minSimilarity: 0.9 })).toHaveLength(1);
    // Centered: the two pairs separate.
    const centered = clusterVectors(points, { center: true, minSimilarity: 0.5 });
    expect(centered).toHaveLength(2);
    for (const c of centered) expect(c.size).toBe(2);
  });

  it("centerVectors subtracts the centroid (mean becomes ~0)", () => {
    const centered = centerVectors([
      { id: "a", vector: [1, 3] },
      { id: "b", vector: [3, 1] },
    ]);
    // Centroid is (2,2); centered vectors are (-1,1) and (1,-1).
    expect(centered[0].vector).toEqual([-1, 1]);
    expect(centered[1].vector).toEqual([1, -1]);
  });

  it("reports higher cohesion for a tight group than a loose one", () => {
    const tight = clusterVectors(
      [
        { id: "t1", vector: [1, 0] },
        { id: "t2", vector: [1, 0.01] },
      ],
      { minSimilarity: -1 }
    )[0];
    const loose = clusterVectors(
      [
        { id: "l1", vector: [1, 0] },
        { id: "l2", vector: [1, 1] },
      ],
      { minSimilarity: -1 }
    )[0];
    expect(tight.cohesion).toBeGreaterThan(loose.cohesion);
  });
});
