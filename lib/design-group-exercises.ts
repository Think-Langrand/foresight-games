import "server-only";

import { supabaseAdmin, supabaseConfigured, withRetry } from "@/lib/supabase";
import { getScenario } from "@/lib/foresight/client";
import { createSession, getSessionByCode, updateSession } from "@/lib/workshop";
import { createRippleTeam } from "@/lib/ripples";
import { DEFAULT_RIPPLES_CONFIG } from "@/lib/ripples-types";
import { isBoardBacked, resolveSections, type WorksheetSection } from "@/lib/exercise-types";

// Server-only data layer for design-group EXERCISES (weeks). Mirrors lib/design-
// groups.ts: snake_case row + mapper, all reads/writes on supabaseAdmin() wrapped
// in withRetry. Deliberately does NOT import lib/design-groups (to avoid a cycle) —
// callers pass the group's scenario context into provisioning.

export interface DesignGroupExercise {
  id: string;
  groupId: string;
  sort: number;
  title: string;
  type: string;
  sessionCode: string | null;
  locked: boolean;
  closed: boolean; // admin close — members can't open it (independent of lock + schedule)
  opensAt: string | null;
  sections: WorksheetSection[]; // per-exercise question snapshot; [] = fall back to code template
  // The GROUP's own "we are finished" (migration 0029), not an admin act and not a lock:
  // the board stays editable after it, so a group can still fix a typo in its handoff.
  // `submittedBy` is the display name captured at the moment of the press.
  submittedAt: string | null;
  submittedBy: string | null;
  createdTime: string;
}

interface ExerciseRow {
  id: string;
  group_id: string;
  sort: number;
  title: string;
  type: string;
  session_code: string | null;
  locked: boolean;
  closed: boolean;
  opens_at: string | null;
  sections: unknown; // jsonb
  // Optional, not just nullable: before migration 0029 these columns do not exist at all
  // and the select omits them. See `selectWeeks`.
  submitted_at?: string | null;
  submitted_by?: string | null;
  created_at: string;
}

const BASE_COLS =
  "id, group_id, sort, title, type, session_code, locked, closed, opens_at, sections, created_at";
// Added by migration 0029.
const SUBMIT_COLS = "submitted_at, submitted_by";

// THE BUILD RUNS NO MIGRATIONS (see AGENTS.md), so code can be live before its migration
// is. Without this, a single missing column makes EVERY read of a week fail and takes down
// the whole program section of the app for every group, which is a far worse outcome than a
// missing submit stamp on one step.
//
// Optimistic: the full list is tried first, so once 0029 is applied there is no probe and
// no extra round trip.
//
// AND IT RE-PROBES, which the first version of this got wrong. A latched "missing" flag
// means a server that was running when the migration was applied keeps degrading until
// someone restarts it, and the bug that exposed is nasty: the submit WRITE succeeds, the
// re-read omits the column, and the group is told nothing happened. So the state is a
// deadline rather than a boolean. Cost in the genuinely-missing case is one failed query a
// minute, against a whole process stuck in the wrong mode.
const REPROBE_AFTER_MS = 60_000;
let missingUntil = 0;
const submitColsPresent = () => Date.now() >= missingUntil;
const cols = () => (submitColsPresent() ? `${BASE_COLS}, ${SUBMIT_COLS}` : BASE_COLS);

// TWO codes, because PostgREST reports a missing column differently depending on where it
// appears. A SELECT list reaches Postgres and comes back as 42703 (undefined_column); an
// UPDATE body is validated against PostgREST's own schema cache first and never reaches
// Postgres, giving PGRST204. Checking only one of them was the bug: reads degraded cleanly
// and the submit write still returned a bare "Failed to submit."
const MISSING_COLUMN = new Set(["42703", "PGRST204"]);
const isMissingColumn = (e: unknown) =>
  typeof e === "object" && e !== null && MISSING_COLUMN.has(String((e as { code?: string }).code));

