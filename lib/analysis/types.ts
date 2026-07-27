// Shared types for the scenario-kernel Analysis view.
//
// A KernelEntry is one submitted team world in the flat "export shape" produced
// by the admin JSON export (see components/admin/AdminTeamsManager.tsx) and by
// lib/analysis/from-teams.ts. The analysis layer only ever consumes this shape,
// never the raw Team record, so a future "compare sessions" view can feed it
// arbitrary subsets without touching the store.

export type CardRole = "Core" | "Edge" | "Wildcard";

// Facilitator judgement tags (§5). Both nullable; the UI degrades when absent.
export type Tone = "hopeful" | "dark";
export type Family = string;

export interface KernelCard {
  title: string; // e.g. "Trust goes local"
  role: CardRole;
  dimension: string; // the uncertainty title, e.g. "Where trust lives"
  condition: string; // full outcome text printed on the card
}

// The five narrative "internal logic" fields (convergence is the warm-up line).
export type NarrativeField =
  | "convergence"
  | "definingCharacteristics"
  | "centralTension"
  | "newNormal"
  | "brokenAssumption";

export const NARRATIVE_FIELDS: NarrativeField[] = [
  "convergence",
  "definingCharacteristics",
  "centralTension",
  "newNormal",
  "brokenAssumption",
];

// Human labels for the narrative fields, small-uppercase in the kernel browser.
export const NARRATIVE_LABELS: Record<NarrativeField, string> = {
  convergence: "Convergence chain",
  definingCharacteristics: "Defining characteristics",
  centralTension: "Central tension",
  newNormal: "New normal",
  brokenAssumption: "Broken assumption",
};

export interface KernelEntry {
  code: string; // session code, e.g. "6SJB"
  name: string; // team name
  worldTitle: string;
  status: string; // only "Submitted" is analysed
  convergence: string;
  primaryCondition: string;
  definingCharacteristics: string;
  centralTension: string;
  newNormal: string;
  brokenAssumption: string;
  worldDescription: string;
  createdTime: string; // ISO
  cards: KernelCard[]; // 3 in practice; iterate, don't assume length
  // Optional facilitator tags — present once the DB row has them.
  tone?: Tone | null;
  family?: Family | null;
  // Stable id for tag editing (the underlying Team uuid), when available.
  id?: string;
}

export type ExcludeReason = "gibberish" | "empty-text" | "manual";

export interface CleanResult {
  kept: KernelEntry[];
  excluded: { entry: KernelEntry; reason: ExcludeReason }[];
  nearDuplicateGroups: KernelEntry[][]; // flagged, NOT removed
}

export interface CardStat {
  title: string;
  dimension: string;
  role: CardRole;
  condition: string;
  picks: number;
}

export interface PairStat {
  a: string;
  b: string;
  count: number;
}
