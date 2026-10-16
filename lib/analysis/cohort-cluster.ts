import "server-only";

import { centerVectors, type LabeledVector } from "./cluster";
import {
  clusterByEmbedding,
  clusterByLlm,
  embedImplications,
} from "./implication-cluster";
import { type ClusterMethod } from "./implication-cluster-shape";
import { poolCohortImplications } from "./cohort-pool";
import { topCrossGroupPairs } from "./cohort-pairs";
import { writeCohortNarrative } from "./cohort-narrative";
import {
  COHORT_PRESETS,
  DEFAULT_COHORT_PRESET,
  deriveCohortThemes,
  scenariosDiffer,
  type CohortClusterResponse,
  type CohortItem,
  type ContextMode,
} from "./cohort-cluster-shape";

// One cohort run, end to end: pool every group's implications, cluster them, derive which
// groups fed each theme, find the cross-group near-duplicates, and optionally write it up.
//
// The route above this is guards and parsing only. Everything that could be wrong about a
// run is here, and the parts that could be wrong about the SHAPE of a run are in
// cohort-cluster-shape.ts under test.
//
// Read-only throughout. Nothing in this path writes a card, a config key or a row.

export interface RunArgs {
  projectId: string;
  projectName: string;
  method: ClusterMethod;
  context: ContextMode;
  criteria: string | null;
  promptOverride: string | null;
  narrative: boolean;
  weekSort?: number;
  overrides?: Record<string, string>;
  groupIds?: string[];
  minSimilarity?: number;
  // Also file each implication under every other theme it fits. Off by default here: it
  // flattens the group tallies the grid is read for. See clusterByEmbedding's note.
  bridging?: boolean;
}

function cohortDefaultSimilarity(): number {
  return COHORT_PRESETS.find((p) => p.key === DEFAULT_COHORT_PRESET)?.minSimilarity ?? 0.02;
}

export type RunResult =
  | { ok: true; response: CohortClusterResponse }
  | { ok: false; status: number; error: string };

