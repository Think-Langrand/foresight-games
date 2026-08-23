import "server-only";

import { supabaseAdmin, supabaseConfigured, withRetry } from "@/lib/supabase";
import { getProjectById } from "@/lib/projects";
import { getScenario } from "@/lib/foresight/client";
import { TEAM_COLORS } from "@/lib/workshop-types";
import { DEFAULT_PROGRAM, isBoardBacked } from "@/lib/exercise-types";
import {
  listExercises,
  createExercise,
  provisionExerciseBoard,
  resnapshotBoardScenario,
  type BoardScenarioCtx,
} from "@/lib/design-group-exercises";

// Server-only data layer for DESIGN GROUPS. Mirrors lib/projects.ts: snake_case row
// + mapper, all reads/writes on supabaseAdmin() (service_role, bypasses RLS) wrapped
// in withRetry. A design group owns ONE scenario and contains a program of EXERCISES
// (weeks) — the board + lock live on each exercise (lib/design-group-exercises.ts),
// not the group. Never import into a client component.

// Thrown by assignScenario when CHANGING a group's scenario would overwrite the
// premise under cards the group has already built on any exercise board. The route
// turns this into a 409 the admin can confirm past (assignScenario(..., { force })).
export class ScenarioHasCardsError extends Error {
  constructor(readonly count: number) {
    super("SCENARIO_HAS_CARDS");
    this.name = "ScenarioHasCardsError";
  }
}

export interface DesignGroup {
  id: string;
  projectId: string;
  name: string;
  sort: number;
  color: string | null;
  scenarioRef: string | null;
  scenarioSetId: string | null;
  scenarioTitle: string | null;
  createdTime: string;
}

interface DesignGroupRow {
  id: string;
  project_id: string;
  name: string;
  sort: number;
  color: string | null;
  scenario_ref: string | null;
  scenario_set_id: string | null;
  scenario_title: string | null;
  created_at: string;
}

const COLS =
  "id, project_id, name, sort, color, scenario_ref, scenario_set_id, scenario_title, created_at";

function fromRow(r: DesignGroupRow): DesignGroup {
  return {
    id: r.id,
    projectId: r.project_id,
    name: r.name ?? "",
    sort: r.sort ?? 0,
    color: r.color ?? null,
    scenarioRef: r.scenario_ref ?? null,
    scenarioSetId: r.scenario_set_id ?? null,
    scenarioTitle: r.scenario_title ?? null,
    createdTime: r.created_at,
  };
}

// ---------- reads ----------
export async function listDesignGroups(projectId: string): Promise<DesignGroup[]> {
  if (!supabaseConfigured()) return [];
  const rows = await withRetry(async () => {
    const { data, error } = await supabaseAdmin()
      .from("design_groups")
      .select(COLS)
      .eq("project_id", projectId)
      .order("sort", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []) as DesignGroupRow[];
  });
  return rows.map(fromRow);
}

export async function getDesignGroup(id: string): Promise<DesignGroup | null> {
  if (!supabaseConfigured()) return null;
  const row = await withRetry(async () => {
    const { data, error } = await supabaseAdmin()
      .from("design_groups")
      .select(COLS)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return (data ?? null) as DesignGroupRow | null;
  });
  return row ? fromRow(row) : null;
}

// Sticky/implication (ripple_cards) counts per session code — the "how much has been
// built" signal. One aggregate query, tallied in memory (mirrors listRippleMaps).
export async function implicationCountsByCode(codes: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const clean = codes.filter(Boolean).map((c) => c.trim().toUpperCase());
  if (clean.length === 0 || !supabaseConfigured()) return counts;
  const rows = await withRetry(async () => {
    const { data, error } = await supabaseAdmin()
      .from("ripple_cards")
      .select("code")
      .in("code", clean);
    if (error) throw error;
    return (data ?? []) as { code: string }[];
  });
  for (const r of rows) counts.set(r.code, (counts.get(r.code) ?? 0) + 1);
  return counts;
}

