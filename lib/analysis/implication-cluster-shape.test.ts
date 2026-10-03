import { describe, it, expect } from "vitest";
import {
  reconcileLlmGroups,
  membershipCounts,
  secondaryMemberships,
  isClusterMethod,
  GROUPING_PRESETS,
  type ImplicationItem,
  type RawGroup,
  rankByCentroid,
  SUGGESTED_LABEL_MAX,
  SUGGESTED_SUMMARY_MAX,
} from "./implication-cluster-shape";

const items = (...ids: string[]): ImplicationItem[] =>
  ids.map((id) => ({ id, text: `${id}-text`, keyChange: "KC" }));

const group = (label: string, ...member_ids: unknown[]): RawGroup => ({
  label,
  summary: `${label} summary`,
  member_ids,
});

describe("reconcileLlmGroups", () => {
  it("keeps a clean response as-is, with no notes", () => {
    const got = reconcileLlmGroups(items("a", "b", "c", "d"), [
      group("Power", "a", "b"),
      group("Money", "c", "d"),
    ]);
    expect(got.themes.map((t) => [t.label, t.memberIds])).toEqual([
      ["Power", ["a", "b"]],
      ["Money", ["c", "d"]],
    ]);
    expect(got.ungrouped).toEqual([]);
    expect(got.notes).toEqual([]);
    expect(got.themes[0].summary).toBe("Power summary");
    // Only the embedding method can honestly report cohesion.
    expect(got.themes[0].cohesion).toBeNull();
  });

  it("discards an id that is not on the board", () => {
    const got = reconcileLlmGroups(items("a", "b"), [group("Power", "a", "ghost", "b")]);
    expect(got.themes[0].memberIds).toEqual(["a", "b"]);
    expect(got.notes.join(" ")).toMatch(/Ignored 1 id .* not on this board/);
  });

  // The point of the change: an implication that speaks to two themes belongs in both.
  it("lets one implication sit in several themes, without complaint", () => {
    const got = reconcileLlmGroups(items("a", "b", "c"), [
      group("First", "a", "b"),
      group("Second", "b", "c"),
    ]);
    expect(got.themes[0].memberIds).toEqual(["a", "b"]);
    expect(got.themes[1].memberIds).toEqual(["b", "c"]);
    expect(got.ungrouped).toEqual([]);
    expect(got.notes).toEqual([]);
  });

  it("still de-duplicates an id repeated inside ONE theme", () => {
    const got = reconcileLlmGroups(items("a", "b"), [group("Power", "a", "a", "b")]);
    expect(got.themes[0].memberIds).toEqual(["a", "b"]);
    expect(got.notes.join(" ")).toMatch(/Removed 1 repeat/);
  });

  // Outliers are a legitimate result, not a failure — the Week 3 tray holds unclustered
  // cards indefinitely, so the suggestion tool must not be stricter than the board.
  it("leaves outliers out without treating it as a correction", () => {
    const got = reconcileLlmGroups(items("a", "b", "c"), [group("Power", "a")]);
    expect(got.ungrouped).toEqual(["b", "c"]);
    expect(got.notes).toEqual([]);
  });

  it("drops a group left empty after cleaning", () => {
    const got = reconcileLlmGroups(items("a"), [group("Real", "a"), group("Hollow", "ghost")]);
    expect(got.themes.map((t) => t.label)).toEqual(["Real"]);
    expect(got.notes.join(" ")).toMatch(/Dropped 1 theme/);
  });

  it("names a group the model left unlabelled rather than rendering a blank heading", () => {
    const got = reconcileLlmGroups(items("a"), [{ label: "   ", summary: "", member_ids: ["a"] }]);
    expect(got.themes[0].label).toBe("Untitled group");
    expect(got.themes[0].summary).toBeNull();
  });

  it("survives a response that is not shaped like a response at all", () => {
    const got = reconcileLlmGroups(items("a", "b"), [
      { label: 42, summary: null, member_ids: "not-an-array" },
      { member_ids: [null, 7, { id: "a" }, "b"] },
    ]);
    expect(got.themes.map((t) => t.memberIds)).toEqual([["b"]]);
    expect(got.ungrouped).toEqual(["a"]);
  });

  it("puts everything in ungrouped when the model returns nothing", () => {
    const got = reconcileLlmGroups(items("a", "b"), []);
    expect(got.themes).toEqual([]);
    expect(got.ungrouped).toEqual(["a", "b"]);
  });

  it("handles an empty board without inventing notes", () => {
    const got = reconcileLlmGroups([], []);
    expect(got).toEqual({ themes: [], ungrouped: [], notes: [] });
  });

  it("keeps a long statement-shaped label whole, and caps only at the card's own limit", () => {
    const sentence =
      "Responsibility for prevention moves to communities faster than the resources, " +
      "authority and evidence they would need to carry it well";
    const got = reconcileLlmGroups(items("a"), [
      { label: sentence, summary: "y".repeat(2000), member_ids: ["a"] },
      { label: "x".repeat(SUGGESTED_LABEL_MAX + 100), summary: "s", member_ids: ["a"] },
    ]);
    expect(got.themes[0].label).toBe(sentence);
    expect(got.themes[0].summary).toHaveLength(SUGGESTED_SUMMARY_MAX);
    expect(got.themes[1].label).toHaveLength(SUGGESTED_LABEL_MAX);
  });

  // The guarantee that survives multi-membership: an implication may be in many themes or
  // none, but it can never disappear, and nothing that is not on the board can appear.
  it("PROPERTY: themes ∪ ungrouped always covers the board, and only the board", () => {
    const candidates = items("a", "b", "c", "d", "e", "f");
    const hostile: RawGroup[][] = [
      [],
      [group("one", "a", "a", "a")],
      [group("one", "ghost1", "ghost2")],
      [group("one", "a", "b"), group("two", "b", "c"), group("three", "c", "a")],
      [group("one", "a", "b", "c", "d", "e", "f")],
      [group("one", "f"), group("two", "e"), group("three", "d")],
      [{ member_ids: null }, { label: "x" }, group("ok", "a", "ghost", "b")],
      [group("one", ...candidates.map((c) => c.id)), group("two", ...candidates.map((c) => c.id))],
    ];

    for (const rawGroups of hostile) {
      const got = reconcileLlmGroups(candidates, rawGroups);
      const all = candidates.map((c) => c.id).sort();
      const covered = [
        ...new Set([...got.themes.flatMap((t) => t.memberIds), ...got.ungrouped]),
      ].sort();
      // Nothing lost, nothing invented.
      expect(covered).toEqual(all);
      // No theme lists the same implication twice.
      for (const t of got.themes) expect(new Set(t.memberIds).size).toBe(t.memberIds.length);
      // ungrouped is exactly what no theme claimed — never overlaps a theme.
      const inATheme = new Set(got.themes.flatMap((t) => t.memberIds));
      expect(got.ungrouped.some((id) => inATheme.has(id))).toBe(false);
      // No theme survives empty.
      expect(got.themes.every((t) => t.memberIds.length > 0)).toBe(true);
    }
  });
});

