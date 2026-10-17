import { describe, it, expect } from "vitest";
import {
  buildExportPayload,
  crossGroupCsvRows,
  type BoardExtras,
  type ExportInput,
} from "./cohort-export-shape";
import { CROSS_GROUP_CSV_HEADER } from "./group-answers-csv";
import type { DesignGroup } from "./design-groups";
import type { DesignGroupExercise } from "./design-group-exercises";
import type { ProgramDTO } from "./design-program-shape";
import type { ExerciseAnswers } from "@/components/design-groups/AnswerPanels";

const group = (id: string, over: Partial<DesignGroup> = {}): DesignGroup => ({
  id,
  projectId: "P",
  name: `Group ${id}`,
  sort: 0,
  color: null,
  scenarioRef: null,
  scenarioSetId: null,
  scenarioTitle: `Scenario ${id}`,
  createdTime: "2026-01-01",
  ...over,
});

const exercise = (id: string, over: Partial<DesignGroupExercise> = {}): DesignGroupExercise => ({
  id,
  groupId: "g1",
  sort: 0,
  title: "Session 1",
  type: "scenario-assessment",
  sessionCode: "AAAA",
  locked: false,
  closed: false,
  opensAt: null,
  sections: [],
  createdTime: "2026-01-01",
  ...over,
});

const worksheet = (exerciseId: string, title: string, answerText: string): ExerciseAnswers => ({
  kind: "worksheet",
  exerciseId,
  title,
  questions: [
    {
      key: "six-changes",
      label: "Six key changes",
      kind: "question",
      answers: [{ id: `${exerciseId}-a`, text: answerText, author: "You", createdAt: "2026-01-02" }],
    },
  ],
});

const extras = (over: Partial<BoardExtras> = {}): BoardExtras => ({
  players: 3,
  submitted: 2,
  roster: [{ playerId: "pl1", displayName: "You", submittedAt: "2026-01-02" }],
  canvas: null,
  themeIdeas: [],
  summary: null,
  ...over,
});

// Two groups, two weeks. Group 2's week-2 exercise is titled differently from group 1's --
// which is the real state of the live boards -- so alignment has to come from the program,
// not from matching titles.
function twoGroups(): ExportInput {
  const g1 = group("g1", { sort: 0, name: "Group 1" });
  const g2 = group("g2", { sort: 1, name: "Group 2" });
  const ex1a = exercise("e1a", { groupId: "g1", sort: 0, title: "Session 1", sessionCode: "AAAA" });
  const ex1b = exercise("e1b", { groupId: "g1", sort: 1, title: "Session 2", sessionCode: "BBBB", type: "implications" });
  const ex2a = exercise("e2a", { groupId: "g2", sort: 0, title: "Session 1", sessionCode: "CCCC" });
  const ex2b = exercise("e2b", { groupId: "g2", sort: 1, title: "Session 2 -- renamed", sessionCode: "DDDD", type: "implications" });

  const program: ProgramDTO = {
    weeks: [
      {
        title: "Session 1",
        type: "scenario-assessment",
        opensAt: null,
        locked: false,
        closed: false,
        sections: [],
        slots: { g1: "e1a", g2: "e2a" },
        cardsByGroup: {},
        sessionByGroup: { g1: "AAAA", g2: "CCCC" },
      },
      {
        title: "Session 2",
        type: "implications",
        opensAt: null,
        locked: false,
        closed: false,
        sections: [],
        slots: { g1: "e1b", g2: "e2b" },
        cardsByGroup: {},
        sessionByGroup: { g1: "BBBB", g2: "DDDD" },
      },
    ],
    groups: [],
    divergent: false,
    version: "v1",
  };

  return {
    project: { slug: "nnphi", name: "NNPHI" },
    exportedAt: "2026-10-16T00:00:00.000Z",
    program,
    groups: [g2, g1], // deliberately out of order
    exercisesByGroup: { g1: [ex1a, ex1b], g2: [ex2a, ex2b] },
    answersByExerciseId: {
      e1a: worksheet("e1a", "Session 1", "g1 week1 answer"),
      e1b: worksheet("e1b", "Session 2", "g1 week2 answer"),
      e2a: worksheet("e2a", "Session 1", "g2 week1 answer"),
      e2b: worksheet("e2b", "Session 2 -- renamed", "g2 week2 answer"),
    },
    extrasByCode: { AAAA: extras(), BBBB: extras(), CCCC: extras(), DDDD: extras() },
  };
}