export async function runCohortClustering(args: RunArgs): Promise<RunResult> {
  const started = Date.now();
  const pool = await poolCohortImplications(args.projectId, {
    weekSort: args.weekSort,
    overrides: args.overrides,
    groupIds: args.groupIds,
  });

  if (!pool.week)
    return {
      ok: false,
      status: 400,
      error: "No group in this project has an implications week to pool.",
    };

  // Say WHICH groups came up empty, not just that the pool is too small — the facilitator
  // is usually one unopened board away from a working run.
  if (pool.items.length < 2) {
    const missing = pool.groups.filter((g) => g.state === "missing").map((g) => g.name);
    const empty = pool.groups.filter((g) => g.state === "empty").map((g) => g.name);
    const detail = [
      empty.length ? `no implications yet: ${empty.join(", ")}` : null,
      missing.length ? `no board at this week: ${missing.join(", ")}` : null,
    ]
      .filter(Boolean)
      .join("; ");
    return {
      ok: false,
      status: 400,
      error: `The cohort has fewer than two implications at ${pool.week.title}${
        detail ? ` (${detail})` : ""
      }.`,
    };
  }

  const notes: string[] = [];
  const skipped = pool.groups.filter((g) => g.state !== "ok");
  if (skipped.length > 0) {
    notes.push(
      `${skipped.length} group${skipped.length === 1 ? "" : "s"} contributed nothing: ` +
        skipped.map((g) => `${g.name} (${g.state === "missing" ? "no board" : "empty"})`).join(", ")
    );
  }

  // --- context the LLM method may be given ------------------------------------
  // Blind leaves both of these undefined, so the model sees implications and key changes
  // and nothing about which room produced them.
  const nameOf = new Map(pool.groups.map((g) => [g.id, g]));
  const full = args.context === "full";
  const tagOf = full
    ? (item: { id: string }) => {
        const g = nameOf.get(pool.groupOf.get(item.id) ?? "");
        if (!g) return null;
        return g.scenarioTitle ? `group: ${g.name}; scenario: ${g.scenarioTitle}` : `group: ${g.name}`;
      }
    : undefined;
  const contributing = pool.groups.filter((g) => g.state === "ok");
  // Same rule the grid reads, from one place: contributing groups, named scenarios only.
  const scenarios = [
    ...new Set(contributing.map((g) => g.scenarioTitle).filter((s): s is string => Boolean(s))),
  ];
  const differ = scenariosDiffer(pool.groups);
  const preamble = full
    ? `Project: ${args.projectName}\n` +
      `Groups in this cohort: ${contributing.map((g) => g.name).join(", ")}` +
      (differ
        ? `\nThese groups worked from DIFFERENT scenarios: ${scenarios.join("; ")}.`
        : scenarios.length === 1
          ? `\nScenario: ${scenarios[0]}`
          : "")
    : null;

  // --- embed once -------------------------------------------------------------
  // Both the embedding method and the near-duplicate panel need vectors for the same
  // list, so they are computed here and shared. The pair panel is what makes this worth
  // doing: it runs under BOTH methods (so the facilitator does not lose a whole panel by
  // switching), and on the default embedding run it would otherwise re-embed all 269
  // implications that clusterByEmbedding had just embedded.
  //
  // A failure here is not fatal. The LLM method never needed vectors, and the embedding
  // method can still embed them itself; only the pair panel is lost, and it says so.
  let vectors: LabeledVector[] | null = null;
  try {
    vectors = await embedImplications(pool.items);
  } catch (err) {
    console.error("[runCohortClustering] embed", err);
    notes.push("The near-duplicate comparison failed; the themes below are unaffected.");
  }

  // --- cluster ----------------------------------------------------------------
  const clustered =
    args.method === "llm"
      ? await clusterByLlm(pool.items, args.criteria, {
          framing: "cohort",
          promptOverride: args.promptOverride ?? undefined,
          tagOf,
          preamble,
        })
      : await clusterByEmbedding(pool.items, {
          minSimilarity: args.minSimilarity ?? cohortDefaultSimilarity(),
          criteria: args.criteria,
          bridging: args.bridging === true,
          vectors: vectors ?? undefined,
        });

  if (!clustered)
    return { ok: false, status: 502, error: "The model did not return a grouping." };

  const themes = deriveCohortThemes(clustered.themes, pool.groupOf);

  // --- cross-group near-duplicates --------------------------------------------
  // From the vectors embedded above, centered — the threshold only means anything in that
  // space (see the anisotropy note in lib/analysis/cluster.ts).
  const nearDuplicates: CohortClusterResponse["nearDuplicates"] = vectors
    ? topCrossGroupPairs(centerVectors(vectors), pool.groupOf)
    : [];

  // --- the write-up -----------------------------------------------------------
  let narrative: CohortClusterResponse["narrative"] = null;
  if (args.narrative) {
    narrative = await writeCohortNarrative({
      projectName: args.projectName,
      groups: pool.groups,
      items: pool.items,
      themes,
    });
    if (!narrative) notes.push("The write-up could not be generated; the themes are unaffected.");
  }

  return {
    ok: true,
    response: {
      method: args.method,
      criteria: args.criteria,
      promptOverride: args.promptOverride,
      // Recorded as it was ASKED, even though the embedding method ignores it, so a saved
      // or exported run never misreports what produced it.
      context: args.context,
      minSimilarity:
        args.method === "embedding"
          ? (args.minSimilarity ?? cohortDefaultSimilarity())
          : null,
      // Only the embedding path can bridge at all; the LLM decides its own overlaps.
      bridging: args.method === "embedding" ? args.bridging === true : false,
      week: pool.week,
      groups: pool.groups,
      themes,
      ungrouped: clustered.ungrouped,
      nearDuplicates,
      narrative,
      items: pool.items as CohortItem[],
      model: clustered.model,
      generatedAt: clustered.generatedAt,
      elapsedMs: Date.now() - started,
      notes: [...notes, ...clustered.notes],
    },
  };
}
