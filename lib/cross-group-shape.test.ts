import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { columnsFor, listCrossGroupFields, unknownWeeks } from "@/lib/cross-group-shape";
import { COMMITMENTS_KEY_VISION } from "@/lib/exercise-types";
import type { ProjectExport } from "@/lib/cohort-export-shape";
import type {
  CommitmentsExercise,
  ImplicationsExercise,
} from "@/components/design-groups/AnswerPanels";

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

describe("columnsFor — Sessions 3 and 4", () => {
  it("reads bold moves from directions, not from the legacy boldMoves field", () => {
    const cols = columnsFor(FIXTURE, "3:bold-moves");
    expect(cols[0].cells.map((c) => c.text)).toContain("PH works entirely on upstream issues");
  });

  it("tags each risk with the theme it hangs off", () => {
    const cols = columnsFor(FIXTURE, "2:risks");
    const found = cols[0].cells.find((c) => c.text.startsWith("PH funding comes from one source"))!;
    expect(found.tag).toBe(
      "Predictable funding enables long-term  investment but new competition for resources"
    );
  });

  it("tags a response with its parent outcome", () => {
    const cols = columnsFor(FIXTURE, "3:responses");
    const found = cols[0].cells.find((c) => c.text.startsWith("Allocated funding includes enough"))!;
    expect(found.tag).toBe(
      "Robust engagement is an integrated expectation of any PH planning process"
    );
  });

  it("notes a priority's confirmed/suggested status", () => {
    expect(columnsFor(FIXTURE, "3:priorities")[0].cells[0].note).toBe("confirmed");
  });

  it("marks a hope or fear as which it is", () => {
    const kinds = new Set(columnsFor(FIXTURE, "2:hopes-fears")[0].cells.map((c) => c.note));
    expect(kinds).toEqual(new Set(["hope", "fear"]));
  });

  it("returns a column for every group in sort order, including empty ones", () => {
    const cols = columnsFor(FIXTURE, "3:bold-moves");
    expect(cols).toHaveLength(4);
    expect(cols.map((c) => c.groupName)).toEqual(FIXTURE.groups.map((g) => g.groupName));
  });

  // Review Focus: a gap week must not read as "they wrote nothing".
  it("distinguishes a missing week from an empty one", () => {
    const gap = structuredClone(FIXTURE);
    gap.groups[1].weeks[3] = { ...gap.groups[1].weeks[3], exerciseId: null, answers: null };
    const cols = columnsFor(gap, "3:bold-moves");
    expect(cols[1].state).toBe("no-week");
    expect(cols[0].state).toBe("ok");
  });

  it("calls a week that exists with no board no-board, not no-week", () => {
    const boardless = structuredClone(FIXTURE);
    boardless.groups[2].weeks[3] = { ...boardless.groups[2].weeks[3], answers: null };
    expect(columnsFor(boardless, "3:bold-moves")[2].state).toBe("no-board");
  });
});

describe("columnsFor — Sessions 1 and 2", () => {
  it("answers an authored worksheet question by its section key", () => {
    // Session 1's keys as the fixture carries them: `reactions`, `six-changes`, and
    // generated `sec_<hash>` keys for sections an admin added later.
    expect(columnsFor(FIXTURE, "0:q:reactions")[0].cells).toHaveLength(9);
    expect(columnsFor(FIXTURE, "0:q:six-changes")[0].cells).toHaveLength(6);
  });

  it("handles a generated section key as readily as a named one", () => {
    // An admin-added section's label is its only human-readable name, which is why the
    // chip label comes from the label and the field id never does.
    expect(columnsFor(FIXTURE, "0:q:sec_cf8bc585")[0].cells.length).toBeGreaterThan(0);
  });

  it("flattens Session 2's map in tree-walk order, parents before children", () => {
    const cells = columnsFor(FIXTURE, "1:map")[0].cells;
    expect(cells).toHaveLength(152);
    const pos = new Map(cells.map((c, i) => [c.id, i]));
    for (const c of cells) {
      if (!c.tag) continue;
      const parent = cells.find((p) => p.text === c.tag)!;
      expect(pos.get(parent.id)!).toBeLessThan(pos.get(c.id)!);
    }
  });

  it("tags a map card with its parent's words and leaves roots untagged", () => {
    const cells = columnsFor(FIXTURE, "1:map")[0].cells;
    expect(cells[0].tag).toBeNull();
    expect(cells.some((c) => c.tag !== null)).toBe(true);
  });

  it("drops a map card whose parent is gone, as no other view draws it", () => {
    const orphaned = structuredClone(FIXTURE);
    const week = orphaned.groups[0].weeks[1].answers as ImplicationsExercise;
    week.cards = [...week.cards, { ...week.cards[1], id: "ghost", parentId: "nobody" }];
    expect(columnsFor(orphaned, "1:map")[0].cells.map((c) => c.id)).not.toContain("ghost");
  });

  it("reads Session 3's clustered implications separately from Session 2's own cards", () => {
    const clustered = columnsFor(FIXTURE, "2:implications")[0].cells;
    const own = columnsFor(FIXTURE, "1:map")[0].cells;
    expect(clustered).toHaveLength(146);
    expect(own).toHaveLength(152);
  });
});
