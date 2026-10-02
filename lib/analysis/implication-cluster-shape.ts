// Client-safe shaping for implication clustering. No server imports — safe in client
// components, route handlers, and tests. The server side (embeddings + LLM calls) lives in
// lib/analysis/implication-cluster.ts.
//
// Two methods produce the same shape so the panel renders one thing:
//   "llm"       — one model call groups them against criteria the facilitator wrote
//   "embedding" — cosine clustering decides the groups, the model only names them
//
// The difference that matters to a facilitator: criteria steer the GROUPING in the first
// and only the NAMES in the second. The UI has to say so, or they will think their
// criteria were ignored.

export type ClusterMethod = "llm" | "embedding";

export interface ImplicationItem {
  id: string;
  text: string;
  keyChange: string;
}

export interface SuggestedTheme {
  label: string;
  summary: string | null;
  memberIds: string[];
  // Mean intra-cluster cosine. Only the embedding method has one; the LLM does not
  // produce a number we could honestly put here.
  cohesion: number | null;
}

export interface ImplicationClusterResponse {
  method: ClusterMethod;
  criteria: string | null;
  minSimilarity: number | null;
  themes: SuggestedTheme[];
  // Implications no theme claimed. Shown, never hidden — a quietly dropped implication is
  // the failure mode worth seeing.
  ungrouped: string[];
  items: ImplicationItem[]; // so an exported run is self-contained
  model: string;
  generatedAt: string;
  // What had to be corrected on the way. Empty on a clean run.
  notes: string[];
}

// What the model is asked to return, before anything has been checked.
export interface RawGroup {
  label?: unknown;
  summary?: unknown;
  member_ids?: unknown;
}

export function isClusterMethod(v: unknown): v is ClusterMethod {
  return v === "llm" || v === "embedding";
}

// Reconcile what the model said against what is actually on the board.
//
// This is the one genuinely unreliable step in the feature: everything else is arithmetic,
// but a model asked to echo fifty ids can invent one, repeat one, or quietly forget one.
// None of those may reach the caller, because each would mean an implication silently
// vanishing from a facilitator's view of their own group's work.
//
// The guarantee, asserted as a property test: every candidate id appears EXACTLY ONCE
// across themes ∪ ungrouped, and no id appears that was not a candidate. Corrections are
// recorded in `notes` rather than made silently — if the model is dropping a third of the
// board, the facilitator should be told, not shown a tidy result.
export function reconcileLlmGroups(
  candidates: ImplicationItem[],
  rawGroups: RawGroup[]
): { themes: SuggestedTheme[]; ungrouped: string[]; notes: string[] } {
  const known = new Set(candidates.map((c) => c.id));
  const claimed = new Set<string>();
  const notes: string[] = [];
  let unknownCount = 0;
  let duplicateCount = 0;
  let emptyGroups = 0;

  const themes: SuggestedTheme[] = [];
  for (const raw of rawGroups) {
    const ids = Array.isArray(raw.member_ids) ? raw.member_ids : [];
    const memberIds: string[] = [];
    for (const id of ids) {
      if (typeof id !== "string") continue;
      if (!known.has(id)) {
        unknownCount += 1;
        continue;
      }
      // First group to claim an id keeps it — including against itself, which covers the
      // same id listed twice inside one group.
      if (claimed.has(id)) {
        duplicateCount += 1;
        continue;
      }
      claimed.add(id);
      memberIds.push(id);
    }

    if (memberIds.length === 0) {
      emptyGroups += 1;
      continue;
    }
    const label = typeof raw.label === "string" ? raw.label.trim().slice(0, 80) : "";
    const summary = typeof raw.summary === "string" ? raw.summary.trim().slice(0, 240) : "";
    themes.push({
      label: label || "Untitled group",
      summary: summary || null,
      memberIds,
      cohesion: null,
    });
  }

  const ungrouped = candidates.filter((c) => !claimed.has(c.id)).map((c) => c.id);

  if (unknownCount > 0) {
    notes.push(
      `Ignored ${unknownCount} id${unknownCount === 1 ? "" : "s"} the model returned that are not on this board.`
    );
  }
  if (duplicateCount > 0) {
    notes.push(
      `${duplicateCount} implication${duplicateCount === 1 ? " was" : "s were"} listed in more than one group; kept the first.`
    );
  }
  if (emptyGroups > 0) {
    notes.push(`Dropped ${emptyGroups} group${emptyGroups === 1 ? "" : "s"} with no implications left in it.`);
  }
  if (ungrouped.length > 0) {
    notes.push(
      `${ungrouped.length} implication${ungrouped.length === 1 ? "" : "s"} were not placed in any group.`
    );
  }

  return { themes, ungrouped, notes };
}

// The presets the panel offers for the embedding method. Centered cosine on a topical
// corpus runs roughly 0.03–0.18, which is why these are not round numbers — see the
// anisotropy note in lib/analysis/cluster.ts.
export const GROUPING_PRESETS: { key: string; label: string; minSimilarity: number }[] = [
  { key: "broad", label: "Broad — fewer, looser themes", minSimilarity: 0.03 },
  { key: "balanced", label: "Balanced", minSimilarity: 0.1 },
  { key: "tight", label: "Tight — more, sharper themes", minSimilarity: 0.18 },
];
