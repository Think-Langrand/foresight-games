// Client-safe workshop domain types. No server imports.

export type WorkshopMode = "Divergent" | "Convergent" | "Both";
export type SessionStatus = "Draft" | "Open" | "Closed";
export type Lean = "Toward Pole A" | "Toward Pole B" | "Neither / both";
export type ResponseKind = "Upvote submission" | "Outcome reaction" | "Poll answer";

// A session either works one uncertainty (launched from Explore), the whole
// set, the team card game (draw outcome cards, build scenario triads), a
// solo card game — one person building worlds on their own device, no lobby —
// or the Ripples implications-mapping game (chain causal implications inside a
// scenario, then wager chips). Ripples uses the phase/phaseEndsAt/config fields.
export type SessionScope = "Single" | "Full" | "Cards" | "Solo" | "Ripples";
// For Full sessions: who drives the walk through the uncertainties.
export type Pacing = "Facilitator-paced" | "Participant-paced";

export interface WorkshopSession {
  id: string;
  code: string;
  title: string;
  scope: SessionScope;
  pacing: Pacing | null;
  // The live / current uncertainty (the one, for Single; the facilitator's pointer, for Full).
  uncertaintyId: string | null;
  driverId: string | null;
  mode: WorkshopMode;
  prompt: string;
  status: SessionStatus;
  facilitator: string;
  createdTime: string;
  // null = the global game (shared Supabase deck); set = a per-project game whose
  // deck comes from that project's Carmelita model.
  projectId: string | null;
  // Ripples-only. The facilitator-advanced phase (see RipplePhase), the current
  // timed-phase deadline (null = untimed), and the per-session config jsonb (see
  // RipplesConfig). Other scopes carry the column default ('LOBBY'/null/{}) and
  // ignore these. Typed loosely here to keep this base module free of Ripples
  // imports; the Ripples layer narrows `config` to RipplesConfig.
  phase: string;
  phaseEndsAt: string | null;
  config: Record<string, unknown> | null;
}

export interface Submission {
  id: string;
  text: string;
  author: string;
  lean: Lean | null;
  participantId: string;
  createdTime: string;
  upvotes: number;
}

// Live results for a single uncertainty within a session.
export interface UncertaintyResult {
  submissions: Submission[];
  poleLean: Record<Lean, number>;
  submissionCount: number;
}

export interface SessionResults {
  session: WorkshopSession;
  participantCount: number;
  // Keyed by scenario uncertainty id. A Single session has exactly one entry.
  byUncertainty: Record<string, UncertaintyResult>;
  responseCount: number;
  fetchedAt: number;
}

export type SessionView = SessionResults;

// Static scenario-uncertainty content passed to the live views as a prop (not polled).
export interface ScenarioLite {
  id: string;
  workshopId: string;
  label: string;
  question: string;
  poleA: string;
  poleB: string;
  capabilityDomain: string;
  driverNames: string[];
}

// Empty per-uncertainty result, for uncertainties with no activity yet.
export function emptyUncertaintyResult(): UncertaintyResult {
  return {
    submissions: [],
    poleLean: { "Toward Pole A": 0, "Toward Pole B": 0, "Neither / both": 0 },
    submissionCount: 0,
  };
}

// =====================================================================
// Card game ("Scenario Uncertainties" deck)
// =====================================================================

// Core   = a plausible mainstream outcome (the bulk of the deck).
// Edge   = a complicating / darker outcome; a good triad wants >= 1.
// Wildcard = held out of normal deals; an optional late "stress test".
export type CardRole = "Core" | "Edge" | "Wildcard";

// One outcome card in the deck. Identified by a stable C## id. Each card belongs
// to an uncertainty (its "dimension"); driver linkage lives on the uncertainty
// (sourceDriverIds), sourced from data/uncertainties.seed.json.
export interface Card {
  id: string; // "C01"…"C52"
  uncertaintyId: string; // slug, e.g. "where-trust-lives"
  dimension: string; // the uncertainty title, e.g. "Where trust lives"
  domain: string; // capability domain, e.g. "Ability to See"
  seedingQuestion: string; // the uncertainty's sub-question
  sourceDriverIds: string[]; // driver slugs this uncertainty traces to
  title: string; // "Trust goes local"
  condition: string; // the future condition printed on the card
  role: CardRole;
}

