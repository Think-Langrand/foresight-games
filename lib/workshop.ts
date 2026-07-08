import "server-only";

import {
  listRecords,
  createRecords,
  updateRecords,
  airtableConfigured,
  type AirtableRecord,
} from "@/lib/airtable";
import type {
  WorkshopMode,
  SessionStatus,
  Lean,
  ResponseKind,
  WorkshopSession,
  Submission,
  OutcomeStat,
  SessionResults,
} from "@/lib/workshop-types";

export type {
  WorkshopMode,
  SessionStatus,
  Lean,
  ResponseKind,
  WorkshopSession,
  Submission,
  OutcomeStat,
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
  outcomeId: string | null;
  pollKey: string;
  value: string;
  valueNumber: number | null;
  participantId: string;
}

// ---------- record mappers ----------
function mapSession(r: AirtableRecord): WorkshopSession {
  const f = r.fields as Record<string, unknown>;
  const link = (v: unknown): string | null =>
    Array.isArray(v) && v.length ? (v[0] as string) : null;
  return {
    id: r.id,
    code: (f["Code"] as string) ?? "",
    title: (f["Title"] as string) ?? "",
    uncertaintyId: link(f["Uncertainty"]),
    driverId: link(f["Driver"]),
    mode: ((f["Mode"] as string) ?? "Both") as WorkshopMode,
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
  uncertaintyId: string;
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
    Uncertainty: [input.uncertaintyId],
    Mode: input.mode,
    Prompt: input.prompt,
    Status: "Open",
  };
  if (input.driverId) fields.Driver = [input.driverId];
  if (input.facilitator) fields.Facilitator = input.facilitator;
  const [rec] = await createRecords(WT.sessions, [{ fields }]);
  invalidate(code);
  return mapSession(rec);
}

export async function updateSession(
  id: string,
  code: string,
  patch: Partial<{ mode: WorkshopMode; status: SessionStatus; prompt: string }>
): Promise<void> {
  const fields: Record<string, unknown> = {};
  if (patch.mode) fields.Mode = patch.mode;
  if (patch.status) fields.Status = patch.status;
  if (patch.prompt !== undefined) fields.Prompt = patch.prompt;
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
  if (input.uncertaintyId) fields.Uncertainty = [input.uncertaintyId];
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
  participantId: string;
  kind: ResponseKind;
  submissionId?: string | null;
  outcomeId?: string | null;
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
  if (input.submissionId) fields.Submission = [input.submissionId];
  if (input.outcomeId) fields.Outcome = [input.outcomeId];
  if (input.pollKey) fields["Poll Key"] = input.pollKey;
  if (input.value !== undefined) fields.Value = input.value;
  if (input.valueNumber !== undefined && input.valueNumber !== null)
    fields["Value Number"] = input.valueNumber;
  await createRecords(WT.responses, [{ fields }]);
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

  const responses: WorkshopResponse[] = respRecs.map((r) => {
    const f = r.fields as Record<string, unknown>;
    const link = (v: unknown): string | null =>
      Array.isArray(v) && v.length ? (v[0] as string) : null;
    return {
      id: r.id,
      kind: (f["Kind"] as ResponseKind) ?? "Poll answer",
      submissionId: link(f["Submission"]),
      outcomeId: link(f["Outcome"]),
      pollKey: (f["Poll Key"] as string) ?? "",
      value: (f["Value"] as string) ?? "",
      valueNumber:
        typeof f["Value Number"] === "number" ? (f["Value Number"] as number) : null,
      participantId: (f["Participant ID"] as string) ?? "",
    };
  });

  // upvote counts per submission
  const upvotes: Record<string, number> = {};
  for (const r of responses) {
    if (r.kind === "Upvote submission" && r.submissionId) {
      upvotes[r.submissionId] = (upvotes[r.submissionId] ?? 0) + 1;
    }
  }

  const submissions: Submission[] = subRecs
    .map((r) => {
      const f = r.fields as Record<string, unknown>;
      return {
        id: r.id,
        text: (f["Text"] as string) ?? "",
        author: (f["Author"] as string) ?? "",
        lean: (f["Lean"] as Lean) ?? null,
        participantId: (f["Participant ID"] as string) ?? "",
        createdTime: r.createdTime,
        upvotes: upvotes[r.id] ?? 0,
      };
    })
    .sort((a, b) => b.upvotes - a.upvotes || a.createdTime.localeCompare(b.createdTime));

  // pole-lean poll
  const poleLean: Record<Lean, number> = {
    "Toward Pole A": 0,
    "Toward Pole B": 0,
    "Neither / both": 0,
  };
  for (const r of responses) {
    if (r.kind === "Poll answer" && r.pollKey === "pole-lean") {
      const v = r.value as Lean;
      if (v in poleLean) poleLean[v]++;
    }
  }

  // per-outcome reaction stats
  const outcomeStats: Record<string, OutcomeStat> = {};
  const ensure = (id: string): OutcomeStat => {
    if (!outcomeStats[id])
      outcomeStats[id] = {
        plausibility: { count: 0, avg: null, dist: {} },
        desirability: { count: 0, avg: null, dist: {} },
      };
    return outcomeStats[id];
  };
  for (const r of responses) {
    if (r.kind !== "Outcome reaction" || !r.outcomeId || r.valueNumber === null) continue;
    const stat = ensure(r.outcomeId);
    const bucket =
      r.pollKey === "desirability" ? stat.desirability : stat.plausibility;
    bucket.count++;
    bucket.dist[r.valueNumber] = (bucket.dist[r.valueNumber] ?? 0) + 1;
  }
  for (const id of Object.keys(outcomeStats)) {
    for (const key of ["plausibility", "desirability"] as const) {
      const b = outcomeStats[id][key];
      let sum = 0;
      let n = 0;
      for (const [val, cnt] of Object.entries(b.dist)) {
        sum += Number(val) * cnt;
        n += cnt;
      }
      b.avg = n ? sum / n : null;
    }
  }

  const participants = new Set<string>();
  submissions.forEach((s) => s.participantId && participants.add(s.participantId));
  responses.forEach((r) => r.participantId && participants.add(r.participantId));

  return {
    session,
    participantCount: participants.size,
    submissions,
    poleLean,
    outcomeStats,
    submissionCount: submissions.length,
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
