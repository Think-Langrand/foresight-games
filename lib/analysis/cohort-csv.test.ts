import { describe, it, expect } from "vitest";
import { cohortCsvRows, COHORT_CSV_HEADER } from "./cohort-csv";
import type { CohortClusterResponse } from "./cohort-cluster-shape";

const run = (over: Partial<CohortClusterResponse> = {}): CohortClusterResponse => ({
  method: "embedding",
  criteria: null,
  promptOverride: null,
  context: "blind",
  minSimilarity: 0.1,
  bridging: false,
  week: { sort: 1, title: "Session 2" },
  groups: [
    { id: "g1", name: "Group One", color: null, scenarioTitle: "Thin Ice", itemCount: 2, state: "ok" },
    { id: "g2", name: "Group Two", color: null, scenarioTitle: "Thin Ice", itemCount: 1, state: "ok" },
  ],
  themes: [
    {
      label: "Responsibility moves outward",
      summary: "Who answers for what shifts.",
      memberIds: ["a", "b"],
      cohesion: 0.42,
      byGroup: [
        { groupId: "g1", count: 1 },
        { groupId: "g2", count: 1 },
      ],
      groupCount: 2,
    },
  ],
  ungrouped: ["c"],
  nearDuplicates: [{ aId: "a", bId: "b", similarity: 0.91 }],
  narrative: null,
  items: [
    { id: "a", text: "Councils answer for outcomes they cannot fund", keyChange: "KC1", groupId: "g1" },
    { id: "b", text: "Funding decisions move further from delivery", keyChange: "KC2", groupId: "g2" },
    { id: "c", text: "An orphan thought", keyChange: "KC3", groupId: "g1" },
  ],
  model: "test-model",
  generatedAt: "2026-10-15T00:00:00.000Z",
  elapsedMs: 1234,
  notes: [],
  ...over,
});

describe("cohortCsvRows", () => {
  it("writes one row per implication in a theme, carrying the group it came from", () => {
    const rows = cohortCsvRows(run());
    expect(rows[0]).toEqual([
      "Responsibility moves outward",
      "Who answers for what shifts.",
      "2",
      "Group One (1); Group Two (1)",
      "0.42",
      "Councils answer for outcomes they cannot fund",
      "Group One",
      "KC1",
    ]);
    expect(rows[1][6]).toBe("Group Two");
  });

  it("keeps the outliers in the same sheet rather than dropping them", () => {
    // A quietly dropped implication is the failure mode worth designing against, and an
    // export is where it would go unnoticed longest.
    const rows = cohortCsvRows(run());
    const outlier = rows.find((r) => r[5] === "An orphan thought");
    expect(outlier).toBeDefined();
    expect(outlier![0]).toBe("— no theme —");
    expect(outlier![6]).toBe("Group One");
  });

  it("covers every implication exactly once across themes and outliers", () => {
    const r = run();
    const rows = cohortCsvRows(r);
    expect(rows).toHaveLength(r.themes[0].memberIds.length + r.ungrouped.length);
  });

  it("repeats an implication that sits in two themes, once under each", () => {
    const r = run({
      themes: [
        {
          label: "T1", summary: null, memberIds: ["a"], cohesion: null,
          byGroup: [{ groupId: "g1", count: 1 }], groupCount: 1,
        },
        {
          label: "T2", summary: null, memberIds: ["a"], cohesion: null,
          byGroup: [{ groupId: "g1", count: 1 }], groupCount: 1,
        },
      ],
      ungrouped: [],
    });
    const rows = cohortCsvRows(r);
    expect(rows.filter((x) => x[5] === "Councils answer for outcomes they cannot fund")).toHaveLength(2);
    expect(rows.map((x) => x[0])).toEqual(["T1", "T2"]);
  });

  it("falls back to the id when an item somehow is not in the run's own item list", () => {
    const rows = cohortCsvRows(run({ ungrouped: ["nope"] }));
    const row = rows.find((x) => x[5] === "nope");
    expect(row).toBeDefined();
    expect(row![6]).toBe("");
  });

  it("has a header with a column for every cell it writes", () => {
    for (const row of cohortCsvRows(run())) {
      expect(row).toHaveLength(COHORT_CSV_HEADER.length);
    }
  });
});
