// Client-safe workshop domain types. No server imports.

export type WorkshopMode = "Divergent" | "Convergent" | "Both";
export type SessionStatus = "Draft" | "Open" | "Closed";
export type Lean = "Toward Pole A" | "Toward Pole B" | "Neither / both";
export type ResponseKind = "Upvote submission" | "Outcome reaction" | "Poll answer";

// A session either works one uncertainty (launched from Explore) or the whole set.
export type SessionScope = "Single" | "Full";
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
