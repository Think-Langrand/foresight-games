import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  columnsFor,
  crossGroupWarnings,
  listCrossGroupFields,
  notShownCounts,
  unknownWeeks,
} from "@/lib/cross-group-shape";
import { COMMITMENTS_KEY_VISION } from "@/lib/exercise-types";
import type { ProjectExport } from "@/lib/cohort-export-shape";
import type {
  CommitmentsExercise,
  ImplicationsExercise,
  SynthesisExercise,
  WorksheetExercise,
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

describe("a project the board cannot compare", () => {
  // Review Focus: a project with no design groups at all.
  it("returns no fields and no columns for a project with no groups", () => {
    const empty = { ...FIXTURE, groups: [] };
    expect(listCrossGroupFields(empty)).toEqual([]);
    expect(columnsFor(empty, "3:bold-moves")).toEqual([]);
  });

  // Review Focus: week alignment is positional, so a divergent program may be lining up two
  // different sessions. The export reports it rather than resolving it, and so must we.
  it("reports a divergent program so the page can warn before comparing", () => {
    expect(crossGroupWarnings({ ...FIXTURE, programDivergent: true })).toContain(
      "programDivergent"
    );
    expect(crossGroupWarnings(FIXTURE)).toEqual([]);
  });

  it("reports an unknown week type alongside a divergent program", () => {
    const odd = structuredClone(FIXTURE);
    odd.programDivergent = true;
    odd.groups[0].weeks[0].type = "tarot-reading";
    expect(crossGroupWarnings(odd)).toEqual(["programDivergent", "unknownWeek:0"]);
  });
});

describe("notShownCounts", () => {
  // The spec's first anti-goal applies to what this board does NOT show as much as to what
  // it does: material the shapes deliberately preserve but no chip reaches must be counted
  // and named, never silently absent.
  it("counts the material no chip reaches, per group", () => {
    const counts = notShownCounts(FIXTURE);
    const g1 = counts[FIXTURE.groups[0].groupId];
    expect(Object.keys(g1).sort()).toEqual([
      "chain",
      "looseResponses",
      "orphans",
      "parked",
      "strandedMilestones",
      "strayOutcomes",
      "unclustered",
    ]);
    expect(Object.values(g1).every((n) => Number.isInteger(n) && n >= 0)).toBe(true);
  });

  it("has an entry for every group", () => {
    const counts = notShownCounts(FIXTURE);
    expect(Object.keys(counts).sort()).toEqual(FIXTURE.groups.map((g) => g.groupId).sort());
  });

  it("actually counts a parked card rather than reporting zero", () => {
    const parked = structuredClone(FIXTURE);
    const synthesis = parked.groups[0].weeks[2].answers as SynthesisExercise;
    synthesis.parked = [
      ...synthesis.parked,
      { id: "p1", text: "set aside", author: "", createdAt: "" },
    ];
    const before = notShownCounts(FIXTURE)[FIXTURE.groups[0].groupId].parked;
    expect(notShownCounts(parked)[parked.groups[0].groupId].parked).toBe(before + 1);
  });
});

// --- review fixes -----------------------------------------------------------------------
// Each of these reproduces a defect a fresh reviewer found on the finished branch.

describe("a week only some groups have started", () => {
  const PLACEHOLDER = { kind: "placeholder", exerciseId: "x", title: "Session 4" } as const;

  it("keeps a week's fields when the FIRST group has no board yet", () => {
    // The lowest-sorted group's Session 4 row exists but was never opened, so it shapes to a
    // placeholder, while three other groups finished theirs. Resolving the week's fields
    // from the first non-null answers took every structural chip down with it.
    const half = structuredClone(FIXTURE);
    half.groups[0].weeks[3] = {
      ...half.groups[0].weeks[3],
      sessionCode: null,
      answers: { ...PLACEHOLDER },
    };
    const ids = listCrossGroupFields(half).map((f) => f.id);
    expect(ids).toContain("3:bold-moves");
    expect(ids).toContain("3:vision");
    expect(ids).toContain("3:priorities");
  });

  it("warns rather than deleting a week where NO group has a board yet", () => {
    const none = structuredClone(FIXTURE);
    for (const g of none.groups) {
      g.weeks[3] = { ...g.weeks[3], sessionCode: null, answers: { ...PLACEHOLDER } };
    }
    expect(crossGroupWarnings(none)).toContain("noBoards:3");
  });

  it("calls a started-but-unopened week no-board, not 'nothing written'", () => {
    // The loader never emits `answers: null` for a row that exists — it shapes a
    // placeholder. So the real no-board case has to be read off that, or a group that never
    // opened its board reads as a group that wrote nothing.
    const unopened = structuredClone(FIXTURE);
    unopened.groups[1].weeks[3] = {
      ...unopened.groups[1].weeks[3],
      sessionCode: null,
      answers: { ...PLACEHOLDER },
    };
    expect(columnsFor(unopened, "3:bold-moves")[1].state).toBe("no-board");
    expect(columnsFor(unopened, "3:bold-moves")[0].state).toBe("ok");
  });
});

describe("unknownWeeks reads the exercise type registry", () => {
  it("does not flag scenario-assessment, a registered type", () => {
    // `scenario-assessment` is a real registered type id whose RENDER is `worksheet`. The
    // Oct 30 export happens to record `worksheet` as its week type, so it cannot reproduce
    // this on its own — but the LIVE project carries the id, and comparing ids against
    // render names printed a false "type this board does not know" banner there, in the
    // same slot as the one warning on this page that is load-bearing.
    const live = structuredClone(FIXTURE);
    live.groups[0].weeks[0].type = "scenario-assessment";
    expect(unknownWeeks(live)).toEqual([]);
    expect(crossGroupWarnings(live)).toEqual([]);
  });

  it("still flags a type that is in no registry", () => {
    const odd = structuredClone(FIXTURE);
    odd.groups[0].weeks[0].type = "tarot-reading";
    expect(unknownWeeks(odd)).toEqual([{ weekSort: 0, type: "tarot-reading" }]);
  });

  it("does not flag the registered placeholder type", () => {
    const tbd = structuredClone(FIXTURE);
    tbd.groups[0].weeks[0].type = "placeholder";
    expect(unknownWeeks(tbd)).toEqual([]);
  });
});

describe("a claimed section key is only claimed on its own week", () => {
  it("offers a w4-role section on a worksheet week rather than dropping it", () => {
    // `w4-role` is Session 4's vision key. Excluding it on every week type made a section
    // carrying that key vanish from a worksheet week with no chip and no note — a silent
    // drop, which is the one failure this board names as fatal.
    const odd = structuredClone(FIXTURE);
    const w1 = odd.groups[0].weeks[0].answers as WorksheetExercise;
    w1.questions.push({
      key: COMMITMENTS_KEY_VISION,
      label: "Borrowed key",
      kind: "question",
      answers: [{ id: "b1", text: "written anyway", author: "", createdAt: "" }],
    });
    expect(listCrossGroupFields(odd).map((f) => f.id)).toContain(
      `0:q:${COMMITMENTS_KEY_VISION}`
    );
  });
});
