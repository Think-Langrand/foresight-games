// Browser-side calls to the cohort analysis route. The request shape and the error wording
// live here so the views carry neither. The route re-checks the session server-side.

import type { ClusterMethod } from "./implication-cluster-shape";
import type { CohortGroupInfo, ContextMode, WeekChoice } from "./cohort-cluster-shape";
import type { CohortAnalysis } from "./cohort-analysis";
import type { PoolSource } from "./cohort-pool-shape";

export interface AnalysisPreview {
  projectName: string;
  source: PoolSource;
  sourceLabel: string;
  weeks: WeekChoice[];
  week: { sort: number; title: string } | null;
  groups: CohortGroupInfo[];
  itemCount: number;
}

export interface AnalysisRunRequest {
  source: PoolSource;
  method: ClusterMethod;
  context?: ContextMode;
  criteria?: string;
  minSimilarity?: number;
  bridging?: boolean;
  weekSort?: number;
  groupIds?: string[];
  narrative?: boolean;
}

async function json<T>(res: Response, fallback: string): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error || `${fallback} (${res.status}).`);
  return data as T;
}

// What a run would pool, without running it. No model call, so a facilitator can see the
// size of a run before paying for one.
export async function fetchAnalysisPreview(
  projectId: string,
  source: PoolSource,
  weekSort?: number
): Promise<AnalysisPreview> {
  const qs = new URLSearchParams({ source });
  if (weekSort !== undefined) qs.set("weekSort", String(weekSort));
  return json(
    await fetch(`/api/admin/projects/${projectId}/cohort-analysis?${qs}`),
    "Could not read the cohort"
  );
}

export async function runAnalysis(
  projectId: string,
  body: AnalysisRunRequest
): Promise<CohortAnalysis> {
  return json(
    await fetch(`/api/admin/projects/${projectId}/cohort-analysis`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    "Analysis failed"
  );
}
