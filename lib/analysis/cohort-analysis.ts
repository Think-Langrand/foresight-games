import "server-only";

import { listDesignGroups } from "@/lib/design-groups";
import { listExercises } from "@/lib/design-group-exercises";
import { getExerciseType } from "@/lib/exercise-types";
import { listBoardCards } from "@/lib/ripples";
import { runCohortClustering, type RunArgs } from "./cohort-cluster";
import { buildGrid, type CohortClusterResponse, type GridRow } from "./cohort-cluster-shape";
import {
  flipsForBoard,
  scoresForItems,
  weightsForThemes,
  type GroupFlips,
  type ThemeWeight,
} from "./cohort-analysis-shape";
import type { RippleCard } from "@/lib/ripples-types";

// ONE payload, four readings. Every view in the cohort analysis page reads this and only
// this, so two views can never disagree about the same cohort — and the same payload is
// what a shareable write-up is built from, so that cannot disagree with the app either.
//
// It is the clustering run plus three things the clustering cannot know:
//
//   grid     — themes down, groups across. Already pure in cohort-cluster-shape.
//   weights  — where the cohort put its weight, reconstructed from Session 2's
//              plausibility/impact scores through Session 3's themes.
//   flips    — what each room turned from a fear into a hope, and what it left standing.
//
// Read-only throughout, like the run it wraps.

export interface CohortAnalysis {
  run: CohortClusterResponse;
  grid: GridRow[];
  // One per theme, in run.themes order.
  weights: ThemeWeight[];
  // One per group that has a Session 3 board. A group with none is absent rather than
  // present with zeros: "no board" and "flipped nothing" are different findings.
  flips: GroupFlips[];
  // How many pooled items carried a plausibility/impact score at all. The honest headline
  // for the weight view: positioning 6 themes from 9 scored items out of 300 is a sketch,
  // and the view should be able to say which it is.
  scoredItems: number;
}

export type AnalysisResult =
  | { ok: true; analysis: CohortAnalysis }
  | { ok: false; status: number; error: string };

interface GroupBoards {
  week2: RippleCard[];
  week3: RippleCard[];
}

// Each group's Session 2 and Session 3 boards. Both are needed even for a risks run: the
// scores live on Session 2's roots and the path to them runs through Session 3's themes.
//
// Reads the LAST week of each render rather than the first. A project that re-ran a session
// has two implications weeks, and the scores a facilitator means are the ones on the week
// they actually used; `weekSort`/`overrides` on the run pick the POOL's week, but the
// lineage behind it is whatever the group most recently built.
async function loadGroupBoards(projectId: string, groupIds?: string[]): Promise<Map<string, GroupBoards>> {
  const all = await listDesignGroups(projectId);
  const wanted = groupIds?.length ? new Set(groupIds) : null;
  const groups = wanted ? all.filter((g) => wanted.has(g.id)) : all;

  const out = new Map<string, GroupBoards>();
  await Promise.all(
    groups.map(async (g) => {
      const exercises = await listExercises(g.id);
      const codeFor = (render: string) =>
        exercises
          .filter((e) => getExerciseType(e.type)?.render === render && e.sessionCode)
          .sort((a, b) => b.sort - a.sort)[0]?.sessionCode ?? null;

      const [w2, w3] = [codeFor("implications"), codeFor("synthesis")];
      const [week2, week3] = await Promise.all([
        w2 ? listBoardCards(w2) : Promise.resolve([]),
        w3 ? listBoardCards(w3) : Promise.resolve([]),
      ]);
      out.set(g.id, { week2, week3 });
    })
  );
  return out;
}

export async function runCohortAnalysis(args: RunArgs): Promise<AnalysisResult> {
  const result = await runCohortClustering(args);
  if (!result.ok) return result;
  const run = result.response;

  const boards = await loadGroupBoards(args.projectId, args.groupIds);

  // Scores are computed per group, because the lineage that reaches a score is a group's
  // own: a pooled item's id only means anything on the board it came from.
  const scores = new Map<string, { plausibility: number | null; impact: number | null }>();
  for (const [groupId, b] of boards) {
    const itemIds = run.items.filter((i) => i.groupId === groupId).map((i) => i.id);
    if (itemIds.length === 0) continue;
    for (const [id, score] of scoresForItems({
      source: run.source,
      week2Cards: b.week2,
      week3Cards: b.week3,
      itemIds,
    })) {
      scores.set(id, score);
    }
  }

  const flips: GroupFlips[] = [];
  for (const [groupId, b] of boards) {
    if (b.week3.length === 0) continue; // no Session 3 board: nothing to say, so say nothing
    flips.push(flipsForBoard(b.week3, groupId));
  }
  // In the run's group order, so every view lists the rooms the same way.
  const order = new Map(run.groups.map((g, i) => [g.id, i]));
  flips.sort((a, b) => (order.get(a.groupId) ?? 99) - (order.get(b.groupId) ?? 99));

  return {
    ok: true,
    analysis: {
      run,
      grid: buildGrid(run.themes, run.groups),
      weights: weightsForThemes(run.themes, scores),
      flips,
      scoredItems: scores.size,
    },
  };
}
