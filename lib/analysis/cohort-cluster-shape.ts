// Client-safe shaping for COHORT implication clustering — every design group's Session 2
// implications in one project, pooled and themed together. No server imports, so this is
// safe in client components, route handlers and tests. The model calls live in
// lib/analysis/cohort-cluster.ts; the per-group equivalent of this file is
// lib/analysis/implication-cluster-shape.ts, whose types this one extends rather than
// replaces.
//
// The reason the whole thing exists: a single group's themes tell a facilitator what that
// room thinks. Pooling the cohort tells them which themes recur across rooms — and which
// room stood alone. That second reading is only trustworthy if provenance is DERIVED from
// membership after the fact, never asked of the model, which is what deriveCohortThemes is.

import type { ClusterMethod, ImplicationItem, SuggestedTheme } from "./implication-cluster-shape";

// Why a group contributed nothing, which must never be confusable with "contributed zero
// to this theme". "Group 4 never raised legitimacy" is a finding; "Group 4 had no board"
// is a gap in the run. They look identical in a grid unless the state travels too.
export type GroupState = "ok" | "empty" | "missing";

// How much the LLM method is told. Only the grouping prompt can use this — the embedding
// method embeds the implication text alone, so there is no prompt to enrich.
export type ContextMode = "blind" | "full";

export interface CohortItem extends ImplicationItem {
  groupId: string;
}

export interface CohortTheme extends SuggestedTheme {
  // Derived from memberIds, never from the model. Busiest group first.
  byGroup: { groupId: string; count: number }[];
  // How many distinct groups fed this theme. 1 means an outlier; all of them means
  // convergence. The headline number in the grid.
  groupCount: number;
}

export interface CohortGroupInfo {
  id: string;
  name: string;
  color: string | null;
  scenarioTitle: string | null;
  itemCount: number;
  state: GroupState;
}

export interface CohortNarrative {
  perGroup: { groupId: string; text: string }[];
  overall: string;
}

export interface CohortClusterResponse {
  method: ClusterMethod;
  criteria: string | null;
  promptOverride: string | null;
  context: ContextMode;
  minSimilarity: number | null;
  // Whether an implication was also filed under every other theme it fits. Off by default
  // for a cohort run; recorded because it changes the group tallies substantially.
  bridging: boolean;
  week: { sort: number; title: string };
  groups: CohortGroupInfo[];
  themes: CohortTheme[];
  ungrouped: string[];
  nearDuplicates: { aId: string; bId: string; similarity: number }[];
  narrative: CohortNarrative | null;
  items: CohortItem[]; // so an exported run is self-contained
  model: string;
  generatedAt: string;
  elapsedMs: number;
  notes: string[];
}

// Grouping thresholds for a COHORT pool, which is an order of magnitude larger than one
// group's board and needs a different band entirely.
//
// Measured on a real 269-implication pool from four groups: the single-group presets
// (0.03 / 0.1 / 0.18) returned 11, 28 and 54 themes. A facilitator opening a plenary wants
// five or so, and 28 unusable themes also cost two minutes of naming calls. The useful
// band at this size starts below where the single-group presets start, so cohort runs get
// their own.
//
// Labels stay qualitative on purpose: the theme count a threshold yields depends on the
// size and spread of the pool, so promising "≈5 themes" here would be a number measured
// on one cohort and quoted at every other.
export const COHORT_PRESETS: { key: string; label: string; minSimilarity: number }[] = [
  { key: "few", label: "Few, broad themes", minSimilarity: 0 },
  { key: "balanced", label: "Balanced", minSimilarity: 0.02 },
  { key: "many", label: "More, sharper themes", minSimilarity: 0.05 },
  { key: "fine", label: "Fine-grained — many small themes", minSimilarity: 0.1 },
];

export const DEFAULT_COHORT_PRESET = "balanced";

// Did the contributing groups work from DIFFERENT scenarios?
//
// Contributing only, and named only. Counting `scenarioTitle ?? ""` across every group made
// one group with no scenario assigned — or one sitting out the run with no board — look
// like a second scenario, so the grid said "these rooms explored different futures" while
// cohort-cluster.ts, which filters nulls and non-contributing groups before it writes the
// preamble, told the model the opposite. Two readings of the same run is worse than either.
export function scenariosDiffer(groups: CohortGroupInfo[]): boolean {
  const named = new Set(
    groups.filter((g) => g.state === "ok" && g.scenarioTitle).map((g) => g.scenarioTitle as string)
  );
  return named.size > 1;
}

export function isContextMode(v: unknown): v is ContextMode {
  return v === "blind" || v === "full";
}

// --- which week ---------------------------------------------------------------

export interface WeekChoice {
  sort: number;
  title: string;
  groupCount: number;
}

