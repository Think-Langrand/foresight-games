// Browser-side calls to the admin clustering routes, plus the two writes that hang off a
// clustering run: the Week 3 summary and the theme names saved for a group to read. Shared by
// the admin answers page and the live board's rail, so the request shape and the error
// wording live in one place. Every route re-checks the session server-side; these helpers
// only carry the request.

import type {
  ClusterMethod,
  ImplicationClusterResponse,
  SimilarResponse,
} from "./implication-cluster-shape";
import type { SynthesisSummary } from "@/lib/synthesis-summary-shape";
import type { ThemeIdea } from "@/lib/theme-ideas-shape";

export interface ClusterRequest {
  sourceExerciseId: string;
  method: ClusterMethod;
  criteria?: string;
  minSimilarity?: number;
}

export interface SimilarRequest {
  sourceExerciseId: string;
  memberIds: string[]; // Week 2 card ids of the theme's members
  candidateIds: string[]; // Week 2 card ids of what could join
}

async function post<T>(url: string, body: unknown, fallback: string): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error || `${fallback} (${res.status}).`);
  return data as T;
}

export function requestClustering(
  projectId: string,
  groupId: string,
  body: ClusterRequest
): Promise<ImplicationClusterResponse> {
  return post(
    `/api/admin/projects/${projectId}/design-groups/${groupId}/cluster`,
    body,
    "Clustering failed"
  );
}

export function requestSimilar(
  projectId: string,
  groupId: string,
  body: SimilarRequest
): Promise<SimilarResponse> {
  return post(
    `/api/admin/projects/${projectId}/design-groups/${groupId}/similar`,
    body,
    "Suggestions failed"
  );
}

// The Week 3 executive summary. The one admin LLM route that writes: the summary lands on
// the board's config, and realtime carries it to every member.
export function requestSummary(
  projectId: string,
  groupId: string,
  body: { exerciseId: string }
): Promise<{ summary: SynthesisSummary }> {
  return post(
    `/api/admin/projects/${projectId}/design-groups/${groupId}/summary`,
    body,
    "Summary failed"
  );
}

// --- the theme names a group reads -------------------------------------------------------

// Append names from a run. A DELTA, not the whole list: the facilitator's client may not yet
// have heard about a save made from another run, and sending the full list would lose it.
// Both calls return the list as the row now holds it, so the caller sets state from the
// server's answer rather than from an optimistic guess.
export function saveThemeIdeas(
  projectId: string,
  groupId: string,
  body: { exerciseId: string; themes: { label: string; method: ClusterMethod }[] }
): Promise<{ themeIdeas: ThemeIdea[]; added: number; duplicates: number }> {
  return post(
    `/api/admin/projects/${projectId}/design-groups/${groupId}/theme-ideas`,
    body,
    "Saving the theme names failed"
  );
}

export async function removeThemeIdea(
  projectId: string,
  groupId: string,
  body: { exerciseId: string; ideaId: string }
): Promise<{ themeIdeas: ThemeIdea[] }> {
  const qs = new URLSearchParams({ exerciseId: body.exerciseId, ideaId: body.ideaId });
  const res = await fetch(
    `/api/admin/projects/${projectId}/design-groups/${groupId}/theme-ideas?${qs}`,
    { method: "DELETE" }
  );
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error || `Removing the theme name failed (${res.status}).`);
  return data as { themeIdeas: ThemeIdea[] };
}
