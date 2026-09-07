import { describe, it, expect } from "vitest";
import { toProgramDTO, weekEditIsDestructive, programVersion } from "./design-program-shape";
import { getExerciseType } from "./exercise-types";
import type { DesignGroup } from "./design-groups";
import type { DesignGroupExercise } from "./design-group-exercises";

function group(over: Partial<DesignGroup> & { id: string; sort: number }): DesignGroup {
  return {
    projectId: "proj",
    name: over.id,
    color: null,
    scenarioRef: "sc",
    scenarioSetId: null,
    scenarioTitle: "Scenario",
    createdTime: "2026-01-01T00:00:00Z",
    ...over,
  };
}

let seq = 0;
function ex(
  groupId: string,
  sort: number,
  type: string,
  title: string,
  sessionCode: string | null
): DesignGroupExercise {
  seq += 1;
  return {
    id: `${groupId}-${sort}-${seq}`,
    groupId,
    sort,
    title,
    type,
    sessionCode,
    locked: false,
    opensAt: null,
    sections: [],
    createdTime: `2026-01-01T00:00:0${seq}Z`,
  };
}

describe("toProgramDTO", () => {
  // Mirrors the real dev data for public-health: "The Useful Life" has a messy program
  // (duplicate sort=3, a stray scenario-assessment at index 1), "Public works" is clean.
  it("folds already-divergent groups into one canonical program (cleaner group wins)", () => {
    const a = group({ id: "useful", sort: 0 });
    const b = group({ id: "works", sort: 1 });

    // Pre-ordered the way listExercises returns them (sort, then created_at).
    const aRows = [
      ex("useful", 0, "scenario-assessment", "Week 1 · Scenario Assessment", "K4W2"),
      ex("useful", 2, "scenario-assessment", "Week 3 · TBD", "9SH2"),
      ex("useful", 3, "placeholder", "Week 4 · Synthesis (TBD)", null),
      ex("useful", 3, "implications", "Implication Mapping", "5588"),
    ];
    const bRows = [
      ex("works", 0, "scenario-assessment", "Week 1 · Scenario Assessment", "7V7Y"),
      ex("works", 1, "implications", "Week 2 · Implication Mapping", "28RF"),
      ex("works", 2, "worksheet", "Week 3 · TBD", "9WJR"),
      ex("works", 3, "placeholder", "Week 4 · Synthesis (TBD)", null),
    ];

    const cards = new Map<string, number>([["7V7Y", 5]]);
    const dto = toProgramDTO(
      [b, a], // pass out of order to prove group sort ordering
      { useful: aRows, works: bRows },
      cards
    );

    // Four weeks; canonical content comes from the cleaner group ("works").
    expect(dto.weeks.map((w) => w.type)).toEqual([
      "scenario-assessment",
      "implications",
      "worksheet",
      "placeholder",
    ]);
    expect(dto.divergent).toBe(true);

    // Every week maps BOTH groups' row ids — the board-safe slots for the fan-out.
    for (const w of dto.weeks) {
      expect(Object.keys(w.slots).sort()).toEqual(["useful", "works"]);
    }
    // Week 1's slots pair each group's index-1 row (semantically different, hence divergent).
    expect(dto.weeks[1].slots.works).toBe(bRows[1].id);
    expect(dto.weeks[1].slots.useful).toBe(aRows[1].id);

    // Card counts key off the UPPERCASED session code.
    expect(dto.weeks[0].cardsByGroup.works).toBe(5);
    expect(dto.weeks[0].cardsByGroup.useful).toBe(0);
    expect(dto.weeks[3].sessionByGroup.works).toBeNull();

    // Groups come back sorted by their sort field.
    expect(dto.groups.map((g) => g.id)).toEqual(["useful", "works"]);
  });

  it("reports lockstep groups as not divergent", () => {
    const a = group({ id: "a", sort: 0 });
    const b = group({ id: "b", sort: 1 });
    const rows = (gid: string) => [
      ex(gid, 0, "scenario-assessment", "Week 1", `${gid}1`),
      ex(gid, 1, "implications", "Week 2", `${gid}2`),
    ];
    const dto = toProgramDTO([a, b], { a: rows("a"), b: rows("b") }, new Map());
    expect(dto.divergent).toBe(false);
    expect(dto.weeks).toHaveLength(2);
    expect(dto.weeks[0].slots).toEqual({ a: expect.any(String), b: expect.any(String) });
  });

  it("flags divergence and keeps sparse slots when a group has fewer weeks", () => {
    const a = group({ id: "a", sort: 0 });
    const b = group({ id: "b", sort: 1 });
    const dto = toProgramDTO(
      [a, b],
      {
        a: [
          ex("a", 0, "scenario-assessment", "Week 1", "a1"),
          ex("a", 1, "implications", "Week 2", "a2"),
        ],
        b: [ex("b", 0, "scenario-assessment", "Week 1", "b1")],
      },
      new Map()
    );
    expect(dto.divergent).toBe(true);
    expect(dto.weeks).toHaveLength(2);
    // The short group only appears in week 0's slots; week 1 has just the long group.
    expect(Object.keys(dto.weeks[0].slots).sort()).toEqual(["a", "b"]);
    expect(Object.keys(dto.weeks[1].slots)).toEqual(["a"]);
  });

  it("flags divergence on schedule/lock/keys, not just type/title", () => {
    const a = group({ id: "a", sort: 0 });
    const b = group({ id: "b", sort: 1 });
    const base = () => ex("x", 0, "worksheet", "W1", null);
    // identical except opensAt → not in lockstep → divergent
    const dto = toProgramDTO(
      [a, b],
      { a: [{ ...base(), groupId: "a", opensAt: "2026-01-01T00:00:00Z" }], b: [{ ...base(), groupId: "b", opensAt: null }] },
      new Map()
    );
    expect(dto.divergent).toBe(true);
    // fully identical schedule → in sync
    const dto2 = toProgramDTO(
      [a, b],
      { a: [{ ...base(), groupId: "a" }], b: [{ ...base(), groupId: "b" }] },
      new Map()
    );
    expect(dto2.divergent).toBe(false);

    // same question key but different label/text → a save would overwrite → divergent
    const q = (key: string, label: string) => ({ key, kind: "question" as const, label });
    const dto3 = toProgramDTO(
      [a, b],
      {
        a: [{ ...base(), groupId: "a", sections: [q("k", "Foo")] }],
        b: [{ ...base(), groupId: "b", sections: [q("k", "Bar")] }],
      },
      new Map()
    );
    expect(dto3.divergent).toBe(true);
  });
});