// Run a week select that wants the 0029 columns, retrying once without them if they are
// absent. Every read goes through this so there is one place that knows about the gap.
async function selectWeeks<T>(
  run: (cols: string) => PromiseLike<{ data: unknown; error: unknown }>
): Promise<T | null> {
  let res = await run(cols());
  if (res.error && isMissingColumn(res.error)) {
    const first = submitColsPresent();
    missingUntil = Date.now() + REPROBE_AFTER_MS;
    // Only on the transition, or a database without 0029 would log once a minute forever.
    if (first) {
      console.warn(
        "[design-group-exercises] migration 0029 is not applied on this database; " +
          "reading weeks without the submit stamp. Submitting a week will fail until it is."
      );
    }
    res = await run(cols());
  }
  if (res.error) throw res.error;
  return (res.data ?? null) as T | null;
}

function fromRow(r: ExerciseRow): DesignGroupExercise {
  return {
    id: r.id,
    groupId: r.group_id,
    sort: r.sort ?? 0,
    title: r.title ?? "",
    type: r.type ?? "placeholder",
    sessionCode: r.session_code ?? null,
    locked: r.locked ?? false,
    closed: r.closed ?? false,
    opensAt: r.opens_at ?? null,
    sections: resolveSections(r.sections),
    submittedAt: r.submitted_at ?? null,
    submittedBy: r.submitted_by ?? null,
    createdTime: r.created_at,
  };
}

// ---------- reads ----------
export async function listExercises(groupId: string): Promise<DesignGroupExercise[]> {
  if (!supabaseConfigured()) return [];
  const rows = await withRetry(() =>
    selectWeeks<ExerciseRow[]>((c) =>
      supabaseAdmin()
        .from("design_group_exercises")
        .select(c)
        .eq("group_id", groupId)
        .order("sort", { ascending: true })
        .order("created_at", { ascending: true })
    )
  );
  return (rows ?? []).map(fromRow);
}

// Resolve a week from its BOARD's code. The board-submit route knows only the code in its
// URL, the way every other board route does, and submit is recorded on the week rather
// than on the session — so this is the hop between the two.
//
// maybeSingle, not single: session_code has no unique constraint. In practice one code
// belongs to one week (provisionExerciseBoard mints a fresh one per week), and a duplicate
// would mean a provisioning bug. Erring here rather than picking the first row arbitrarily
// means such a bug surfaces as a 500 with this stack instead of a submit landing on
// whichever week the planner happened to return.
export async function getExerciseBySessionCode(
  code: string
): Promise<DesignGroupExercise | null> {
  if (!supabaseConfigured()) return null;
  const row = await withRetry(() =>
    selectWeeks<ExerciseRow>((c) =>
      supabaseAdmin()
        .from("design_group_exercises")
        .select(c)
        .eq("session_code", code)
        .maybeSingle()
    )
  );
  return row ? fromRow(row) : null;
}

export async function getExercise(id: string): Promise<DesignGroupExercise | null> {
  if (!supabaseConfigured()) return null;
  const row = await withRetry(() =>
    selectWeeks<ExerciseRow>((c) =>
      supabaseAdmin().from("design_group_exercises").select(c).eq("id", id).maybeSingle()
    )
  );
  return row ? fromRow(row) : null;
}

// ---------- writes ----------
export async function createExercise(input: {
  groupId: string;
  sort: number;
  title: string;
  type?: string;
  opensAt?: string | null;
  closed?: boolean;
  sections?: WorksheetSection[]; // template snapshot; coerced before write
}): Promise<DesignGroupExercise> {
  const row = await withRetry(async () => {
    const { data, error } = await supabaseAdmin()
      .from("design_group_exercises")
      .insert({
        group_id: input.groupId,
        sort: input.sort,
        title: input.title.trim() || "Exercise",
        type: input.type ?? "placeholder",
        opens_at: input.opensAt ?? null,
        closed: input.closed ?? false,
        sections: resolveSections(input.sections),
      })
      // BASE_COLS, not cols(): a freshly created week is unsubmitted by definition, so
      // there is nothing to read back, and the client's types need a literal here.
      .select(BASE_COLS)
      .single();
    if (error) throw error;
    return data as ExerciseRow;
  });
  return fromRow(row);
}