// ---------- writes ----------
export async function createDesignGroup(input: {
  projectId: string;
  name: string;
  sort?: number;
  color?: string | null;
}): Promise<DesignGroup> {
  const sort = input.sort ?? 0;
  const color = input.color ?? TEAM_COLORS[sort % TEAM_COLORS.length].hex;
  const row = await withRetry(async () => {
    const { data, error } = await supabaseAdmin()
      .from("design_groups")
      .insert({ project_id: input.projectId, name: input.name.trim() || "Group", sort, color })
      .select(COLS)
      .single();
    if (error) throw error;
    return data as DesignGroupRow;
  });
  return fromRow(row);
}

export interface UpdateDesignGroupPatch {
  name?: string;
  sort?: number;
  color?: string | null;
  scenarioRef?: string | null;
  scenarioSetId?: string | null;
  scenarioTitle?: string | null;
}

export async function updateDesignGroup(id: string, patch: UpdateDesignGroupPatch): Promise<void> {
  const fields: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) fields.name = patch.name.trim() || "Group";
  if (patch.sort !== undefined) fields.sort = patch.sort;
  if (patch.color !== undefined) fields.color = patch.color;
  if (patch.scenarioRef !== undefined) fields.scenario_ref = patch.scenarioRef;
  if (patch.scenarioSetId !== undefined) fields.scenario_set_id = patch.scenarioSetId;
  if (patch.scenarioTitle !== undefined) fields.scenario_title = patch.scenarioTitle;
  await withRetry(async () => {
    const { error } = await supabaseAdmin().from("design_groups").update(fields).eq("id", id);
    if (error) throw error;
  });
}

export async function deleteDesignGroup(id: string): Promise<void> {
  await withRetry(async () => {
    const { error } = await supabaseAdmin().from("design_groups").delete().eq("id", id);
    if (error) throw error;
  });
}

// Assign (or re-assign) a scenario to a group. On the FIRST assignment this snapshots
// the scenario onto the group and seeds the default program (Week 1 scenario
// assessment, Week 2 implications, Weeks 3-4 placeholders), provisioning a shared
// board for each board-backed exercise. Re-assigning a DIFFERENT scenario re-points
// the existing boards — but is refused (ScenarioHasCardsError) if any board already
// has cards, unless `force`.
export async function assignScenario(
  groupId: string,
  scenarioRef: string,
  opts: { force?: boolean } = {}
): Promise<void> {
  const group = await getDesignGroup(groupId);
  if (!group) throw new Error("GROUP_NOT_FOUND");
  const project = await getProjectById(group.projectId);
  if (!project) throw new Error("PROJECT_NOT_FOUND");

  const scenario = await getScenario(scenarioRef, project.carmelitaProjectRef);
  if (!scenario) throw new Error("SCENARIO_NOT_FOUND");

  const exercises = await listExercises(groupId);
  const changingScenario = Boolean(group.scenarioRef && group.scenarioRef !== scenario.id);

  // Guard: changing the scenario rewrites every board's premise. Refuse if any board
  // already has cards, unless the admin has confirmed (force).
  if (changingScenario && !opts.force) {
    const codes = exercises.map((e) => e.sessionCode).filter((c): c is string => Boolean(c));
    const counts = await implicationCountsByCode(codes);
    let built = 0;
    for (const n of counts.values()) built += n;
    if (built > 0) throw new ScenarioHasCardsError(built);
  }

  // Persist the scenario on the group.
  await updateDesignGroup(groupId, {
    scenarioRef: scenario.id,
    scenarioSetId: scenario.setId,
    scenarioTitle: scenario.title,
  });

  const ctx: BoardScenarioCtx = {
    projectId: group.projectId,
    scenarioRef: scenario.id,
    carmelitaProjectRef: project.carmelitaProjectRef,
    color: group.color,
  };

  if (exercises.length === 0) {
    // First assignment → seed the default program and provision its boards.
    for (const wk of DEFAULT_PROGRAM) {
      const ex = await createExercise({ groupId, sort: wk.sort, title: wk.title, type: wk.type });
      if (isBoardBacked(wk.type)) await provisionExerciseBoard(ex, ctx);
    }
  } else {
    // Program already exists: provision any missing boards, and (on a scenario
    // change) re-point existing boards at the new premise.
    for (const ex of exercises) {
      if (!ex.sessionCode) {
        if (isBoardBacked(ex.type)) await provisionExerciseBoard(ex, ctx);
      } else if (changingScenario) {
        await resnapshotBoardScenario(ex, ctx);
      }
    }
  }
}
