// The whole project as one deck's worth of data: four groups' folded programs, what they
// found TOGETHER, and the reference material behind them.
//
// PURE, LIKE lib/group-summary.ts, AND FOR THE SAME REASON. This file does no I/O, so it
// can be unit-tested against fixtures and reused by every renderer. There are three of
// them — a live Next route, a standalone HTML file and a .pptx — and content that lives in
// markup can only be rendered once. ProjectDeck is the contract they share; none of them
// derives anything.
//
// IT FOLDS SUMMARIES, IT DOES NOT BUILD THEM. `buildGroupSummary` already turns one group's
// four weeks into a GroupSummary and is tested on its own. This takes those as given and
// adds the one thing that does not exist anywhere else: the cross-group reading.
//
// WHAT IT DELIBERATELY DOES NOT DO: cluster. Deciding that two rooms said "the same thing"
// is a judgement, and the honest ways to make it are a model run or a person. Both are out
// of v1, so `convergenceNote` is a field that stays null until one of them fills it, rather
// than a lexical guess presented to a committee as a finding.

import type { GroupSummary, SummaryPlacement } from "@/lib/group-summary";
import type { Scenario } from "@/lib/foresight/types";

// --- what goes in --------------------------------------------------------------------

// A driver as the deck prints it: Carmelita's card, wearing the theme it inherited from the
// curated table. See scripts/build-deck-reference.mjs for how the two are married.
export interface DeckDriver {
  id: string;
  name: string;
  theme: string | null;
  // The bold lead line. NULL on two of the twenty, which have a body and no opener — a
  // renderer falls back to the body's first sentence rather than printing nothing.
  shortDescription: string | null;
  description: string | null;
  imageUrl: string | null;
  sources?: unknown[];
}

export interface ProjectDeckInput {
  project: { slug: string; name: string };
  // In reading order. The deck's chapters follow this, so it is the caller's job to sort.
  groups: {
    summary: GroupSummary;
    scenarioRef: string;
    scenarioTitle: string | null;
  }[];
  scenarios: Scenario[];
  drivers: DeckDriver[];
}

// --- what comes out ------------------------------------------------------------------

// Every aggregate row carries the group it came from. The cross-group chapter exists to be
// read ACROSS, and a row that cannot say whose it is cannot be read that way.
export interface AggregateMove {
  id: string;
  groupName: string;
  scenarioTitle: string | null;
  text: string;
  fields: { key: string; label: string; prompt: string; answers: string[] }[];
}

export interface AggregateStake extends SummaryPlacement {
  groupName: string;
  scenarioTitle: string | null;
}

export interface ProjectAggregate {
  // All of them, in group order then board order. Seven in the real program, not twelve.
  boldMoves: AggregateMove[];
  // So a slide can state the spread without recounting, and show a group that wrote none.
  movesByGroup: { groupName: string; count: number }[];
  // Each group's three, carrying `confirmed`. Three of four groups never pressed Keep, so
  // flattening this away would claim four rooms each chose three.
  priorities: AggregateStake[];
  anyConfirmed: boolean;
  allConfirmed: boolean;
  // Every group's matrix pooled and ranked together: the strongest aggregate material,
  // because Sessions 1-3 are complete for all four groups where Session 4 is not.
  stakes: AggregateStake[];
  topRisks: AggregateStake[];
  topOpportunities: AggregateStake[];
  // Each group's theme names, side by side. Not clustered — just placed next to each other,
  // so a reader can see the overlap and the deck claims nothing it has not earned.
  themesByGroup: { groupName: string; themes: string[] }[];
  // Written by a person or drafted by a model, later. Never inferred here.
  convergenceNote: string | null;
}

export interface ProjectDeckGroup {
  summary: GroupSummary;
  scenarioRef: string;
  scenarioTitle: string | null;
  // The scenario record, when the snapshot carries one for this ref. Null is survivable:
  // the chapter drops its scenario pages rather than failing to render.
  scenario: Scenario | null;
}

export interface ProjectDeck {
  project: { slug: string; name: string };
  groups: ProjectDeckGroup[];
  aggregate: ProjectAggregate;
  scenarios: Scenario[];
  // Grouped for the drivers chapter. A driver with no theme lands in a trailing "Other"
  // group rather than vanishing.
  driversByTheme: { theme: string; drivers: DeckDriver[] }[];
  counts: {
    groups: number;
    themes: number;
    risks: number;
    opportunities: number;
    boldMoves: number;
  };
}

const UNTHEMED = "Other";

