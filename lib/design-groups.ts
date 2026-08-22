import "server-only";

import { supabaseAdmin, supabaseConfigured, withRetry } from "@/lib/supabase";
import { getProjectById } from "@/lib/projects";
import { getScenario } from "@/lib/foresight/client";
import { createSession, getSessionByCode, updateSession } from "@/lib/workshop";
import { createRippleTeam } from "@/lib/ripples";
import { DEFAULT_RIPPLES_CONFIG } from "@/lib/ripples-types";
import { TEAM_COLORS } from "@/lib/workshop-types";

// Server-only data layer for DESIGN GROUPS (migration 0011). Mirrors lib/projects.ts:
// snake_case row + mapper, all reads/writes on supabaseAdmin() (service_role, bypasses
// RLS) wrapped in withRetry. A design group owns one scenario and is backed by one
// shared-board Ripples session (config.sharedTeam). Never import into a client component.

export type DesignGroupStatus = "DRAFT" | "OPEN" | "FINALIZED";

// Thrown by assignScenario when CHANGING a group's scenario would overwrite the
// premise under implications the group has already built. The route turns this into
// a 409 the admin can confirm past (assignScenario(..., { force: true })).
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
  sessionCode: string | null;
  status: DesignGroupStatus;
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
  session_code: string | null;
  status: string;
  created_at: string;
}

const COLS =
  "id, project_id, name, sort, color, scenario_ref, scenario_set_id, scenario_title, session_code, status, created_at";

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
    sessionCode: r.session_code ?? null,
    status: (r.status ?? "DRAFT") as DesignGroupStatus,
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

// Implication (ripple_cards) counts per session code — the "how much has this group
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
  sessionCode?: string | null;
  status?: DesignGroupStatus;
}

export async function updateDesignGroup(id: string, patch: UpdateDesignGroupPatch): Promise<void> {
  const fields: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) fields.name = patch.name.trim() || "Group";
  if (patch.sort !== undefined) fields.sort = patch.sort;
  if (patch.color !== undefined) fields.color = patch.color;
  if (patch.scenarioRef !== undefined) fields.scenario_ref = patch.scenarioRef;
  if (patch.scenarioSetId !== undefined) fields.scenario_set_id = patch.scenarioSetId;
  if (patch.scenarioTitle !== undefined) fields.scenario_title = patch.scenarioTitle;
  if (patch.sessionCode !== undefined) fields.session_code = patch.sessionCode;
  if (patch.status !== undefined) fields.status = patch.status;
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

// Assign (or re-assign) a scenario to a group and PROVISION its shared board:
// snapshot the scenario premise into a sharedTeam Ripples session (phase BUILD),
// pre-seed the one board, and record the session code on the group. Reuses the
// group's existing session on re-assign (updates its config in place).
export async function assignScenario(
  groupId: string,
  scenarioRef: string,
  opts: { force?: boolean } = {}
): Promise<string> {
  const group = await getDesignGroup(groupId);
  if (!group) throw new Error("GROUP_NOT_FOUND");
  const project = await getProjectById(group.projectId);
  if (!project) throw new Error("PROJECT_NOT_FOUND");

  const scenario = await getScenario(scenarioRef, project.carmelitaProjectRef);
  if (!scenario) throw new Error("SCENARIO_NOT_FOUND");

  // Guard: changing the scenario rewrites the premise. If the group has already
  // built implications on its current scenario, refuse unless forced — so an admin
  // never silently swaps the premise out from under real work. (Re-assigning the
  // SAME scenario, or a group with an empty board, passes straight through.)
  const changingScenario = group.scenarioRef && group.scenarioRef !== scenario.id;
  if (group.sessionCode && changingScenario && !opts.force) {
    const counts = await implicationCountsByCode([group.sessionCode]);
    const built = counts.get(group.sessionCode.toUpperCase()) ?? 0;
    if (built > 0) throw new ScenarioHasCardsError(built);
  }

  const config = {
    ...DEFAULT_RIPPLES_CONFIG,
    // Shared, self-paced group board: no solo per-device board, no per-member
    // challenge vote (a facilitated group mechanic), everyone on one team.
    solo: false,
    sharedTeam: true,
    challengeEnabled: false,
    scenarioRef: scenario.id,
    projectRef: project.carmelitaProjectRef,
    scenarioTitle: scenario.title,
    premise: scenario.body || scenario.teaser || "",
    resolutions: (scenario.linkedUncertainties ?? []).map((u) => ({
      uncertaintyId: u.uncertaintyId,
      title: u.title,
      resolution: u.resolution,
    })),
  };

  // Reuse the group's session if it still exists; otherwise mint a new one.
  let session = group.sessionCode ? await getSessionByCode(group.sessionCode) : null;
  if (session) {
    await updateSession(session.id, session.code, {
      config: config as unknown as Record<string, unknown>,
      phase: "BUILD",
      status: "Open",
      prompt: scenario.title,
    });
  } else {
    session = await createSession({
      scope: "Ripples",
      uncertaintyId: null,
      mode: "Divergent",
      prompt: scenario.title,
      title: scenario.title || group.name,
      projectId: group.projectId,
      config: config as unknown as Record<string, unknown>,
      phase: "BUILD",
    });
  }
  // Ensure the one shared board exists (idempotent — skips if already seeded).
  await createRippleTeam({
    sessionId: session.id,
    code: session.code,
    name: group.name,
    color: group.color ?? undefined,
  });

  await updateDesignGroup(groupId, {
    scenarioRef: scenario.id,
    scenarioSetId: scenario.setId,
    scenarioTitle: scenario.title,
    sessionCode: session.code,
    status: "OPEN",
  });
  return session.code;
}

// Admin "submit": lock the group's map into its output. Moving the backing session
// to HARVEST renders the finished map and stops new implications (adds require the
// BUILD phase). Status stays Open so members can still open and view the result.
export async function finalizeDesignGroup(groupId: string): Promise<void> {
  const group = await getDesignGroup(groupId);
  if (!group?.sessionCode) throw new Error("NO_SESSION");
  const session = await getSessionByCode(group.sessionCode);
  if (session) await updateSession(session.id, session.code, { phase: "HARVEST", phaseEndsAt: null });
  await updateDesignGroup(groupId, { status: "FINALIZED" });
}

export async function reopenDesignGroup(groupId: string): Promise<void> {
  const group = await getDesignGroup(groupId);
  if (!group?.sessionCode) throw new Error("NO_SESSION");
  const session = await getSessionByCode(group.sessionCode);
  if (session) await updateSession(session.id, session.code, { phase: "BUILD", phaseEndsAt: null });
  await updateDesignGroup(groupId, { status: "OPEN" });
}
