import { describe, it, expect } from "vitest";
import {
  reconcileLlmGroups,
  isClusterMethod,
  GROUPING_PRESETS,
  type ImplicationItem,
  type RawGroup,
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

  it("keeps the first claim when two groups want the same implication", () => {
    const got = reconcileLlmGroups(items("a", "b", "c"), [
      group("First", "a", "b"),
      group("Second", "b", "c"),
    ]);
    expect(got.themes[0].memberIds).toEqual(["a", "b"]);
    expect(got.themes[1].memberIds).toEqual(["c"]);
    expect(got.notes.join(" ")).toMatch(/listed in more than one group/);
  });

  it("de-duplicates an id repeated inside one group", () => {
    const got = reconcileLlmGroups(items("a", "b"), [group("Power", "a", "a", "b")]);
    expect(got.themes[0].memberIds).toEqual(["a", "b"]);
    expect(got.notes.join(" ")).toMatch(/more than one group/);
  });

  it("reports the implications the model never placed", () => {
    const got = reconcileLlmGroups(items("a", "b", "c"), [group("Power", "a")]);
    expect(got.ungrouped).toEqual(["b", "c"]);
    expect(got.notes.join(" ")).toMatch(/2 implications were not placed/);
  });

  it("drops a group left empty after cleaning", () => {
    const got = reconcileLlmGroups(items("a"), [group("Real", "a"), group("Hollow", "ghost")]);
    expect(got.themes.map((t) => t.label)).toEqual(["Real"]);
    expect(got.notes.join(" ")).toMatch(/Dropped 1 group/);
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

  it("truncates an over-long label and summary", () => {
    const got = reconcileLlmGroups(items("a"), [
      { label: "x".repeat(200), summary: "y".repeat(500), member_ids: ["a"] },
    ]);
    expect(got.themes[0].label).toHaveLength(80);
    expect(got.themes[0].summary).toHaveLength(240);
  });

  // The guarantee the whole module exists for. An implication that silently disappears
  // between the board and the facilitator's screen is the one outcome that must be
  // impossible, whatever the model returns.
  it("PROPERTY: every candidate lands in exactly one bucket, and nothing else does", () => {
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
      const placed = [...got.themes.flatMap((t) => t.memberIds), ...got.ungrouped];
      // Exactly once, each.
      expect([...placed].sort()).toEqual(candidates.map((c) => c.id).sort());
      expect(new Set(placed).size).toBe(placed.length);
      // No group survives empty.
      expect(got.themes.every((t) => t.memberIds.length > 0)).toBe(true);
    }
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
