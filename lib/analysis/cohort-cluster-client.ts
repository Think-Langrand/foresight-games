// Browser-side calls to the cohort clustering routes. The request shape and the error
// wording live here so the page carries neither. Both routes re-check the session
// server-side; these helpers only carry the request.

import type { ClusterMethod } from "./implication-cluster-shape";
import type {
  CohortClusterResponse,
  CohortGroupInfo,
  ContextMode,
  WeekChoice,
} from "./cohort-cluster-shape";

export interface CohortPreview {
  projectName: string;
  weeks: WeekChoice[];
  week: { sort: number; title: string } | null;
  groups: CohortGroupInfo[];
  itemCount: number;
}

export interface CohortRunRequest {
  method: ClusterMethod;
  context?: ContextMode;
  criteria?: string;
  promptOverride?: string;
  minSimilarity?: number;
  bridging?: boolean;
  weekSort?: number;
  overrides?: Record<string, string>;
  groupIds?: string[];
  narrative?: boolean;
}

async function json<T>(res: Response, fallback: string): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error || `${fallback} (${res.status}).`);
  return data as T;
}

// What a run would pool, without running it. No model call.
export async function fetchCohortPreview(
  projectId: string,
  weekSort?: number
): Promise<CohortPreview> {
  const qs = weekSort === undefined ? "" : `?weekSort=${weekSort}`;
  return json(
    await fetch(`/api/admin/projects/${projectId}/implications${qs}`),
    "Could not read the cohort"
  );
}

export async function runCohortCluster(
  projectId: string,
  body: CohortRunRequest
): Promise<CohortClusterResponse> {
  return json(
    await fetch(`/api/admin/projects/${projectId}/implications/cluster`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    "Clustering failed"
  );
}
