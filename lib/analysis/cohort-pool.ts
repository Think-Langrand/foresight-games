// Pooling every design group's implications for one project into a single list, with the
// provenance needed to read it back apart afterwards.
//
// Server-side (it queries), but it does no model work and writes nothing: the result is
// just "here is the cohort's material, and here is which groups had none".
//
// The page's pool preview and the clustering run call this identically — there is no
// cheaper preview mode, because nothing here is expensive. So the counts a facilitator
// reads before deciding to pay for a run are, by construction, the counts the run uses.

import { listDesignGroups } from "@/lib/design-groups";
import { listExercises } from "@/lib/design-group-exercises";
import { getExerciseType } from "@/lib/exercise-types";
import { listBoardCards } from "@/lib/ripples";
import { implicationSeedCandidates } from "@/lib/synthesis-shape";
import {
  cohortWeeks,
  groupStateFor,
  type CohortGroupInfo,
  type CohortItem,
  type WeekChoice,
} from "./cohort-cluster-shape";

export interface CohortPool {
  weeks: WeekChoice[];
  week: { sort: number; title: string } | null;
  groups: CohortGroupInfo[];
  items: CohortItem[];
  // itemId -> groupId, for deriving provenance after clustering.
  groupOf: Map<string, string>;
}

export interface PoolOptions {
  // Which week to pool. Defaults to the one covering the most groups.
  weekSort?: number;
  // groupId -> exerciseId, for a group holding more than one implications week.
  overrides?: Record<string, string>;
  // Restrict to these groups. Omitted means every group in the project.
  groupIds?: string[];
}

export async function poolCohortImplications(
  projectId: string,
  opts: PoolOptions = {}
): Promise<CohortPool> {
  const all = await listDesignGroups(projectId);
  const wanted = opts.groupIds?.length ? new Set(opts.groupIds) : null;
  const groups = wanted ? all.filter((g) => wanted.has(g.id)) : all;

  // Every group's implications weeks. One query per group, in parallel.
  const perGroup = await Promise.all(
    groups.map(async (g) => ({
      group: g,
      exercises: (await listExercises(g.id))
        .filter((e) => getExerciseType(e.type)?.render === "implications")
        .map((e) => ({ id: e.id, sort: e.sort, title: e.title, sessionCode: e.sessionCode })),
    }))
  );

  const weeks = cohortWeeks(
    perGroup.map((p) => ({ groupId: p.group.id, exercises: p.exercises }))
  );
  const chosen = weeks.find((w) => w.sort === opts.weekSort) ?? weeks[0] ?? null;

  // Which exercise each group contributes at the chosen week. An explicit override wins;
  // otherwise the first at that sort, which is the only one unless a group has a redo.
  const picked = perGroup.map((p) => {
    const atSort = chosen ? p.exercises.filter((e) => e.sort === chosen.sort) : [];
    const override = opts.overrides?.[p.group.id];
    const exercise =
      (override ? atSort.find((e) => e.id === override) : undefined) ?? atSort[0] ?? null;
    return { ...p, exercise };
  });

  // Read the boards. A group whose exercise has no session code has no board to read, so
  // it counts as missing rather than empty — there is nothing there to have been left blank.
  const read = await Promise.all(
    picked.map(async (p) => {
      if (!p.exercise?.sessionCode) return { ...p, candidates: [] };
      const cards = await listBoardCards(p.exercise.sessionCode);
      return { ...p, candidates: implicationSeedCandidates(cards) };
    })
  );

  const items: CohortItem[] = [];
  const groupOf = new Map<string, string>();
  const info: CohortGroupInfo[] = read.map((p) => {
    for (const c of p.candidates) {
      items.push({ id: c.id, text: c.text, keyChange: c.keyChange, groupId: p.group.id });
      groupOf.set(c.id, p.group.id);
    }
    return {
      id: p.group.id,
      name: p.group.name,
      color: p.group.color,
      scenarioTitle: p.group.scenarioTitle,
      itemCount: p.candidates.length,
      state: groupStateFor({
        hasWeek: Boolean(p.exercise?.sessionCode),
        itemCount: p.candidates.length,
      }),
    };
  });

  return {
    weeks,
    week: chosen ? { sort: chosen.sort, title: chosen.title } : null,
    groups: info,
    items,
    groupOf,
  };
}
