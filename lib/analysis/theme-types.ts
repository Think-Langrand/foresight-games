// Wire types shared by the /api/analysis/cluster route and the Analysis view UI.
// Pure — no server-only imports — so the client can import these for typing the
// fetch response without pulling in the embedding/LLM code.

import type { Tone, NarrativeField } from "./types";

// One outcome card as it appears inside a clustered kernel, carrying its full
// lineage: the uncertainty ("dimension") it answers and the drivers that
// uncertainty traces to.
export interface ThemeCard {
  id: string;
  title: string;
  role: string;
  dimension: string; // uncertainty title
  uncertaintyId: string; // slug
  domain: string; // capability domain
  condition: string; // the future condition printed on the card
  sourceDriverIds: string[]; // driver slugs this uncertainty traces to
}

export interface DriverRef {
  slug: string;
  name: string;
}

// A cluster member with everything about the world, so the UI can expand it and
// the JSON export is self-contained.
export interface ThemeMember {
  id: string;
  code: string;
  name: string;
  worldTitle: string;
  worldDescription: string;
  tone?: Tone | null;
  family?: string | null;
  narrative: Record<NarrativeField, string>; // the five internal-logic fields
  primaryCondition: string;
  cards: ThemeCard[];
}

// A count of something across a cluster (how many member worlds share it).
export interface ThemeTally {
  key: string;
  label: string;
  count: number;
}

export interface ThemeCluster {
  label: string | null; // LLM-coined theme name (null when unlabeled)
  summary: string | null; // one-line description of the shared pattern
  size: number;
  cohesion: number; // mean intra-cluster cosine similarity (centered space)
  members: ThemeMember[];
  // Aggregates across the cluster's members (distinct-member counts).
  dimensions: ThemeTally[]; // uncertainties represented
  drivers: ThemeTally[]; // drivers those uncertainties trace to
  cards: ThemeTally[]; // outcome cards picked
  toneCounts: { hopeful: number; dark: number; untagged: number };
  families: ThemeTally[];
}

export interface ClusterResponse {
  clusters: ThemeCluster[]; // multi-member themes, largest first
  singletons: ThemeMember[]; // kernels that didn't join any theme
  embedded: number; // kernels that had a usable vector
  minSimilarity: number; // centered-cosine threshold actually used
  model: string; // embedding model
  generatedAt: string; // ISO timestamp
  scope: string; // human-readable description of what was clustered
}
