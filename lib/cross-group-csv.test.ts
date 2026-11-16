import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CROSS_GROUP_FIELD_CSV_HEADER,
  allFieldsCsvRows,
  fieldCsvRows,
  uncertaintyCsvRows,
} from "@/lib/cross-group-csv";
import { columnsFor, listCrossGroupFields } from "@/lib/cross-group-shape";
import type { ProjectExport } from "@/lib/cohort-export-shape";
import type { UncertaintyGrid } from "@/lib/cross-group-uncertainties-shape";

const FIXTURE = JSON.parse(
  readFileSync("data/all-groups-public-health-2026-10-30.json", "utf8")
) as ProjectExport;

const FIELDS = listCrossGroupFields(FIXTURE);
const field = (id: string) => FIELDS.find((f) => f.id === id)!;
const cols = (id: string) => columnsFor(FIXTURE, id);
const ALL = Object.fromEntries(FIELDS.map((f) => [f.id, columnsFor(FIXTURE, f.id)]));

describe("fieldCsvRows", () => {
  it("emits one row per cell with the group in front", () => {
    const rows = fieldCsvRows(field("3:bold-moves"), cols("3:bold-moves"));
    expect(rows).toHaveLength(7); // 3 + 2 + 1 + 1
    expect(rows[0]).toHaveLength(CROSS_GROUP_FIELD_CSV_HEADER.length);
    expect(rows[0][0]).toBe(FIXTURE.groups[0].groupName);
  });

  it("carries the theme tag into its own column", () => {
    const rows = fieldCsvRows(field("2:risks"), cols("2:risks"));
    const row = rows.find((r) => r[4].startsWith("PH funding comes from one source"))!;
    expect(row[3]).toContain("Predictable funding");
  });

  it("names the field and the week on every row", () => {
    const f = field("3:bold-moves");
    for (const row of fieldCsvRows(f, cols(f.id))) {
      expect(row[1]).toBe(f.label);
      expect(row[2]).toBe(f.weekTitle);
    }
  });

  it("emits nothing for a group with no cells rather than a blank row", () => {
    const gap = structuredClone(FIXTURE);
    gap.groups[1].weeks[3] = { ...gap.groups[1].weeks[3], exerciseId: null, answers: null };
    const rows = fieldCsvRows(field("3:bold-moves"), columnsFor(gap, "3:bold-moves"));
    expect(rows.map((r) => r[0])).not.toContain(gap.groups[1].groupName);
  });
});

describe("allFieldsCsvRows", () => {
  it("covers every chip that has content", () => {
    const seen = new Set(allFieldsCsvRows(FIELDS, ALL).map((r) => r[1]));
    for (const f of FIELDS) {
      if (Object.values(f.counts).some((n) => n > 0)) expect(seen).toContain(f.label);
    }
  });

  it("totals every field's rows", () => {
    const expected = FIELDS.reduce(
      (sum, f) => sum + Object.values(f.counts).reduce((a, b) => a + b, 0),
      0
    );
    expect(allFieldsCsvRows(FIELDS, ALL)).toHaveLength(expected);
  });
});

describe("uncertaintyCsvRows", () => {
  const GROUPS = [
    { groupId: "g1", groupName: "Group 1" },
    { groupId: "g2", groupName: "Group 2" },
  ];
  const GRID: UncertaintyGrid = {
    rows: [
      {
        id: "shape",
        title: "The shape of the public",
        question: "What holds people together?",
        unmatched: false,
        agreed: false,
        cells: {
          g1: { resolution: "Shared civic public", options: [], chosen: null },
          g2: { resolution: null, options: [], chosen: null },
        },
      },
    ],
    emptyGroups: ["g2"],
  };

  it("exports the grid wide, one column per group", () => {
    const { header, rows } = uncertaintyCsvRows(GRID, GROUPS);
    expect(header).toEqual(["Uncertainty", "Question", "Group 1", "Group 2"]);
    expect(rows[0]).toHaveLength(header.length);
    expect(rows[0][2]).toBe("Shared civic public");
  });

  it("writes an unresolved cell as words rather than an empty cell", () => {
    // A blank cell in a spreadsheet reads as missing data; "not resolved" is a position the
    // group has not taken, which is a different and knowable thing.
    expect(uncertaintyCsvRows(GRID, GROUPS).rows[0][3]).toBe("not resolved");
  });
});
