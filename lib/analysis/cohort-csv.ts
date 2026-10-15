import type { CohortClusterResponse } from "./cohort-cluster-shape";

// A cohort run's rows for the facilitator's CSV, as raw cells. Pure and separate from the
// export button, for the reason group-answers-csv.ts gives: an export that silently drops
// a row fails in the quietest possible way, long after the session it was taken into.
//
// Columns match the header below. One row per implication PER THEME — an implication in
// two themes appears under each, because the sheet is read theme by theme. Outliers ride
// in the same sheet under "— no theme —" rather than a second file, so the invariant the
// clustering guarantees (themes ∪ outliers covers the pool) is visible in the export too.

export const COHORT_CSV_HEADER = [
  "Theme",
  "Theme summary",
  "Groups in theme",
  "Group breakdown",
  "Cohesion",
  "Implication",
  "Group",
  "Key change",
] as const;

const NO_THEME = "— no theme —";

export function cohortCsvRows(run: CohortClusterResponse): string[][] {
  const itemById = new Map(run.items.map((i) => [i.id, i]));
  const nameOf = new Map(run.groups.map((g) => [g.id, g.name]));
  const rows: string[][] = [];

  const member = (
    id: string,
    theme: string,
    summary: string,
    groupCount: string,
    breakdown: string,
    cohesion: string
  ) => {
    const item = itemById.get(id);
    rows.push([
      theme,
      summary,
      groupCount,
      breakdown,
      cohesion,
      item?.text ?? id,
      item ? (nameOf.get(item.groupId) ?? item.groupId) : "",
      item?.keyChange ?? "",
    ]);
  };

  for (const t of run.themes) {
    const breakdown = t.byGroup
      .map((b) => `${nameOf.get(b.groupId) ?? b.groupId} (${b.count})`)
      .join("; ");
    const cohesion = t.cohesion === null ? "" : t.cohesion.toFixed(2);
    for (const id of t.memberIds) {
      member(id, t.label, t.summary ?? "", String(t.groupCount), breakdown, cohesion);
    }
  }

  for (const id of run.ungrouped) member(id, NO_THEME, "", "", "", "");

  return rows;
}