// The implications weeks available across the cohort, most widely covered first.
//
// Keyed on `sort`, NOT on the title: groups are built from one template so the week lands
// at the same sort in each, but a facilitator may well have renamed one group's copy
// ("Session 2 — implications"). Keying on the title would split that group off into a week
// of its own and quietly halve the pool. The title shown is the one the most groups use.
export function cohortWeeks(
  groups: { groupId: string; exercises: { id: string; sort: number; title: string }[] }[]
): WeekChoice[] {
  // sort -> groupIds, and sort -> title tallies
  const groupsAt = new Map<number, Set<string>>();
  const titlesAt = new Map<number, Map<string, number>>();

  for (const g of groups) {
    for (const ex of g.exercises) {
      if (!groupsAt.has(ex.sort)) groupsAt.set(ex.sort, new Set());
      groupsAt.get(ex.sort)!.add(g.groupId);
      if (!titlesAt.has(ex.sort)) titlesAt.set(ex.sort, new Map());
      const titles = titlesAt.get(ex.sort)!;
      titles.set(ex.title, (titles.get(ex.title) ?? 0) + 1);
    }
  }

  return [...groupsAt.entries()]
    .map(([sort, ids]) => {
      const titles = [...(titlesAt.get(sort) ?? new Map()).entries()];
      // Most-used title; ties go to the alphabetically first, so the label is stable
      // across runs rather than depending on map order.
      titles.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      return { sort, title: titles[0]?.[0] ?? `Week ${sort}`, groupCount: ids.size };
    })
    // Most groups first; a tie goes to the earlier week.
    .sort((a, b) => b.groupCount - a.groupCount || a.sort - b.sort);
}

export function groupStateFor({
  hasWeek,
  itemCount,
}: {
  hasWeek: boolean;
  itemCount: number;
}): GroupState {
  if (!hasWeek) return "missing";
  return itemCount > 0 ? "ok" : "empty";
}

// --- provenance ---------------------------------------------------------------

// Attach "which groups fed this theme" to each theme, computed from membership.
//
// An implication sitting in two themes counts in BOTH — that is intent, not double
// counting: clusterByEmbedding's secondaryMemberships produces exactly this case, and a
// bridging implication genuinely belongs to each theme it bridges.
//
// A member that cannot be attributed is skipped rather than filed under a made-up group.
// It should never happen (memberIds come from the pool we built the map from), so the
// quiet skip is a floor under a bug, not a path anyone relies on.
export function deriveCohortThemes(
  themes: SuggestedTheme[],
  groupOf: Map<string, string>
): CohortTheme[] {
  return themes.map((t) => {
    const counts = new Map<string, number>();
    for (const id of t.memberIds) {
      const gid = groupOf.get(id);
      if (!gid) continue;
      counts.set(gid, (counts.get(gid) ?? 0) + 1);
    }
    const byGroup = [...counts.entries()]
      .map(([groupId, count]) => ({ groupId, count }))
      // Busiest first; ties by id so a run reads the same way twice.
      .sort((a, b) => b.count - a.count || a.groupId.localeCompare(b.groupId));
    return { ...t, byGroup, groupCount: byGroup.length };
  });
}

// Split a list of implication ids into one bucket per room, for the nested accordions
// under an expanded theme: having seen that four rooms raised a theme, the next question
// is always what each of them actually said.
//
// `order` lets a theme pass its own byGroup order so the buckets read in the same order as
// its row in the grid. Rooms in `order` that contributed nothing here are left out rather
// than rendered as empty accordions.
//
// An id with no attributable room gets a bucket of its own under "" instead of being
// skipped: it should be impossible, and an implication quietly missing from the view is
// the failure this whole feature is built to avoid. Asserted as a property test — the
// buckets always re-add to exactly what was passed in.
export function bucketByGroup(
  ids: string[],
  groupOf: Map<string, string>,
  order?: string[]
): { groupId: string; ids: string[] }[] {
  const buckets = new Map<string, string[]>();
  for (const id of ids) {
    const gid = groupOf.get(id) ?? "";
    if (!buckets.has(gid)) buckets.set(gid, []);
    buckets.get(gid)!.push(id);
  }

  const seen = new Set<string>();
  const out: { groupId: string; ids: string[] }[] = [];
  for (const gid of order ?? []) {
    const got = buckets.get(gid);
    if (!got) continue;
    out.push({ groupId: gid, ids: got });
    seen.add(gid);
  }
  // Whatever the caller did not order: busiest room first, ties by id so it reads the same
  // way twice. The unattributed bucket sorts last, since it is a diagnostic, not a room.
  const rest = [...buckets.entries()]
    .filter(([gid]) => !seen.has(gid))
    .sort((a, b) =>
      a[0] === "" ? 1 : b[0] === "" ? -1 : b[1].length - a[1].length || a[0].localeCompare(b[0])
    );
  for (const [groupId, bucketIds] of rest) out.push({ groupId, ids: bucketIds });
  return out;
}

// --- the grid -----------------------------------------------------------------

export interface GridRow {
  themeIndex: number;
  cells: { groupId: string; count: number; state: GroupState }[];
}

// Themes down, groups across. A row lit across every column is the plenary theme; a row
// lit in one column is the outlier; a dark cell says that group never went there.
//
// The cell carries the group's STATE as well as its count, because a zero means two
// completely different things and the grid is the one place that difference gets read.
export function buildGrid(themes: CohortTheme[], groups: CohortGroupInfo[]): GridRow[] {
  return themes.map((t, themeIndex) => {
    const byId = new Map(t.byGroup.map((b) => [b.groupId, b.count]));
    return {
      themeIndex,
      cells: groups.map((g) => ({
        groupId: g.id,
        count: byId.get(g.id) ?? 0,
        state: g.state,
      })),
    };
  });
}
