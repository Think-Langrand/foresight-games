import { cosineSimilarity } from "./cluster";
import { CARD_TEXT_MAX } from "@/lib/ripples-types";

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

// A suggested theme is named as a statement about change, which is a whole sentence —
// "Responsibility moves to communities faster than resources do" — and "Use this" writes
// it straight into a theme card's text. So the cap is the card's own, not a chip's: a name
// the model wrote in full should arrive in full. The summary is one sentence of prose and
// gets room to be one.
export const SUGGESTED_LABEL_MAX = CARD_TEXT_MAX;
export const SUGGESTED_SUMMARY_MAX = 600;

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
// Two things are deliberately ALLOWED, because a real group's material works this way:
//
//   • One implication in several themes. "Ten-year plans lock in the preferences of
//     whoever was in the room in year one" is both a legitimacy theme and a planning
//     theme. Forcing a single home throws that away and invents an arbitrary tie-break.
//   • An implication in no theme at all. Outliers are real, and the Week 3 tray already
//     lets a card sit unclustered indefinitely — the suggestion tool should not be
//     stricter than the board it feeds.
//
// What is still corrected, because it is model error rather than intent: an id that is
// not on this board, the same id twice inside ONE theme, and a theme left empty.
//
// The guarantee, asserted as a property test: every id appearing in any theme is a real
// candidate, no theme lists the same id twice, and `ungrouped` is exactly the candidates
// no theme claimed — so themes ∪ ungrouped always covers the whole board. An implication
// can never silently vanish from a facilitator's view of their own group's work, which is
// the one outcome that must stay impossible whatever the model returns.
export function reconcileLlmGroups(
  candidates: ImplicationItem[],
  rawGroups: RawGroup[]
): { themes: SuggestedTheme[]; ungrouped: string[]; notes: string[] } {
  const known = new Set(candidates.map((c) => c.id));
  const claimedAnywhere = new Set<string>();
  const notes: string[] = [];
  let unknownCount = 0;
  let repeatedInGroup = 0;
  let emptyGroups = 0;

  const themes: SuggestedTheme[] = [];
  for (const raw of rawGroups) {
    const ids = Array.isArray(raw.member_ids) ? raw.member_ids : [];
    const memberIds: string[] = [];
    const seenHere = new Set<string>();
    for (const id of ids) {
      if (typeof id !== "string") continue;
      if (!known.has(id)) {
        unknownCount += 1;
        continue;
      }
      // Only within THIS theme. Across themes is a legitimate answer, not a mistake.
      if (seenHere.has(id)) {
        repeatedInGroup += 1;
        continue;
      }
      seenHere.add(id);
      claimedAnywhere.add(id);
      memberIds.push(id);
    }

    if (memberIds.length === 0) {
      emptyGroups += 1;
      continue;
    }
    const label = typeof raw.label === "string" ? raw.label.trim().slice(0, SUGGESTED_LABEL_MAX) : "";
    const summary =
      typeof raw.summary === "string" ? raw.summary.trim().slice(0, SUGGESTED_SUMMARY_MAX) : "";
    themes.push({
      label: label || "Untitled group",
      summary: summary || null,
      memberIds,
      cohesion: null,
    });
  }

  const ungrouped = candidates.filter((c) => !claimedAnywhere.has(c.id)).map((c) => c.id);

  if (unknownCount > 0) {
    notes.push(
      `Ignored ${unknownCount} id${unknownCount === 1 ? "" : "s"} the model returned that are not on this board.`
    );
  }
  if (repeatedInGroup > 0) {
    notes.push(
      `Removed ${repeatedInGroup} repeat${repeatedInGroup === 1 ? "" : "s"} of the same implication inside one theme.`
    );
  }
  if (emptyGroups > 0) {
    notes.push(`Dropped ${emptyGroups} theme${emptyGroups === 1 ? "" : "s"} with no implications in it.`);
  }

  return { themes, ungrouped, notes };
}

