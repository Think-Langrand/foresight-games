import { describe, it, expect } from "vitest";
import {
  THEME_IDEA_LIMITS,
  appendThemeIdeas,
  coerceThemeIdeas,
  ideaProvenance,
  normalizeIdeaName,
  removeThemeIdea,
  type ThemeIdea,
} from "./theme-ideas-shape";

const idea = (name: string, over: Partial<ThemeIdea> = {}): ThemeIdea => ({
  id: `id-${name}`,
  name,
  method: "embedding",
  savedAt: "2026-10-16T00:00:00.000Z",
  ...over,
});

describe("normalizeIdeaName", () => {
  it("ignores case, edge space and run-together whitespace", () => {
    expect(normalizeIdeaName("  Trust   moves\nOUTWARD ")).toBe("trust moves outward");
  });

  it("survives nothing at all", () => {
    expect(normalizeIdeaName("")).toBe("");
    expect(normalizeIdeaName("   ")).toBe("");
  });
});

describe("coerceThemeIdeas", () => {
  it("keeps a well-formed list as it is", () => {
    const list = [idea("Trust moves outward"), idea("Verification gatekeeps", { method: "llm" })];
    expect(coerceThemeIdeas(list)).toEqual(list);
  });

  it("reads anything that is not a list as nothing saved", () => {
    // The config blob is free-form JSON written by more than one route, so this has to
    // survive whatever is actually in the column.
    for (const junk of [undefined, null, {}, "themes", 7, [[]], [null]]) {
      expect(coerceThemeIdeas(junk)).toEqual([]);
    }
  });

  it("drops an entry with no usable name", () => {
    expect(coerceThemeIdeas([idea(""), idea("   "), idea("Real one")])).toEqual([
      idea("Real one"),
    ]);
  });

  it("drops an entry whose method is not one we know", () => {
    // The provenance line is derived from `method`, so an unrecognised value would either
    // throw off the sentence or have to be guessed at. Dropping is honest.
    const bad = { ...idea("Mystery"), method: "vibes" };
    expect(coerceThemeIdeas([bad, idea("Known")])).toEqual([idea("Known")]);
  });

  it("drops an entry with no id, because the ✕ would have nothing to remove", () => {
    const noId = { ...idea("Nameless"), id: "" };
    expect(coerceThemeIdeas([noId])).toEqual([]);
  });

  it("clamps a name past the cap", () => {
    const long = "x".repeat(THEME_IDEA_LIMITS.name + 50);
    const [out] = coerceThemeIdeas([idea(long)]);
    expect(out.name).toHaveLength(THEME_IDEA_LIMITS.name);
  });

  it("keeps the earliest of two names that differ only in case or spacing", () => {
    const first = idea("Trust moves outward", { id: "a", savedAt: "2026-10-16T00:00:00.000Z" });
    const later = idea("  trust   MOVES outward ", { id: "b", savedAt: "2026-10-16T01:00:00.000Z" });
    expect(coerceThemeIdeas([first, later]).map((i) => i.id)).toEqual(["a"]);
  });

  it("never returns more than the cap", () => {
    const many = Array.from({ length: THEME_IDEA_LIMITS.count + 8 }, (_, i) => idea(`n${i}`));
    expect(coerceThemeIdeas(many)).toHaveLength(THEME_IDEA_LIMITS.count);
  });
});

describe("appendThemeIdeas", () => {
  it("adds to what is already saved rather than replacing it", () => {
    // The whole reason the route takes a delta: a facilitator saving from a second run on a
    // client that has not yet heard about the first must not wipe the first.
    const got = appendThemeIdeas([idea("One")], [idea("Two")]);
    expect(got.ideas.map((i) => i.name)).toEqual(["One", "Two"]);
    expect(got.added).toBe(1);
  });

  it("counts a name already saved as a duplicate and leaves the saved one alone", () => {
    const existing = [idea("Trust moves outward", { id: "first" })];
    const got = appendThemeIdeas(existing, [idea("TRUST MOVES OUTWARD", { id: "second" })]);
    expect(got.ideas.map((i) => i.id)).toEqual(["first"]);
    expect(got.added).toBe(0);
    expect(got.duplicates).toBe(1);
  });

  it("de-duplicates within one save as well as against the saved list", () => {
    const got = appendThemeIdeas([], [idea("Same", { id: "a" }), idea("same", { id: "b" })]);
    expect(got.ideas.map((i) => i.id)).toEqual(["a"]);
    expect(got.duplicates).toBe(1);
  });

  it("reports overflow rather than silently dropping the tail", () => {
    const existing = Array.from({ length: THEME_IDEA_LIMITS.count }, (_, i) => idea(`have${i}`));
    const got = appendThemeIdeas(existing, [idea("one too many")]);
    expect(got.overflow).toBe(1);
    expect(got.ideas).toHaveLength(THEME_IDEA_LIMITS.count);
  });

  it("is idempotent, so a double-click or a retry costs nothing", () => {
    const once = appendThemeIdeas([], [idea("Trust moves outward")]);
    const twice = appendThemeIdeas(once.ideas, [idea("Trust moves outward", { id: "other" })]);
    expect(twice.ideas).toEqual(once.ideas);
    expect(twice.added).toBe(0);
  });
});

describe("removeThemeIdea", () => {
  it("removes the one asked for", () => {
    const list = [idea("A", { id: "a" }), idea("B", { id: "b" })];
    expect(removeThemeIdea(list, "a").map((i) => i.id)).toEqual(["b"]);
  });

  it("treats a missing id as already done", () => {
    // A retry after a timeout must not raise an error for work that already landed.
    const list = [idea("A", { id: "a" })];
    expect(removeThemeIdea(list, "gone")).toEqual(list);
  });
});

describe("ideaProvenance", () => {
  it("says the model did the grouping when every saved name came from it", () => {
    expect(ideaProvenance([idea("A", { method: "llm" }), idea("B", { method: "llm" })])).toBe(
      "A model read every implication and grouped them."
    );
  });

  it("says a model only NAMED the groups when they came from similarity", () => {
    // The trap of the embedding method is that criteria steer the names and not the
    // grouping. The sentence has to carry that or it misleads.
    expect(ideaProvenance([idea("A")])).toBe(
      "Grouped by similar wording; a model only named them."
    );
  });

  it("covers both without tagging each name", () => {
    expect(ideaProvenance([idea("A"), idea("B", { method: "llm" })])).toBe(
      "Grouped by wording, or by a model reading all of them."
    );
  });

  it("says nothing when nothing is saved", () => {
    expect(ideaProvenance([])).toBe("");
  });
});