export interface UpdateExercisePatch {
  title?: string;
  sort?: number;
  type?: string;
  opensAt?: string | null;
  locked?: boolean;
  closed?: boolean;
  sessionCode?: string | null;
  sections?: WorksheetSection[];
}

export async function updateExercise(id: string, patch: UpdateExercisePatch): Promise<void> {
  const fields: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) fields.title = patch.title.trim() || "Exercise";
  if (patch.sort !== undefined) fields.sort = patch.sort;
  if (patch.type !== undefined) fields.type = patch.type;
  if (patch.opensAt !== undefined) fields.opens_at = patch.opensAt;
  if (patch.locked !== undefined) fields.locked = patch.locked;
  if (patch.closed !== undefined) fields.closed = patch.closed;
  if (patch.sessionCode !== undefined) fields.session_code = patch.sessionCode;
  if (patch.sections !== undefined) fields.sections = resolveSections(patch.sections);
  await withRetry(async () => {
    const { error } = await supabaseAdmin().from("design_group_exercises").update(fields).eq("id", id);
    if (error) throw error;
  });
}

// ---------- the group's own submit (migration 0029) ----------
//
// Not in UpdateExercisePatch on purpose. Everything in that patch is an ADMIN edit made
// from the program editor, and these two columns are written by participants from the
// board's last step. Keeping them out means no admin form can set them by accident, and
// the one place that can is the board-submit route.
//
// Submitting does NOT lock the board. See migration 0029's header for why.
export const MIGRATION_0029_MISSING = "MIGRATION_0029_MISSING";

