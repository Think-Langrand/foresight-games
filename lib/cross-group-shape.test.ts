import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { listCrossGroupFields, unknownWeeks } from "@/lib/cross-group-shape";
import { COMMITMENTS_KEY_VISION } from "@/lib/exercise-types";
import type { ProjectExport } from "@/lib/cohort-export-shape";
import type { CommitmentsExercise } from "@/components/design-groups/AnswerPanels";

// The real four-group Public Health export, exactly as the admin "All groups · JSON" button
// produced it. Using the real thing rather than a hand-built fixture is deliberate: this
// module's whole job is to find fields in boards people actually filled in, and a fixture
// written from the types would agree with the types rather than with the data. Counts
// asserted below were read off this file.
const FIXTURE = JSON.parse(
  readFileSync("data/all-groups-public-health-2026-10-30.json", "utf8")
) as ProjectExport;

describe("listCrossGroupFields", () => {
  it("lists one chip per structural field per week", () => {
    const ids = listCrossGroupFields(FIXTURE).map((f) => f.id);
    expect(ids).toContain("3:vision");
    expect(ids).toContain("3:bold-moves");
    expect(ids).toContain("2:risks");
    expect(ids).toContain("1:map");
  });

  it("counts cells per group on the chip", () => {
    const moves = listCrossGroupFields(FIXTURE).find((f) => f.id === "3:bold-moves")!;
    // directions[], not boldMoves[]: 3 / 2 / 1 / 1 across the four groups. boldMoves is
    // looseResponses.filter(shortlisted), which is empty on every current board — a chip
    // built from it would report that the groups did no work.
    expect(Object.values(moves.counts).sort((a, b) => b - a)).toEqual([3, 2, 1, 1]);
  });

  it("puts the spec's primary fields before the overflow ones", () => {
    const fields = listCrossGroupFields(FIXTURE);
    const tiers = fields.map((f) => f.tier);
    // Every primary chip comes before every overflow one.
    expect(tiers.lastIndexOf("primary")).toBeLessThan(tiers.indexOf("overflow"));
    expect(fields.find((f) => f.fieldKey === "map")!.tier).toBe("overflow");
    expect(fields.find((f) => f.fieldKey === "bold-moves")!.tier).toBe("primary");
  });

  it("addresses vision by key, not by label", () => {
    const renamed = structuredClone(FIXTURE);
    for (const g of renamed.groups) {
      const q = (g.weeks[3].answers as CommitmentsExercise).questions.find(
        (x) => x.key === COMMITMENTS_KEY_VISION
      )!;
      q.label = "What we are aiming for";
    }
    expect(listCrossGroupFields(renamed).map((f) => f.id)).toContain("3:vision");
  });

  it("disambiguates two weeks that offer the same field", () => {
    const twice = structuredClone(FIXTURE);
    twice.weeks.push({ sort: 4, title: "Session 5 · Synthesis again", type: "synthesis" });
    for (const g of twice.groups) {
      g.weeks.push({ ...g.weeks[2], weekSort: 4, weekTitle: "Session 5 · Synthesis again" });
    }
    const risks = listCrossGroupFields(twice).filter((f) => f.fieldKey === "risks");
    expect(risks).toHaveLength(2);
    expect(new Set(risks.map((f) => f.label)).size).toBe(2);
  });

  // Review Focus: a week whose type the registry does not know.
  it("reports a week whose type it does not know instead of dropping it", () => {
    const odd = structuredClone(FIXTURE);
    odd.groups[0].weeks[0].type = "tarot-reading";
    odd.groups[0].weeks[0].answers = { kind: "placeholder", exerciseId: "x", title: "?" };
    expect(unknownWeeks(odd)).toEqual([{ weekSort: 0, type: "tarot-reading" }]);
  });
});