export function buildProjectDeck(input: ProjectDeckInput): ProjectDeck {
  const { project, groups, scenarios, drivers } = input;

  const byRef = new Map(scenarios.map((s) => [s.id, s]));

  const deckGroups: ProjectDeckGroup[] = groups.map((g) => ({
    summary: g.summary,
    scenarioRef: g.scenarioRef,
    scenarioTitle: g.scenarioTitle,
    scenario: byRef.get(g.scenarioRef) ?? null,
  }));

  // Stamp each row with its provenance once, here, so no renderer has to zip two lists.
  const tag = (g: (typeof groups)[number]) => (p: SummaryPlacement): AggregateStake => ({
    ...p,
    groupName: g.summary.groupName,
    scenarioTitle: g.scenarioTitle,
  });

  const boldMoves: AggregateMove[] = groups.flatMap((g) =>
    g.summary.directions.map((d) => ({
      id: d.id,
      groupName: g.summary.groupName,
      scenarioTitle: g.scenarioTitle,
      text: d.text,
      fields: d.fields,
    }))
  );

  const priorities: AggregateStake[] = groups.flatMap((g) => g.summary.priorities.map(tag(g)));

  // POOLED THEN RANKED, not ranked within a group and concatenated. The question the slide
  // answers is "what did the four rooms weigh most heavily", and only one ordering answers
  // it. Unscored rows sink rather than being dropped: a stake with no score is still
  // something a room raised, it just cannot claim a position it never earned.
  const stakes: AggregateStake[] = groups
    .flatMap((g) => g.summary.placements.map(tag(g)))
    .sort(byRank);

  const driversByTheme = groupDriversByTheme(drivers);

  return {
    project,
    groups: deckGroups,
    aggregate: {
      boldMoves,
      movesByGroup: groups.map((g) => ({
        groupName: g.summary.groupName,
        count: g.summary.directions.length,
      })),
      priorities,
      anyConfirmed: priorities.some((p) => p.confirmed),
      // `every` on an empty list is true, which would claim a project with no priorities
      // had ratified all of them. Guarded.
      allConfirmed: priorities.length > 0 && priorities.every((p) => p.confirmed),
      stakes,
      // Already in rank order; filtering preserves it, so neither is re-sorted.
      topRisks: stakes.filter((s) => s.kind === "risk"),
      topOpportunities: stakes.filter((s) => s.kind === "opportunity"),
      themesByGroup: groups.map((g) => ({
        groupName: g.summary.groupName,
        themes: g.summary.themes.map((t) => t.text),
      })),
      convergenceNote: null,
    },
    scenarios,
    driversByTheme,
    // DERIVED, NEVER PASSED IN. A headline number that is handed to this function can drift
    // from the list it claims to count; one computed from that list cannot.
    counts: {
      groups: groups.length,
      themes: groups.reduce((n, g) => n + g.summary.themes.length, 0),
      risks: groups.reduce((n, g) => n + g.summary.riskCount, 0),
      opportunities: groups.reduce((n, g) => n + g.summary.opportunityCount, 0),
      boldMoves: boldMoves.length,
    },
  };
}

// THE SAME COMPARATOR lib/group-summary.ts USES ON `placements`, on purpose and not
// `compareByRank`. Two reasons. It is what a group's own deck already orders by, and the
// comment there is explicit that a different order would have the deck and the worksheet
// naming a different three — true across groups as well as within one. And compareByRank
// falls through to `createdTime`, which a RippleCard has and a SummaryPlacement does not;
// pooling real groups ties often enough (four picks at 25 in one group alone) that the
// fall-through is reached immediately and throws.
//
// Ties beyond impact keep input order, which is group order, because Array.sort is stable.
function byRank(a: AggregateStake, b: AggregateStake): number {
  return (b.rank ?? -1) - (a.rank ?? -1) || (b.impact ?? -1) - (a.impact ?? -1);
}

// Theme order follows first appearance in the driver list, which is the platform's own
// ordering, and "Other" is forced last so an unthemed driver never opens the chapter.
function groupDriversByTheme(drivers: DeckDriver[]): { theme: string; drivers: DeckDriver[] }[] {
  const byTheme = new Map<string, DeckDriver[]>();
  for (const d of drivers) {
    const key = d.theme ?? UNTHEMED;
    const list = byTheme.get(key);
    if (list) list.push(d);
    else byTheme.set(key, [d]);
  }
  const out = [...byTheme.entries()].map(([theme, list]) => ({ theme, drivers: list }));
  const other = out.filter((g) => g.theme === UNTHEMED);
  return [...out.filter((g) => g.theme !== UNTHEMED), ...other];
}