describe("buildExportPayload", () => {
  it("carries the project, the stamp and the canonical week list", () => {
    const out = buildExportPayload(twoGroups());
    expect(out.project).toEqual({ slug: "nnphi", name: "NNPHI" });
    expect(out.exportedAt).toBe("2026-10-16T00:00:00.000Z");
    expect(out.weeks).toEqual([
      { sort: 0, title: "Session 1", type: "scenario-assessment" },
      { sort: 1, title: "Session 2", type: "implications" },
    ]);
  });

  it("orders groups by sort, not by the order they were loaded in", () => {
    const out = buildExportPayload(twoGroups());
    expect(out.groups.map((g) => g.groupName)).toEqual(["Group 1", "Group 2"]);
  });

  it("aligns weeks on the program slot and keeps BOTH titles when a group renamed its own", () => {
    const out = buildExportPayload(twoGroups());
    const g2w2 = out.groups[1].weeks[1];
    expect(g2w2.weekSort).toBe(1);
    expect(g2w2.weekTitle).toBe("Session 2"); // canonical
    expect(g2w2.exerciseTitle).toBe("Session 2 -- renamed"); // this group's own
    expect(g2w2.exerciseId).toBe("e2b");
  });

  it("attaches each board's participation, roster and extras by session code", () => {
    const input = twoGroups();
    input.extrasByCode.BBBB = extras({ players: 9, submitted: 7 });
    const out = buildExportPayload(input);
    expect(out.groups[0].weeks[1].participation).toEqual({ players: 9, submitted: 7 });
    expect(out.groups[0].weeks[1].roster).toHaveLength(1);
  });

  it("looks extras up case-insensitively, since codes are upper-cased on write", () => {
    const input = twoGroups();
    input.exercisesByGroup.g1[0] = exercise("e1a", { groupId: "g1", sort: 0, sessionCode: "aaaa" });
    input.extrasByCode = { AAAA: extras({ players: 5, submitted: 5 }) };
    const out = buildExportPayload(input);
    expect(out.groups[0].weeks[0].participation).toEqual({ players: 5, submitted: 5 });
  });

  it("records a week a group has no row for as an explicit gap, never by omitting it", () => {
    const input = twoGroups();
    delete input.program.weeks[1].slots.g2;
    const out = buildExportPayload(input);
    const g2 = out.groups[1];
    expect(g2.weeks).toHaveLength(2); // still two weeks
    expect(g2.weeks[1].exerciseId).toBeNull();
    expect(g2.weeks[1].answers).toBeNull();
    expect(g2.weeks[1].weekTitle).toBe("Session 2");
  });

  it("records a week whose row has no board as a gap in the board, not in the week", () => {
    const input = twoGroups();
    input.exercisesByGroup.g2[1] = exercise("e2b", { groupId: "g2", sort: 1, sessionCode: null, title: "Session 2 -- renamed" });
    const out = buildExportPayload(input);
    const w = out.groups[1].weeks[1];
    expect(w.exerciseId).toBe("e2b"); // the row exists
    expect(w.sessionCode).toBeNull(); // the board does not
    expect(w.participation).toBeNull();
  });

  it("carries the scenario each group worked, which is what makes cross-group comparison mean anything", () => {
    const out = buildExportPayload(twoGroups());
    expect(out.groups.map((g) => g.scenarioTitle)).toEqual(["Scenario g1", "Scenario g2"]);
  });
});

