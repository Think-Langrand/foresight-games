import type { CrossGroupColumn, CrossGroupField } from "@/lib/cross-group-shape";
import type { UncertaintyGrid } from "@/lib/cross-group-uncertainties-shape";

// The cross-group board's exports: one field, every field, or the uncertainty grid.
//
// THESE BUILD FROM THE COLUMNS THE PAGE IS ALREADY SHOWING, so the sheet and the screen
// cannot disagree. The board holds every field's columns in props (see the page's note on
// why), which is also why this is a client-side download in the component rather than a
// route: a route would re-pay all 16 board reads to produce rows the browser already has.
// `components/admin/exportUtils.ts` is the same mechanism the per-group answers viewer uses
// for its own CSV.
//
// THE WHOLE-PROJECT EXPORT STILL LIVES ON THE DASHBOARD. `crossGroupCsvRows` in
// lib/cohort-export-shape.ts remains the lossless record of every card of every week, with
// the compile-time `never` guard in `exerciseCsvRows` behind it. These functions are the
// piece-by-piece export — shaped like the chips, which that week-and-section row format
// cannot express, because a response tagged with its parent outcome has no row there. The
// equivalent protection on this side is the `never` branch in cross-group-shape's field
// switch: a new exercise kind cannot be added without that file failing to compile.

export const CROSS_GROUP_FIELD_CSV_HEADER = [
  "Group",
  "Field",
  "Week",
  "Tag",
  "Content",
  "Author",
  "Created",
] as const;

/** One field, every group: a row per cell, group first. */
export function fieldCsvRows(
  field: CrossGroupField,
  columns: CrossGroupColumn[]
): string[][] {
  return columns.flatMap((col) =>
    col.cells.map((c) => [
      col.groupName,
      field.label,
      field.weekTitle ?? "",
      c.tag ?? "",
      c.text,
      c.author,
      c.createdAt,
    ])
  );
}

/**
 * Every field in one sheet, in chip order. The uncertainty field is skipped: it is a grid
 * with its own shape and its own export, and flattening it into this long format would put
 * rows in here that mean something different from every other row.
 */
export function allFieldsCsvRows(
  fields: CrossGroupField[],
  columns: Record<string, CrossGroupColumn[]>
): string[][] {
  return fields.flatMap((f) =>
    f.weekSort === null ? [] : fieldCsvRows(f, columns[f.id] ?? [])
  );
}

/**
 * The uncertainty grid, wide: one row per uncertainty, one column per group. Its own shape
 * on purpose — forcing a grid into the long format above would produce a sheet nobody can
 * read across, which is the only thing this grid is for.
 */
export function uncertaintyCsvRows(
  grid: UncertaintyGrid,
  groups: { groupId: string; groupName: string }[]
): { header: string[]; rows: string[][] } {
  return {
    header: ["Uncertainty", "Question", ...groups.map((g) => g.groupName)],
    rows: grid.rows.map((r) => [
      r.title,
      r.question,
      // Words, not a blank: an empty spreadsheet cell reads as missing data, where "not
      // resolved" is a position the group has not taken — a different, knowable thing.
      ...groups.map((g) => r.cells[g.groupId]?.resolution ?? "not resolved"),
    ]),
  };
}