describe("programVersion (optimistic concurrency token)", () => {
  it("is stable for identical rows and changes when a fanned-out field changes", () => {
    const a = group({ id: "a", sort: 0 });
    const rows = [ex("a", 0, "worksheet", "W1", "a1"), ex("a", 1, "implications", "W2", "a2")];
    const v1 = programVersion([a], { a: rows });
    expect(programVersion([a], { a: rows })).toBe(v1); // deterministic

    const retitled = rows.map((r, i) => (i === 0 ? { ...r, title: "W1 changed" } : r));
    expect(programVersion([a], { a: retitled })).not.toBe(v1);

    const resorted = rows.map((r, i) => ({ ...r, sort: rows.length - 1 - i }));
    expect(programVersion([a], { a: resorted })).not.toBe(v1);

    const relocked = rows.map((r, i) => (i === 0 ? { ...r, locked: true } : r));
    expect(programVersion([a], { a: relocked })).not.toBe(v1);
  });

  it("ignores the order groups are passed in (sorts internally)", () => {
    const a = group({ id: "a", sort: 0 });
    const b = group({ id: "b", sort: 1 });
    const byGroup = { a: [ex("a", 0, "worksheet", "W1", "a1")], b: [ex("b", 0, "worksheet", "W1", "b1")] };
    expect(programVersion([a, b], byGroup)).toBe(programVersion([b, a], byGroup));
  });

  it("uses field delimiters so adjacent values can't collide", () => {
    const g = group({ id: "g", sort: 0 });
    const base = ex("g", 0, "x", "y", null); // shared id so only the field boundary differs
    const rowA = { ...base, type: "ab", title: "" };
    const rowB = { ...base, type: "a", title: "b" };
    expect(programVersion([g], { g: [rowA] })).not.toBe(programVersion([g], { g: [rowB] }));
  });
});

describe("weekEditIsDestructive (started-week guard)", () => {
  const q = (key: string, label: string) => ({ key, kind: "question" as const, label });

  it("is destructive when the type changes", () => {
    const row = { type: "scenario-assessment", sections: [] };
    expect(weekEditIsDestructive(row, { type: "implications", sections: [] })).toBe(true);
  });

  it("is destructive when an existing question key is removed or changed", () => {
    const row = { type: "worksheet", sections: [q("a", "Q1"), q("b", "Q2")] };
    expect(weekEditIsDestructive(row, { type: "worksheet", sections: [q("a", "Q1")] })).toBe(true); // b removed
    expect(weekEditIsDestructive(row, { type: "worksheet", sections: [q("a", "Q1"), q("c", "Q2")] })).toBe(true); // b's key changed
  });

  it("is NOT destructive for benign edits that keep every existing key", () => {
    const row = { type: "worksheet", sections: [q("a", "Q1"), q("b", "Q2")] };
    // relabel (key kept)
    expect(weekEditIsDestructive(row, { type: "worksheet", sections: [q("a", "Q1 reworded"), q("b", "Q2")] })).toBe(false);
    // add a question
    expect(weekEditIsDestructive(row, { type: "worksheet", sections: [q("a", "Q1"), q("b", "Q2"), q("c", "Q3")] })).toBe(false);
    // reorder
    expect(weekEditIsDestructive(row, { type: "worksheet", sections: [q("b", "Q2"), q("a", "Q1")] })).toBe(false);
  });

  it("tolerates junk/undefined sections without false positives", () => {
    expect(weekEditIsDestructive({ type: "worksheet", sections: undefined }, { type: "worksheet", sections: [] })).toBe(false);
    expect(weekEditIsDestructive({ type: "worksheet", sections: null }, { type: "worksheet", sections: "garbage" })).toBe(false);
  });

  it("resolves template-fallback sections so a []-snapshot started week is still guarded", () => {
    const tmpl = getExerciseType("scenario-assessment")!.sections!;
    expect(tmpl.length).toBeGreaterThan(0);
    // sections=[] means "fall back to the type template" — its keys are what answers are tagged with.
    const current = { type: "scenario-assessment", sections: [] };
    // dropping a template question orphans its answers → destructive
    expect(weekEditIsDestructive(current, { type: "scenario-assessment", sections: tmpl.slice(1) })).toBe(true);
    // relabelling every template question keeps all keys → safe
    const relabelled = tmpl.map((s) => ({ ...s, label: `${s.label} (edited)` }));
    expect(weekEditIsDestructive(current, { type: "scenario-assessment", sections: relabelled })).toBe(false);
  });
});