describe("week titles are taken from the groups, not from the program template", () => {
  // toProgramDTO picks the group with the MOST exercises as its canonical content group --
  // right for the program editor, wrong for an export. On the dev database a leftover
  // "ZZ TEST GROUP" with six exercises made every canonical week title read "ZZ TEST ·
  // Session 3 synthesis", so Group 1's Session 1 answers were labelled with a test group's
  // week. The export derives the label from what the groups actually call the week.
  it("uses the title most groups give the week, ignoring the program's own", () => {
    const input = twoGroups();
    input.program.weeks[0].title = "ZZ TEST · leftover";
    input.program.weeks[1].title = "ZZ TEST 2 · leftover";
    const out = buildExportPayload(input);
    expect(out.weeks.map((w) => w.title)).toEqual(["Session 1", "Session 2"]);
  });

  it("breaks a tie alphabetically so the same data labels the same way twice", () => {
    const input = twoGroups();
    input.exercisesByGroup.g1[0] = exercise("e1a", { groupId: "g1", sort: 0, title: "Bravo", sessionCode: "AAAA" });
    input.exercisesByGroup.g2[0] = exercise("e2a", { groupId: "g2", sort: 0, title: "Alpha", sessionCode: "CCCC" });
    expect(buildExportPayload(input).weeks[0].title).toBe("Alpha");
  });

  it("uses the type most groups give the week too", () => {
    const input = twoGroups();
    input.program.weeks[1].type = "synthesis"; // the template's, from some other group
    expect(buildExportPayload(input).weeks[1].type).toBe("implications");
  });

  it("falls back to the program's title when no group has a row at that week", () => {
    const input = twoGroups();
    delete input.program.weeks[1].slots.g1;
    delete input.program.weeks[1].slots.g2;
    input.program.weeks[1].title = "Session 4 · TBD";
    expect(buildExportPayload(input).weeks[1].title).toBe("Session 4 · TBD");
  });
});

describe("crossGroupCsvRows", () => {
  it("prefixes every row with its group so four groups can share one sheet", () => {
    const rows = crossGroupCsvRows(buildExportPayload(twoGroups()));
    // Columns are [Group, Week, Section, Kind, Content, Author, Created] -- the group
    // prefix shifts Content to index 4.
    expect(rows.map((r) => [r[0], r[4]])).toEqual([
      ["Group 1", "g1 week1 answer"],
      ["Group 1", "g1 week2 answer"],
      ["Group 2", "g2 week1 answer"],
      ["Group 2", "g2 week2 answer"],
    ]);
  });

  it("emits exactly as many cells as the cross-group header has columns", () => {
    const rows = crossGroupCsvRows(buildExportPayload(twoGroups()));
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r).toHaveLength(CROSS_GROUP_CSV_HEADER.length);
  });

  it("skips a gap week rather than emitting a blank row for it", () => {
    const input = twoGroups();
    delete input.program.weeks[1].slots.g2;
    const rows = crossGroupCsvRows(buildExportPayload(input));
    expect(rows.filter((r) => r[0] === "Group 2")).toHaveLength(1);
  });

  it("uses the group's OWN week title in the Week column, so a row matches what that room saw", () => {
    const rows = crossGroupCsvRows(buildExportPayload(twoGroups()));
    const g2w2 = rows.find((r) => r[0] === "Group 2" && r[4] === "g2 week2 answer");
    expect(g2w2?.[1]).toBe("Session 2 -- renamed");
  });
});

// --- divergence travels with the export -----------------------------------------
//
// toProgramDTO aligns weeks by ARRAY INDEX, not by the rows' own `sort`. For groups that
// run the same program those are the same thing, which is why the export can key on
// weekSort at all. They stop being the same thing the moment one group's row is deleted
// rather than left empty, and then index 1 pairs one group's Session 2 with another's
// Session 3 under a single label. toProgramDTO detects exactly this and sets `divergent`;
// the export dropped that flag on the floor, so a consumer had no way to know the
// alignment it was trusting had failed.

describe("program divergence", () => {
  it("carries the divergent flag so a consumer can refuse to compare across weeks", () => {
    const input = twoGroups();
    input.program.divergent = true;
    expect(buildExportPayload(input).programDivergent).toBe(true);
  });

  it("reports an aligned program as not divergent", () => {
    expect(buildExportPayload(twoGroups()).programDivergent).toBe(false);
  });

  it("carries each group's own row sort, so a mismatch is checkable and not just flagged", () => {
    const input = twoGroups();
    input.exercisesByGroup.g2[1] = exercise("e2b", {
      groupId: "g2",
      sort: 3, // the row the program put at index 1 calls itself week 3
      title: "Session 2 -- renamed",
      sessionCode: "DDDD",
    });
    const w = buildExportPayload(input).groups[1].weeks[1];
    expect(w.weekSort).toBe(1); // its position in the canonical program
    expect(w.exerciseSort).toBe(3); // what the row itself says
  });

  it("leaves the row's own sort null for a week a group has no row at", () => {
    const input = twoGroups();
    delete input.program.weeks[1].slots.g2;
    expect(buildExportPayload(input).groups[1].weeks[1].exerciseSort).toBeNull();
  });
});