export async function submitExercise(id: string, by: string): Promise<void> {
  await withRetry(async () => {
    const { error } = await supabaseAdmin()
      .from("design_group_exercises")
      .update({
        submitted_at: new Date().toISOString(),
        submitted_by: by.trim().slice(0, 120) || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    // Unlike a read, a write cannot degrade: there is nowhere to put the stamp. Named so
    // the route can tell the group the truth instead of "something went wrong".
    if (error && isMissingColumn(error)) throw new Error(MIGRATION_0029_MISSING);
    if (error) throw error;
    // The write proves the columns exist, so stop reading without them NOW rather than
    // waiting out the re-probe window. Without this the route's own re-read right after
    // this call can still come back empty and tell the group its submit did not land.
    missingUntil = 0;
  });
}

// Undo. Clears both columns rather than keeping a trail: the control reads
// "Submitted <when> · Undo", so a stale name beside a null timestamp would be a lie about
// a submit that no longer stands.
export async function unsubmitExercise(id: string): Promise<void> {
  await withRetry(async () => {
    const { error } = await supabaseAdmin()
      .from("design_group_exercises")
      .update({ submitted_at: null, submitted_by: null, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error && isMissingColumn(error)) throw new Error(MIGRATION_0029_MISSING);
    if (error) throw error;
    missingUntil = 0;
  });
}

export async function deleteExercise(id: string): Promise<void> {
  await withRetry(async () => {
    const { error } = await supabaseAdmin().from("design_group_exercises").delete().eq("id", id);
    if (error) throw error;
  });
}

export interface BoardScenarioCtx {
  projectId: string;
  scenarioRef: string;
  carmelitaProjectRef: string;
  color?: string | null; // the group's colour, threaded onto its board team
}

// The shared-board Ripples config for an exercise: sharedTeam, self-paced, with the
// scenario premise snapshotted. Same for every board-backed type — only the RENDERER
// differs (implications tree vs worksheet), chosen by exercise.type at the route.
function buildSharedBoardConfig(
  scenario: NonNullable<Awaited<ReturnType<typeof getScenario>>>,
  carmelitaProjectRef: string
): Record<string, unknown> {
  return {
    ...DEFAULT_RIPPLES_CONFIG,
    solo: false,
    sharedTeam: true,
    // Explicit, not inherited: the spread above writes DEFAULT_RIPPLES_CONFIG's `false`
    // into the stored blob, which would defeat resolveConfig's absent-key→sharedTeam
    // fallback and leave NEW boards without the rank step while old ones have it.
    scoringEnabled: true,
    challengeEnabled: false,
    scenarioRef: scenario.id,
    projectRef: carmelitaProjectRef,
    scenarioTitle: scenario.title,
    premise: scenario.body || scenario.teaser || "",
    resolutions: (scenario.linkedUncertainties ?? []).map((u) => ({
      uncertaintyId: u.uncertaintyId,
      title: u.title,
      resolution: u.resolution,
    })),
  };
}

// Provision the shared board for a board-backed exercise: snapshot the group's
// scenario premise into a sharedTeam Ripples session (phase BUILD) and seed its one
// team. Idempotent: skips if the exercise already has a session or isn't board-backed.
// Scenario context is passed in (no lib/design-groups import).
export async function provisionExerciseBoard(
  exercise: DesignGroupExercise,
  ctx: BoardScenarioCtx
): Promise<string | null> {
  if (!isBoardBacked(exercise.type) || exercise.sessionCode) return exercise.sessionCode;

  const scenario = await getScenario(ctx.scenarioRef, ctx.carmelitaProjectRef);
  if (!scenario) throw new Error("SCENARIO_NOT_FOUND");

  const config = buildSharedBoardConfig(scenario, ctx.carmelitaProjectRef);
  const session = await createSession({
    scope: "Ripples",
    uncertaintyId: null,
    mode: "Divergent",
    prompt: scenario.title,
    title: exercise.title || scenario.title,
    projectId: ctx.projectId,
    config,
    phase: "BUILD",
  });
  await createRippleTeam({
    sessionId: session.id,
    code: session.code,
    name: exercise.title || scenario.title,
    color: ctx.color ?? undefined,
  });
  await updateExercise(exercise.id, { sessionCode: session.code });
  return session.code;
}

// Re-point an already-provisioned board at a (new) scenario — used when an admin
// changes the group's scenario after boards exist. Updates the session config premise
// in place; cards stay (the admin has confirmed past the has-cards guard).
export async function resnapshotBoardScenario(
  exercise: DesignGroupExercise,
  ctx: BoardScenarioCtx
): Promise<void> {
  if (!exercise.sessionCode) return;
  const session = await getSessionByCode(exercise.sessionCode);
  if (!session) return;
  const scenario = await getScenario(ctx.scenarioRef, ctx.carmelitaProjectRef);
  if (!scenario) throw new Error("SCENARIO_NOT_FOUND");
  // The cards stay, so the facilitator's summary of them, the theme names saved for the
  // group to read, and the group's edited handoff lead stay too.
  const prior = (session.config ?? {}) as Record<string, unknown>;
  await updateSession(session.id, session.code, {
    config: {
      ...buildSharedBoardConfig(scenario, ctx.carmelitaProjectRef),
      summary: prior.summary ?? null,
      themeIdeas: prior.themeIdeas ?? [],
      execSummary: prior.execSummary ?? null,
    },
    prompt: scenario.title,
  });
}

// Admin lock/unlock a week. Locking moves the backing board to HARVEST (renders the
// output, blocks new cards); unlocking returns it to BUILD. `locked` is also stored
// on the exercise so the schedule/lock status is derivable without the session.
export async function lockExercise(id: string): Promise<void> {
  const ex = await getExercise(id);
  if (!ex) throw new Error("EXERCISE_NOT_FOUND");
  if (ex.sessionCode) {
    const session = await getSessionByCode(ex.sessionCode);
    if (session) await updateSession(session.id, session.code, { phase: "HARVEST", phaseEndsAt: null });
  }
  await updateExercise(id, { locked: true });
}

export async function unlockExercise(id: string): Promise<void> {
  const ex = await getExercise(id);
  if (!ex) throw new Error("EXERCISE_NOT_FOUND");
  if (ex.sessionCode) {
    const session = await getSessionByCode(ex.sessionCode);
    if (session) await updateSession(session.id, session.code, { phase: "BUILD", phaseEndsAt: null });
  }
  await updateExercise(id, { locked: false });
}