describe("membershipCounts", () => {
  it("counts how many themes each implication bridges", () => {
    const { themes } = reconcileLlmGroups(items("a", "b", "c"), [
      group("one", "a", "b"),
      group("two", "b", "c"),
      group("three", "b"),
    ]);
    const counts = membershipCounts(themes);
    expect(counts.get("b")).toBe(3);
    expect(counts.get("a")).toBe(1);
    // An outlier is absent rather than zero — callers use `?? 0`.
    expect(counts.get("nobody")).toBeUndefined();
  });
});

describe("secondaryMemberships", () => {
  // Two tight poles plus a bridge sitting between them.
  const vec = (x: number, y: number) => [x, y];
  const points = [
    { id: "n1", vector: vec(1, 0) },
    { id: "n2", vector: vec(0.99, 0.1) },
    { id: "s1", vector: vec(0, 1) },
    { id: "s2", vector: vec(0.1, 0.99) },
    { id: "bridge", vector: vec(0.72, 0.69) },
  ];
  const clusters = [{ ids: ["n1", "n2"] }, { ids: ["s1", "s2"] }];

  it("adds a bridging implication to the other theme too", () => {
    const extra = secondaryMemberships(clusters, points, 0.7);
    expect(extra[0]).toContain("bridge");
    expect(extra[1]).toContain("bridge");
  });

  it("never re-lists an implication the theme already has", () => {
    const extra = secondaryMemberships(clusters, points, -1);
    expect(extra[0]).not.toContain("n1");
    expect(extra[1]).not.toContain("s1");
  });

  it("adds nothing when the bar is above everything", () => {
    expect(secondaryMemberships(clusters, points, 0.999)).toEqual([[], []]);
  });

  it("returns no extras for a cluster whose vectors are missing", () => {
    expect(secondaryMemberships([{ ids: ["ghost"] }], points, -1)).toEqual([[]]);
  });
});

describe("rankByCentroid", () => {
  const vec = (x: number, y: number) => [x, y];
  const members = [
    { id: "m1", vector: vec(1, 0) },
    { id: "m2", vector: vec(0.9, 0.1) },
  ];
  const candidates = [
    { id: "far", vector: vec(0, 1) },
    { id: "near", vector: vec(0.95, 0.05) },
    { id: "mid", vector: vec(0.7, 0.7) },
    { id: "m1", vector: vec(1, 0) }, // also a member
  ];

  it("ranks closest to the members' centroid first", () => {
    expect(rankByCentroid(members, candidates).map((r) => r.id)).toEqual(["near", "mid", "far"]);
  });

  it("never returns a member as a candidate", () => {
    expect(rankByCentroid(members, candidates).some((r) => r.id === "m1")).toBe(false);
  });

  it("returns nothing for a theme with no embedded members", () => {
    expect(rankByCentroid([], candidates)).toEqual([]);
  });

  it("scores are cosines, so they sit in [-1, 1] and descend", () => {
    const scores = rankByCentroid(members, candidates).map((r) => r.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    for (const s of scores) expect(Math.abs(s)).toBeLessThanOrEqual(1 + 1e-9);
  });
});

describe("isClusterMethod", () => {
  it("accepts the two methods and nothing else", () => {
    expect(isClusterMethod("llm")).toBe(true);
    expect(isClusterMethod("embedding")).toBe(true);
    for (const bad of ["LLM", "", null, undefined, 1, {}]) {
      expect(isClusterMethod(bad)).toBe(false);
    }
  });
});

describe("GROUPING_PRESETS", () => {
  it("runs loosest to tightest, inside the centered-cosine range", () => {
    const mins = GROUPING_PRESETS.map((p) => p.minSimilarity);
    expect(mins).toEqual([...mins].sort((a, b) => a - b));
    expect(Math.min(...mins)).toBeGreaterThan(0);
    expect(Math.max(...mins)).toBeLessThan(1);
  });
});
