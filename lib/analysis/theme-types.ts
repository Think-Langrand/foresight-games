// Wire types shared by the /api/analysis/cluster route and the Analysis view UI.
// Pure — no server-only imports — so the client can import these for typing the
// fetch response without pulling in the embedding/LLM code.

import type { Tone } from "./types";

export interface ThemeMember {
  id: string;
  worldTitle: string;
  code: string;
  name: string;
  family?: string | null;
  tone?: Tone | null;
}

export interface ThemeCluster {
  label: string | null; // LLM-coined theme name (null when unlabeled)
  summary: string | null; // one-line description of the shared pattern
  size: number;
  cohesion: number; // mean intra-cluster cosine similarity, 0–1
  members: ThemeMember[];
}

export interface ClusterResponse {
  clusters: ThemeCluster[]; // multi-member themes, largest first
  singletons: ThemeMember[]; // kernels that didn't join any theme
  embedded: number; // kernels that had a usable vector
  minSimilarity: number; // threshold actually used
}
