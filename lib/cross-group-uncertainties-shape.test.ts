import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildUncertaintyGrid } from "@/lib/cross-group-uncertainties-shape";
import type { PublicUncertainty, Scenario } from "@/lib/foresight/types";

// Fixtures from the real files rather than hand-written ones, for the same reason the field
// registry's tests use the real export: this module's job is to line up two payloads that
// share only a title string, and a fixture invented from the types would agree with the
// types instead of with the data.

interface SeedOutcome {
  code: string;
  role: string;
  title: string;
  description: string;
}
interface SeedUncertainty {
  number: number;
  id: string;
  title: string;
  question: string;
  outcomes: SeedOutcome[];
}

const seed = JSON.parse(readFileSync("data/uncertainties.seed.json", "utf8")) as {
  uncertainties: SeedUncertainty[];
};

// The project's 13 uncertainties, shaped as the platform's /uncertainties returns them. The
// fields this module never reads are filled with empty values rather than omitted, so the
// fixture is a real PublicUncertainty and not a convenient subset of one.
const CATALOGUE_13: PublicUncertainty[] = seed.uncertainties.map((u) => ({
  id: u.id,
  number: u.number,
  title: u.title,
  question: u.question,
  domain: "",
  attributes: [],
  sharpest: false,
  sourceDriverIds: [],
  linkedDrivers: [],
  outcomes: u.outcomes.map((o) => ({
    code: o.code,
    role: o.role,
    title: o.title,
    description: o.description,
    direction: "",
    alignment: "",
    narrative: "",
    strategicMove: "",
  })),
}));

const snapshot = JSON.parse(readFileSync("data/deck-reference.snapshot.json", "utf8")) as {
  scenarios: { id: string; title: string; linkedUncertainties: Scenario["linkedUncertainties"] }[];
};

const scenarioBySlug = (slug: string) => {
  const s = snapshot.scenarios.find((x) => x.id === slug)!;
  return { linkedUncertainties: s.linkedUncertainties ?? [] } as Scenario;
};

// The Living Floor's LIVE state, which the snapshot predates: five uncertainties linked in
// Lanscan with the outcome never chosen, so every resolution is the empty string. That is a
// real state this grid meets today, and it is why "linked" and "resolved" are not the same
// question.
const LIVING_FLOOR_LIVE = {
  linkedUncertainties: [
    { uncertaintyId: "u-1", title: "Public health's permission to act", resolution: "" },
    { uncertaintyId: "u-2", title: "AI infrastructure and access", resolution: "" },
    { uncertaintyId: "u-3", title: "Individual and movement power", resolution: "" },
    { uncertaintyId: "u-4", title: "Control of body data", resolution: "" },
    { uncertaintyId: "u-5", title: "Where trust lives", resolution: "" },
  ],
} as Scenario;

const FOUR = [
  { groupId: "g1", scenario: scenarioBySlug("the-public-works") },
  { groupId: "g2", scenario: scenarioBySlug("known-here-2") },
  { groupId: "g3", scenario: LIVING_FLOOR_LIVE },
  { groupId: "g4", scenario: scenarioBySlug("the-moving-public") },
];

describe("buildUncertaintyGrid", () => {
  it("keeps only uncertainties at least one scenario resolved", () => {
    const grid = buildUncertaintyGrid({ catalogue: CATALOGUE_13, scenarios: FOUR });
    expect(grid.rows.map((r) => r.title)).not.toContain("How health truth is established");
    expect(grid.rows).toHaveLength(9);
  });

  it("keeps the catalogue's own order", () => {
    const grid = buildUncertaintyGrid({ catalogue: CATALOGUE_13, scenarios: FOUR });
    const numbers = grid.rows.map(
      (r) => CATALOGUE_13.find((u) => u.title === r.title)!.number
    );
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
  });

  it("treats an empty-string resolution as unresolved", () => {
    const grid = buildUncertaintyGrid({ catalogue: CATALOGUE_13, scenarios: FOUR });
    expect(grid.rows.every((r) => r.cells.g3.resolution === null)).toBe(true);
    expect(grid.emptyGroups).toContain("g3");
    expect(grid.emptyGroups).not.toContain("g1");
  });

  it("marks a row where two or more groups landed on the same resolution", () => {
    const grid = buildUncertaintyGrid({ catalogue: CATALOGUE_13, scenarios: FOUR });
    // g2 and g4 both chose "Layered publics"; g1 chose "Shared civic public".
    expect(grid.rows.find((r) => r.title === "The shape of the public")!.agreed).toBe(true);
    // Only g1 took a position at all.
    expect(grid.rows.find((r) => r.title === "The model of prevention")!.agreed).toBe(false);
  });

  it("keeps a resolution whose title matches no catalogue row, flagged and last", () => {
    const scenarios = structuredClone(FOUR);
    scenarios[0].scenario!.linkedUncertainties.push({
      uncertaintyId: "u-x",
      title: "Something retired",
      resolution: "A position",
    });
    const grid = buildUncertaintyGrid({ catalogue: CATALOGUE_13, scenarios });
    const extra = grid.rows.find((r) => r.title === "Something retired")!;
    expect(extra.unmatched).toBe(true);
    expect(grid.rows.at(-1)).toBe(extra);
    expect(grid.rows.filter((r) => r.unmatched)).toHaveLength(1);
  });

  it("marks which option a resolution chose, and carries the unchosen ones", () => {
    const grid = buildUncertaintyGrid({ catalogue: CATALOGUE_13, scenarios: FOUR });
    const row = grid.rows.find((r) => r.title === "The shape of the public")!;
    expect(row.cells.g1.chosen).toBe("Shared civic public");
    expect(row.cells.g1.options).toHaveLength(4);
    // Unresolved cells still carry the options, so the row expands the same for every group.
    expect(row.cells.g3.chosen).toBeNull();
    expect(row.cells.g3.options).toHaveLength(4);
  });

  it("leaves chosen null when a resolution matches no option title", () => {
    const scenarios = structuredClone(FOUR);
    scenarios[0].scenario!.linkedUncertainties[0].resolution = "Something nobody offered";
    const grid = buildUncertaintyGrid({ catalogue: CATALOGUE_13, scenarios });
    const row = grid.rows.find((r) => r.title === "The shape of the public")!;
    expect(row.cells.g1.resolution).toBe("Something nobody offered");
    expect(row.cells.g1.chosen).toBeNull();
  });

  // Review Focus: the platform being unreachable is a null scenario, not a crash.
  it("renders an empty grid when no scenario could be loaded", () => {
    const grid = buildUncertaintyGrid({
      catalogue: CATALOGUE_13,
      scenarios: FOUR.map((s) => ({ groupId: s.groupId, scenario: null })),
    });
    expect(grid.rows).toEqual([]);
    expect(grid.emptyGroups).toHaveLength(4);
  });

  it("still shows every published resolution when the catalogue could not be loaded", () => {
    const grid = buildUncertaintyGrid({ catalogue: [], scenarios: FOUR });
    // No catalogue means no row to anchor to — but a position the groups published must not
    // vanish because the other half of the join failed to load, so each arrives as an
    // unmatched row instead.
    expect(grid.rows).toHaveLength(9);
    expect(grid.rows.every((r) => r.unmatched)).toBe(true);
  });
});
