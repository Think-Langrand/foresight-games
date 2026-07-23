import "server-only";

import { supabaseAdmin, supabaseConfigured } from "@/lib/supabase";
import {
  emptyUncertaintyResult,
  type WorkshopMode,
  type SessionStatus,
  type SessionScope,
  type Pacing,
  type Lean,
  type ResponseKind,
  type WorkshopSession,
  type Submission,
  type UncertaintyResult,
  type SessionResults,
} from "@/lib/workshop-types";

export type {
  WorkshopMode,
  SessionStatus,
  SessionScope,
  Pacing,
  Lean,
  ResponseKind,
  WorkshopSession,
  Submission,
  UncertaintyResult,
  SessionResults,
};

// Re-export so existing route imports (`from "@/lib/workshop"`) keep working.
export { supabaseConfigured };

// ---- row shapes (snake_case columns) ----
interface SessionRow {
  id: string;
  code: string;
  title: string;
  scope: string;
  pacing: string | null;
  uncertainty_id: string | null;
  driver_id: string | null;
  mode: string;
  prompt: string;
  status: string;
  facilitator: string;
  created_at: string;
}
interface SubmissionRow {
  id: string;
  uncertainty_id: string | null;
  text: string;
  author: string;
  lean: string | null;
  participant_id: string;
  created_at: string;
}
interface ResponseRow {
  id: string;
  kind: string;
  submission_id: string | null;
  uncertainty_id: string | null;
  poll_key: string;
  value: string;
  value_number: number | null;
  participant_id: string;
  created_at: string;
}

function mapSession(r: SessionRow): WorkshopSession {
  return {
    id: r.id,
    code: r.code,
    title: r.title ?? "",
    scope: (r.scope ?? "Single") as SessionScope,
    pacing: (r.pacing as Pacing) ?? null,
    uncertaintyId: r.uncertainty_id,
    driverId: r.driver_id,
    mode: (r.mode ?? "Divergent") as WorkshopMode,
    prompt: r.prompt ?? "",
    status: (r.status ?? "Open") as SessionStatus,
    facilitator: r.facilitator ?? "",
    createdTime: r.created_at,
  };
}

// ---------- session create / read ----------
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no easily-confused chars

function randomCode(len = 4): string {
  let s = "";
  for (let i = 0; i < len; i++) {
    s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return s;
}

export async function getSessionByCode(
  code: string,
  _opts: { force?: boolean } = {}
): Promise<WorkshopSession | null> {
  const c = code.trim().toUpperCase();
  if (!c) return null;
  const { data, error } = await supabaseAdmin()
    .from("sessions")
    .select("*")
    .eq("code", c)
    .maybeSingle();
  if (error) throw error;
  return data ? mapSession(data as SessionRow) : null;
}

export async function createSession(input: {
  scope: SessionScope;
  pacing?: Pacing | null;
  uncertaintyId: string | null;
  driverId?: string | null;
  mode: WorkshopMode;
  prompt: string;
  title: string;
  facilitator?: string;
}): Promise<WorkshopSession> {
  const db = supabaseAdmin();
  // Insert with a fresh code; retry a few times on the rare unique collision.
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = randomCode();
    const { data, error } = await db
      .from("sessions")
      .insert({
        code,
        title: input.title,
        scope: input.scope,
        pacing: input.pacing ?? null,
        uncertainty_id: input.uncertaintyId,
        driver_id: input.driverId ?? null,
        mode: input.mode,
        prompt: input.prompt,
        status: "Open",
        facilitator: input.facilitator ?? "",
      })
      .select("*")
      .single();
    if (!error) return mapSession(data as SessionRow);
    // 23505 = unique_violation (code already taken) → try another code.
    if ((error as { code?: string }).code !== "23505") throw error;
  }
  throw new Error("Could not allocate a unique session code.");
}

export async function updateSession(
  id: string,
  _code: string,
  patch: Partial<{
    mode: WorkshopMode;
    status: SessionStatus;
    prompt: string;
    currentUncertaintyId: string;
  }>
): Promise<void> {
  const fields: Record<string, unknown> = {};
  if (patch.mode) fields.mode = patch.mode;
  if (patch.status) fields.status = patch.status;
  if (patch.prompt !== undefined) fields.prompt = patch.prompt;
  if (patch.currentUncertaintyId) fields.uncertainty_id = patch.currentUncertaintyId;
  if (Object.keys(fields).length === 0) return;
  const { error } = await supabaseAdmin().from("sessions").update(fields).eq("id", id);
  if (error) throw error;
}