// How many themes each implication ended up in, so the panel can mark the ones that
// bridge. A bridging implication is usually the interesting one in the room.
export function membershipCounts(themes: SuggestedTheme[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const t of themes) {
    for (const id of t.memberIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

// Agglomerative clustering is strictly partitional — clusterVectors puts every id in
// exactly one cluster, by construction. That is the right answer for "which cluster does
// this belong to most" and the wrong one for "which themes does this speak to", so this
// adds a second pass: an implication also joins any OTHER theme whose centroid it sits at
// least as close to as the threshold that built the themes in the first place.
//
// Without this the two methods would not be comparable — one could bridge and the other
// could not, and the facilitator would read that as a difference in the material.
//
// `points` must be the SAME vectors the clustering saw (centered, if it centered), or the
// centroids are computed in a different space from the one the threshold was tuned for.
export function secondaryMemberships(
  clusters: { ids: string[] }[],
  points: { id: string; vector: number[] }[],
  minSimilarity: number
): string[][] {
  const byId = new Map(points.map((p) => [p.id, p.vector]));

  const centroids = clusters.map((c) => {
    const vecs = c.ids.map((id) => byId.get(id)).filter((v): v is number[] => Boolean(v));
    if (vecs.length === 0) return null;
    const dim = vecs[0].length;
    const mean = new Array<number>(dim).fill(0);
    for (const v of vecs) for (let i = 0; i < dim; i++) mean[i] += v[i];
    for (let i = 0; i < dim; i++) mean[i] /= vecs.length;
    return mean;
  });

  return clusters.map((c, k) => {
    const centroid = centroids[k];
    if (!centroid) return [];
    const already = new Set(c.ids);
    const extra: string[] = [];
    for (const p of points) {
      if (already.has(p.id)) continue;
      if (cosineSimilarity(p.vector, centroid) >= minSimilarity) extra.push(p.id);
    }
    return extra;
  });
}

// The presets the panel offers for the embedding method. Centered cosine on a topical
// corpus runs roughly 0.03–0.18, which is why these are not round numbers — see the
// anisotropy note in lib/analysis/cluster.ts.
export const GROUPING_PRESETS: { key: string; label: string; minSimilarity: number }[] = [
  { key: "broad", label: "Broad — fewer, looser themes", minSimilarity: 0.03 },
  { key: "balanced", label: "Balanced", minSimilarity: 0.1 },
  { key: "tight", label: "Tight — more, sharper themes", minSimilarity: 0.18 },
];

// --- "what else could join this theme?" ------------------------------------------

export interface RankedCandidate {
  id: string;
  score: number;
}

export interface SimilarResponse {
  ranked: RankedCandidate[]; // closest first
  // Ids the caller asked about that were not on the board or could not be embedded.
  skipped: string[];
  model: string;
}

// Every candidate ranked by cosine to the centroid of a theme's members, closest first.
// Same centroid arithmetic as secondaryMemberships, but a RANKING rather than a threshold:
// the person reading it decides where to stop, which is the right call for "find me more"
// where a threshold tuned for clustering would often return nothing at all.
//
// `members` and `candidates` should be in the same (centered) space — see the note on
// secondaryMemberships. A candidate that is also a member is skipped rather than returned
// with a flattering score.
export function rankByCentroid(
  members: { id: string; vector: number[] }[],
  candidates: { id: string; vector: number[] }[]
): RankedCandidate[] {
  if (members.length === 0) return [];
  const dim = members[0].vector.length;
  const centroid = new Array<number>(dim).fill(0);
  for (const m of members) for (let i = 0; i < dim; i++) centroid[i] += m.vector[i];
  for (let i = 0; i < dim; i++) centroid[i] /= members.length;

  const already = new Set(members.map((m) => m.id));
  return candidates
    .filter((c) => !already.has(c.id))
    .map((c) => ({ id: c.id, score: cosineSimilarity(c.vector, centroid) }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

// --- the board's admin tools (step 1) --------------------------------------------
// What a signed-in facilitator needs to run the clustering tool from the live board: the
// ids the admin routes are keyed on and the implications weeks they can read. Built on the
// server page, where the session is known, and absent for members. The client cannot tell
// an admin from a member on its own (the auth cookie is httpOnly), so this object's
// presence IS the flag — and every route it points at re-checks the session anyway.
export interface AdminTools {
  projectId: string;
  groupId: string;
  exerciseId: string; // this week — what the summary route is asked to read
  clusterSources: { exerciseId: string; title: string; count: number }[];
}