// An uncertainty (a "dimension") with its outcome cards, for the picker board.
export interface UncertaintyLite {
  id: string; // slug
  number: number;
  title: string;
  domain: string; // capability domain (board grouping)
  question: string;
  sourceDriverIds: string[];
  outcomeCodes: string[]; // its 4 card ids
  // May seed slot 1 (curated starters for the global deck; the Carmelita
  // `sharpest` flag for a project deck). Decided in buildDeck where the source is known.
  isStarter: boolean;
}

// Deck for the UI: flat cards, ordered dimensions, and grouped uncertainties.
export interface Deck {
  cards: Card[];
  dimensions: string[]; // distinct dimensions in deck order
  uncertainties: UncertaintyLite[];
  domains: string[]; // deck-derived capability-domain order for the board
}

// Capability-domain order for grouping the uncertainty board (the global deck).
export const DOMAIN_ORDER = [
  "Permission to Act",
  "Capacity to Act",
  "Ability to See",
  "Ability to Speak and Be Believed",
  "Ability to Adapt",
];

// Board grouping order for any deck: the known capability domains first (so the
// global deck's order is unchanged), then any deck-specific domains in first-seen
// order (so a Carmelita project's arbitrary domains still appear, and in a stable
// order). For the global deck this returns exactly DOMAIN_ORDER.
export function orderedDomains(items: { domain: string }[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const d of DOMAIN_ORDER) {
    if (items.some((u) => u.domain === d)) {
      out.push(d);
      seen.add(d);
    }
  }
  for (const u of items) {
    if (u.domain && !seen.has(u.domain)) {
      out.push(u.domain);
      seen.add(u.domain);
    }
  }
  return out;
}

export type TeamStatus = "Drafting" | "Submitted";

// One team within a Cards session. Any number of devices may attach to it;
// they all read/write this same record (last-write-wins on the text fields).
export interface Team {
  id: string;
  code: string; // session code
  name: string;
  color: string; // one of TEAM_COLORS
  seedUncertaintyId: string; // locked slot-1 uncertainty, dealt distinct per team
  seedCardId: string; // the outcome chosen for slot 1 (empty until picked)
  seedLocked: boolean; // true when the facilitator pre-assigned slot 1's outcome
  keptIds: string[]; // the two freely chosen outcomes (slots 2 & 3)
  wildcardId: string | null; // optional stress-test card, once drawn
  // Scenario capture. `convergence` holds the fill-in sentence; the five fields
  // below are the structured "internal logic" (see lib/capture.ts).
  convergence: string;
  worldTitle: string;
  worldDescription: string; // legacy freeform; not surfaced by the current UI
  primaryCondition: string;
  definingCharacteristics: string;
  centralTension: string;
  newNormal: string;
  brokenAssumption: string;
  status: TeamStatus;
  createdTime: string;
  // Facilitator judgement tags for the Analysis view (§5). Nullable; set from
  // the analysis UI, never during play.
  tone?: "hopeful" | "dark" | null;
  family?: string | null;
  // null = a global-game world (render against the shared Supabase deck); set =
  // a per-project world (render against that project's Carmelita deck). This is
  // what card lookups key off — see lib/cards.ts getDeckForProjectId.
  projectId: string | null;
}

// The seed + kept cards form the scenario triad.
export function teamTriadIds(team: Team): string[] {
  return [team.seedCardId, ...team.keptIds].filter(Boolean);
}

// Live view payload for a Cards session (polled by team + present views).
export interface CardsView {
  session: WorkshopSession;
  teams: Team[];
  fetchedAt: number;
}

// Distinct, high-contrast team colours (label + hex) used across the views.
export const TEAM_COLORS: { name: string; hex: string }[] = [
  { name: "Crimson", hex: "#e5484d" },
  { name: "Amber", hex: "#f5a524" },
  { name: "Teal", hex: "#12a594" },
  { name: "Indigo", hex: "#3e63dd" },
  { name: "Violet", hex: "#8e4ec6" },
  { name: "Pink", hex: "#e93d82" },
  { name: "Green", hex: "#30a46c" },
  { name: "Slate", hex: "#7c7f86" },
];

// Deal parameters (kept here so UI copy and server logic agree).
export const HAND_SIZE = 5; // cards drawn into the hand (excludes the seed)
export const KEEP_COUNT = 2; // cards kept from the hand (seed + kept = triad of 3)
