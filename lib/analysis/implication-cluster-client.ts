// Browser-side calls to the admin clustering routes. Shared by the admin answers page and
// the live board's rail, so the request shape and the error wording live in one place.
// Every route re-checks the session server-side; these helpers only carry the request.

import type {
  ClusterMethod,
  ImplicationClusterResponse,
  SimilarResponse,
} from "./implication-cluster-shape";

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
