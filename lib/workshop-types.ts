// Client-safe workshop domain types. No server imports.

export type WorkshopMode = "Divergent" | "Convergent" | "Both";
export type SessionStatus = "Draft" | "Open" | "Closed";
export type Lean = "Toward Pole A" | "Toward Pole B" | "Neither / both";
export type ResponseKind = "Upvote submission" | "Outcome reaction" | "Poll answer";

export interface WorkshopSession {
  id: string;
  code: string;
  title: string;
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

export interface OutcomeStat {
  plausibility: { count: number; avg: number | null; dist: Record<number, number> };
  desirability: { count: number; avg: number | null; dist: Record<number, number> };
}

export interface SessionResults {
  session: WorkshopSession;
  participantCount: number;
  submissions: Submission[];
  poleLean: Record<Lean, number>;
  outcomeStats: Record<string, OutcomeStat>;
  submissionCount: number;
  responseCount: number;
  fetchedAt: number;
}

// Uncertainty content shipped to participant devices alongside live results.
export interface SessionContext {
  driverName: string;
  driverId: string | null;
  uncertaintyLabel: string;
  question: string;
  poleA: string;
  poleB: string;
  outcomes: {
    id: string;
    label: string;
    direction: string;
    alignment: string;
    narrative: string;
  }[];
}

export interface SessionView extends SessionResults {
  context: SessionContext | null;
}