// ---------- submissions / responses (writes) ----------
export async function addSubmission(input: {
  sessionId: string;
  code: string;
  uncertaintyId: string | null;
  text: string;
  author: string;
  lean: Lean | null;
  participantId: string;
}): Promise<Submission> {
  const { data, error } = await supabaseAdmin()
    .from("submissions")
    .insert({
      session_id: input.sessionId,
      code: input.code,
      uncertainty_id: input.uncertaintyId,
      text: input.text,
      author: input.author,
      lean: input.lean,
      participant_id: input.participantId,
    })
    .select("*")
    .single();
  if (error) throw error;
  const r = data as SubmissionRow;
  return {
    id: r.id,
    text: r.text,
    author: r.author,
    lean: (r.lean as Lean) ?? null,
    participantId: r.participant_id,
    createdTime: r.created_at,
    upvotes: 0,
  };
}

export async function addResponse(input: {
  sessionId: string;
  code: string;
  uncertaintyId: string | null;
  participantId: string;
  kind: ResponseKind;
  submissionId?: string | null;
  pollKey?: string;
  value?: string;
  valueNumber?: number | null;
  label?: string;
}): Promise<void> {
  const { error } = await supabaseAdmin().from("responses").insert({
    session_id: input.sessionId,
    code: input.code,
    uncertainty_id: input.uncertaintyId,
    participant_id: input.participantId,
    kind: input.kind,
    submission_id: input.submissionId ?? null,
    poll_key: input.pollKey ?? "",
    value: input.value ?? "",
    value_number: input.valueNumber ?? null,
  });
  if (error) throw error;
}

// Toggle off: remove this participant's upvote(s) for a submission.
export async function removeUpvote(input: {
  code: string;
  participantId: string;
  submissionId: string;
}): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("responses")
    .delete()
    .eq("code", input.code)
    .eq("participant_id", input.participantId)
    .eq("kind", "Upvote submission")
    .eq("submission_id", input.submissionId);
  if (error) throw error;
}

// ---------- aggregation ----------
async function computeResults(session: WorkshopSession): Promise<SessionResults> {
  const db = supabaseAdmin();
  const [subRes, respRes] = await Promise.all([
    db.from("submissions").select("*").eq("code", session.code),
    db.from("responses").select("*").eq("code", session.code),
  ]);
  if (subRes.error) throw subRes.error;
  if (respRes.error) throw respRes.error;

  const subRows = (subRes.data ?? []) as SubmissionRow[];
  const responses = ((respRes.data ?? []) as ResponseRow[])
    // Oldest → newest, so "last write wins" for editable poll answers.
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  // upvote counts per submission — distinct participants (a re-vote never double-counts)
  const upvoters: Record<string, Set<string>> = {};
  for (const r of responses) {
    if (r.kind === "Upvote submission" && r.submission_id) {
      (upvoters[r.submission_id] ??= new Set()).add(r.participant_id);
    }
  }
  const upvotes: Record<string, number> = {};
  for (const [sid, set] of Object.entries(upvoters)) upvotes[sid] = set.size;

  const byUncertainty: Record<string, UncertaintyResult> = {};
  const bucket = (uid: string): UncertaintyResult =>
    (byUncertainty[uid] ??= emptyUncertaintyResult());
  const fallbackUid = session.uncertaintyId ?? "unknown";

  for (const r of subRows) {
    const uid = r.uncertainty_id ?? fallbackUid;
    bucket(uid).submissions.push({
      id: r.id,
      text: r.text,
      author: r.author,
      lean: (r.lean as Lean) ?? null,
      participantId: r.participant_id,
      createdTime: r.created_at,
      upvotes: upvotes[r.id] ?? 0,
    });
  }

  // pole-lean poll, per uncertainty — keep each participant's latest answer only.
  const latestLean = new Map<string, { uid: string; value: Lean }>();
  for (const r of responses) {
    if (r.kind === "Poll answer" && r.poll_key === "pole-lean") {
      const uid = r.uncertainty_id ?? fallbackUid;
      latestLean.set(`${uid}|${r.participant_id}`, { uid, value: r.value as Lean });
    }
  }
  for (const { uid, value } of latestLean.values()) {
    const pl = bucket(uid).poleLean;
    if (value in pl) pl[value]++;
  }

  for (const uid of Object.keys(byUncertainty)) {
    const b = byUncertainty[uid];
    b.submissions.sort(
      (a, c) => c.upvotes - a.upvotes || a.createdTime.localeCompare(c.createdTime)
    );
    b.submissionCount = b.submissions.length;
  }

  const participants = new Set<string>();
  for (const b of Object.values(byUncertainty))
    b.submissions.forEach((s) => s.participantId && participants.add(s.participantId));
  responses.forEach((r) => r.participant_id && participants.add(r.participant_id));

  return {
    session,
    participantCount: participants.size,
    byUncertainty,
    responseCount: responses.length,
    fetchedAt: Date.now(),
  };
}

export async function getSessionResults(
  code: string,
  _opts: { force?: boolean } = {}
): Promise<SessionResults | null> {
  if (!supabaseConfigured()) return null;
  const session = await getSessionByCode(code);
  if (!session) return null;
  return computeResults(session);
}
