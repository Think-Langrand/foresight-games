import "server-only";

import {
  listRecords,
  createRecords,
  updateRecords,
  deleteRecords,
  airtableConfigured,
  type AirtableRecord,
} from "@/lib/airtable";
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

// ---- Workshop table + field ids (created by the app in base appJbrDG28mXRJgfA) ----
export const WT = {
  sessions: "tblSyzgYjFOJ9YvaP",
  submissions: "tblbSs9hkz2TQIIcr",
  responses: "tblv4bFOOJqCY0z0N",
} as const;

interface WorkshopResponse {
  id: string;
  kind: ResponseKind;
  submissionId: string | null;
  uncertaintyId: string | null;
  pollKey: string;
  value: string;
  valueNumber: number | null;
  participantId: string;
  createdTime: string;
}

const link = (v: unknown): string | null =>
  Array.isArray(v) && v.length ? (v[0] as string) : null;

// ---------- record mappers ----------
function mapSession(r: AirtableRecord): WorkshopSession {
  const f = r.fields as Record<string, unknown>;
  return {
    id: r.id,
    code: (f["Code"] as string) ?? "",
    title: (f["Title"] as string) ?? "",
    scope: ((f["Scope"] as string) ?? "Single") as SessionScope,
    pacing: (f["Pacing"] as Pacing) ?? null,
    // Current / the uncertainty (falls back to the legacy driver-level link).
    uncertaintyId: link(f["Scenario Uncertainty"]) ?? link(f["Uncertainty"]),
    driverId: link(f["Driver"]),
    mode: ((f["Mode"] as string) ?? "Divergent") as WorkshopMode,
    prompt: (f["Prompt"] as string) ?? "",
    status: ((f["Status"] as string) ?? "Open") as SessionStatus,
    facilitator: (f["Facilitator"] as string) ?? "",
    createdTime: r.createdTime,
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

export async function getSessionByCode(code: string): Promise<WorkshopSession | null> {
  const c = code.trim().toUpperCase();
  if (!c) return null;
  const recs = await listRecords(WT.sessions, {
    filterByFormula: `UPPER({Code})='${c}'`,
    maxRecords: 1,
    revalidate: false,
  });
  return recs[0] ? mapSession(recs[0]) : null;
}

export async function createSession(input: {
  scope: SessionScope;
  pacing?: Pacing | null;
  uncertaintyId: string | null; // the one (Single) or the starting current (Full)
  driverId?: string | null;
  mode: WorkshopMode;
  prompt: string;
  title: string;
  facilitator?: string;
}): Promise<WorkshopSession> {
  // Find a free code (retry a few times on the rare collision).
  let code = randomCode();
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await getSessionByCode(code);
    if (!existing) break;
    code = randomCode();
  }
  const fields: Record<string, unknown> = {
    Title: input.title,
    Code: code,
    Scope: input.scope,
    Mode: input.mode,
    Prompt: input.prompt,
    Status: "Open",
  };
  if (input.uncertaintyId) fields["Scenario Uncertainty"] = [input.uncertaintyId];
  if (input.pacing) fields.Pacing = input.pacing;
  if (input.driverId) fields.Driver = [input.driverId];
  if (input.facilitator) fields.Facilitator = input.facilitator;
  const [rec] = await createRecords(WT.sessions, [{ fields }]);
  invalidate(code);
  return mapSession(rec);
}

export async function updateSession(
  id: string,
  code: string,
  patch: Partial<{
    mode: WorkshopMode;
    status: SessionStatus;
    prompt: string;
    currentUncertaintyId: string; // advance the facilitator's pointer
  }>
): Promise<void> {
  const fields: Record<string, unknown> = {};
  if (patch.mode) fields.Mode = patch.mode;
  if (patch.status) fields.Status = patch.status;
  if (patch.prompt !== undefined) fields.Prompt = patch.prompt;
  if (patch.currentUncertaintyId)
    fields["Scenario Uncertainty"] = [patch.currentUncertaintyId];
  if (Object.keys(fields).length === 0) return;
  await updateRecords(WT.sessions, [{ id, fields }]);
  invalidate(code);
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
  const fields: Record<string, unknown> = {
    Text: input.text,
    Session: [input.sessionId],
    "Session Code": input.code,
    Author: input.author,
    "Participant ID": input.participantId,
    Upvotes: 0,
  };
  if (input.uncertaintyId) fields["Scenario Uncertainty"] = [input.uncertaintyId];
  if (input.lean) fields.Lean = input.lean;
  const [rec] = await createRecords(WT.submissions, [{ fields }]);
  invalidate(input.code);
  const f = rec.fields as Record<string, unknown>;
  return {
    id: rec.id,
    text: (f["Text"] as string) ?? input.text,
    author: input.author,
    lean: input.lean,
    participantId: input.participantId,
    createdTime: rec.createdTime,
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
  const fields: Record<string, unknown> = {
    Label: input.label ?? `${input.kind} · ${input.participantId.slice(0, 6)}`,
    Session: [input.sessionId],
    "Session Code": input.code,
    "Participant ID": input.participantId,
    Kind: input.kind,
  };
  if (input.uncertaintyId) fields["Scenario Uncertainty"] = [input.uncertaintyId];
  if (input.submissionId) fields.Submission = [input.submissionId];
  if (input.pollKey) fields["Poll Key"] = input.pollKey;
  if (input.value !== undefined) fields.Value = input.value;
  if (input.valueNumber !== undefined && input.valueNumber !== null)
    fields["Value Number"] = input.valueNumber;
  await createRecords(WT.responses, [{ fields }]);
  invalidate(input.code);
}

// Toggle off: remove this participant's upvote(s) for a submission.
export async function removeUpvote(input: {
  code: string;
  participantId: string;
  submissionId: string;
}): Promise<void> {
  const recs = await listRecords(WT.responses, {
    filterByFormula: `AND({Session Code}='${input.code}', {Participant ID}='${input.participantId}', {Kind}='Upvote submission')`,
    revalidate: false,
  });
  const ids = recs
    .filter((r) => link((r.fields as Record<string, unknown>)["Submission"]) === input.submissionId)
    .map((r) => r.id);
  if (ids.length) await deleteRecords(WT.responses, ids);
  invalidate(input.code);
}

// ---------- aggregation ----------
async function computeResults(session: WorkshopSession): Promise<SessionResults> {
  const [subRecs, respRecs] = await Promise.all([
    listRecords(WT.submissions, {
      filterByFormula: `{Session Code}='${session.code}'`,
      revalidate: false,
    }),
    listRecords(WT.responses, {
      filterByFormula: `{Session Code}='${session.code}'`,
      revalidate: false,
    }),
  ]);

  const responses: WorkshopResponse[] = respRecs
    .map((r) => {
      const f = r.fields as Record<string, unknown>;
      return {
        id: r.id,
        kind: (f["Kind"] as ResponseKind) ?? "Poll answer",
        submissionId: link(f["Submission"]),
        uncertaintyId: link(f["Scenario Uncertainty"]),
        pollKey: (f["Poll Key"] as string) ?? "",
        value: (f["Value"] as string) ?? "",
        valueNumber:
          typeof f["Value Number"] === "number" ? (f["Value Number"] as number) : null,
        participantId: (f["Participant ID"] as string) ?? "",
        createdTime: r.createdTime,
      };
    })
    // Oldest → newest, so "last write wins" for editable poll answers.
    .sort((a, b) => a.createdTime.localeCompare(b.createdTime));

  // upvote counts per submission — distinct participants (so a re-vote never double-counts)
  const upvoters: Record<string, Set<string>> = {};
  for (const r of responses) {
    if (r.kind === "Upvote submission" && r.submissionId) {
      (upvoters[r.submissionId] ??= new Set()).add(r.participantId);
    }
  }
  const upvotes: Record<string, number> = {};
  for (const [sid, set] of Object.entries(upvoters)) upvotes[sid] = set.size;

  const byUncertainty: Record<string, UncertaintyResult> = {};
  const bucket = (uid: string): UncertaintyResult => {
    if (!byUncertainty[uid]) byUncertainty[uid] = emptyUncertaintyResult();
    return byUncertainty[uid];
  };
  // Fallback uncertainty for records created before per-uncertainty tagging.
  const fallbackUid = session.uncertaintyId ?? "unknown";

  for (const r of subRecs) {
    const f = r.fields as Record<string, unknown>;
    const uid = link(f["Scenario Uncertainty"]) ?? fallbackUid;
    bucket(uid).submissions.push({
      id: r.id,
      text: (f["Text"] as string) ?? "",
      author: (f["Author"] as string) ?? "",
      lean: (f["Lean"] as Lean) ?? null,
      participantId: (f["Participant ID"] as string) ?? "",
      createdTime: r.createdTime,
      upvotes: upvotes[r.id] ?? 0,
    });
  }

  // pole-lean poll, per uncertainty — keep each participant's latest answer only
  // (responses are sorted oldest→newest, so the last one written wins).
  const latestLean = new Map<string, { uid: string; value: Lean }>();
  for (const r of responses) {
    if (r.kind === "Poll answer" && r.pollKey === "pole-lean") {
      const uid = r.uncertaintyId ?? fallbackUid;
      latestLean.set(`${uid}|${r.participantId}`, { uid, value: r.value as Lean });
    }
  }
  for (const { uid, value } of latestLean.values()) {
    const pl = bucket(uid).poleLean;
    if (value in pl) pl[value]++;
  }

  // sort + counts per uncertainty
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
  responses.forEach((r) => r.participantId && participants.add(r.participantId));

  return {
    session,
    participantCount: participants.size,
    byUncertainty,
    responseCount: responses.length,
    fetchedAt: Date.now(),
  };
}

// ---------- single-flight cache (shields Airtable from poll storms) ----------
const TTL_MS = 1500;
type CacheEntry = { at: number; promise: Promise<SessionResults> };
const cache = new Map<string, CacheEntry>();

function invalidate(code: string) {
  cache.delete(code.toUpperCase());
}

export async function getSessionResults(
  code: string,
  opts: { force?: boolean } = {}
): Promise<SessionResults | null> {
  if (!airtableConfigured()) return null;
  const key = code.trim().toUpperCase();
  const now = Date.now();
  const hit = cache.get(key);
  if (!opts.force && hit && now - hit.at < TTL_MS) {
    return hit.promise;
  }
  const promise = (async () => {
    const session = await getSessionByCode(key);
    if (!session) throw new Error("session-not-found");
    return computeResults(session);
  })();
  cache.set(key, { at: now, promise });
  try {
    return await promise;
  } catch (err) {
    cache.delete(key);
    if (err instanceof Error && err.message === "session-not-found") return null;
    throw err;
  }
}
