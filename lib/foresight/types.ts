// Client-safe types for the external Foresight / Carmelita "scenario display" API.
// Mirrors the payload shapes in docs/docs/api-ingestion.md §6, validated against the
// live nnphi project. NO server imports — safe to use in client components.
//
// These are NEW types for the published-scenario down-flow; they intentionally do
// not reuse lib/types.ts (the game's own driver/uncertainty/outcome model), whose
// shapes are unrelated to this API.

export type ScenarioFormat = "appendix" | "compact";

export interface Theme {
  slug: string;
  label: string;
}

export interface Mood {
  label: string;
  colorHex: string;
  emotionalRegister: string;
}

export interface TimeHorizon {
  year: number;
  // The API returns null here in practice — fall back to String(year) when rendering.
  label: string | null;
}

export interface SharedUncertainty {
  axis: string;
  outcomes: string[];
  resolution: string;
}

export interface EarlySignalSource {
  url: string;
  label: string;
}

export interface EarlySignal {
  statement: string;
  sources: EarlySignalSource[];
}

export interface ScenarioImage {
  // Signed URL, resolved at read time and time-limited — may be null (§7).
  url: string | null;
  prompt: string;
  position: number;
  source: "uploaded" | "generated";
}

export interface LinkedDriver {
  driverId: string;
  name: string;
}

export interface LinkedUncertainty {
  uncertaintyId: string;
  title: string;
  resolution: string;
}

// §5.1 — lightweight set summary for the index grid.
export interface ScenarioSetSummary {
  id: string; // uuid
  domain: string; // the set's display title
  horizonYear: number;
  format: ScenarioFormat;
  sharedUncertainties: SharedUncertainty[];
  scenarioCount: number;
  updatedAt: string; // ISO 8601, no timezone suffix
}

// §5.2 scenarios[] / §5.3 — lightweight card for grids.
export interface ScenarioCard {
  id: string; // SLUG — this is the {scenarioRef} for §5.4
  setId: string;
  position: number;
  title: string;
  headline: string;
  teaser: string;
  theme: Theme;
  mood: Mood;
  icon: string; // Lucide-style id; no icon set installed yet, so unused for now
  timeHorizon: TimeHorizon;
  coverImageUrl: string | null; // signed, expiring, often null
  updatedAt: string;
}

// §5.2 top-level — a set with its scenario cards. Note: no `scenarioCount` here
// (that lives only on the summary); `updatedAt` is present in practice.
export interface ScenarioSet {
  id: string;
  domain: string;
  horizonYear: number;
  format: ScenarioFormat;
  sharedUncertainties: SharedUncertainty[];
  scenarios: ScenarioCard[];
  updatedAt?: string;
}

// §5.4 — the full scenario: everything on the card MINUS coverImageUrl, PLUS the body.
export interface Scenario {
  id: string; // slug — the stable public ref
  setId: string;
  title: string;
  headline: string;
  teaser: string;
  theme: Theme;
  mood: Mood;
  icon: string;
  timeHorizon: TimeHorizon;
  format: ScenarioFormat;
  body: string; // Markdown
  openQuestion: string;
  earlySignals: EarlySignal[];
  images: ScenarioImage[];
  linkedDrivers: LinkedDriver[];
  linkedUncertainties: LinkedUncertainty[];
  // Flexible bag of interim house-style prose; keys/shapes NOT final — render
  // defensively (may be {}). Values may be strings or small objects.
  sections: Record<string, unknown>;
  updatedAt: string;
}
