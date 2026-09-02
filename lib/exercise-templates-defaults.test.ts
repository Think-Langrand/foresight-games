import { describe, it, expect } from "vitest";
import { fromRow, defaultTemplateSeeds } from "./exercise-templates-defaults";
import { getExerciseType } from "./exercise-types";

describe("exercise-templates-defaults", () => {
  it("fromRow maps snake_case row and coerces bad sections to []", () => {
    const t = fromRow({
      id: "abc",
      slug: null,
      name: "My Template",
      description: null,
      type: "worksheet",
      sections: "not-an-array", // bad jsonb → resolveSections returns []
      sort: 3,
      created_at: "2026-09-02T00:00:00Z",
    });
    expect(t.id).toBe("abc");
    expect(t.slug).toBeNull();
    expect(t.name).toBe("My Template");
    expect(t.description).toBe(""); // null → ""
    expect(t.type).toBe("worksheet");
    expect(t.sections).toEqual([]);
    expect(t.sort).toBe(3);
    expect(t.createdTime).toBe("2026-09-02T00:00:00Z");
  });

  it("fromRow passes through valid sections via resolveSections", () => {
    const t = fromRow({
      id: "x",
      slug: "s",
      name: "n",
      description: "d",
      type: "worksheet",
      sections: [{ key: "k1", kind: "question", label: "Q?" }],
      sort: 0,
      created_at: "2026-09-02T00:00:00Z",
    });
    expect(t.sections).toEqual([{ key: "k1", kind: "question", label: "Q?" }]);
  });

  it("defaultTemplateSeeds has the three built-ins with stable slugs", () => {
    const slugs = defaultTemplateSeeds().map((s) => s.slug);
    expect(slugs).toEqual(["scenario-assessment", "implications", "blank-worksheet"]);
  });

  it("scenario-assessment seed carries the code registry's sections and is a worksheet", () => {
    const seed = defaultTemplateSeeds().find((s) => s.slug === "scenario-assessment")!;
    expect(seed.type).toBe("worksheet");
    expect(seed.sections).toEqual(getExerciseType("scenario-assessment")?.sections ?? []);
    expect(seed.sections.length).toBeGreaterThan(0);
  });

  it("implications seed is the implications type with no blocks", () => {
    const seed = defaultTemplateSeeds().find((s) => s.slug === "implications")!;
    expect(seed.type).toBe("implications");
    expect(seed.sections).toEqual([]);
  });
});
