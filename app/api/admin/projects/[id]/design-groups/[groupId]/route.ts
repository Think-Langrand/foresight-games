import { NextResponse } from "next/server";
import { supabaseConfigured } from "@/lib/supabase";
import { getSessionUser } from "@/lib/supabase-auth";
import { getProjectById } from "@/lib/projects";
import {
  assignScenario,
  deleteDesignGroup,
  getDesignGroup,
  ScenarioHasCardsError,
  updateDesignGroup,
} from "@/lib/design-groups";

export const dynamic = "force-dynamic";

// Resolve the group and confirm it belongs to the [id] project (isolation guard).
async function resolve(projectId: string, groupId: string) {
  const project = await getProjectById(projectId);
  if (!project) return { error: "Project not found.", status: 404 as const };
  const group = await getDesignGroup(groupId);
  if (!group || group.projectId !== project.id)
    return { error: "Design group not found.", status: 404 as const };
  return { project, group };
}

// Admin-only: edit a group (rename/reorder/color) and/or assign a scenario. When
// `scenarioRef` is present the group's shared-board session is (re)provisioned.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; groupId: string }> }
) {
  if (!supabaseConfigured())
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  if (!(await getSessionUser()))
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id, groupId } = await params;
  const r = await resolve(id, groupId);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });

  let body: {
    name?: string;
    sort?: number;
    color?: string | null;
    scenarioRef?: string;
    force?: boolean;
  } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    // Metadata edits first (so a rename + assign in one call both land).
    const meta: Record<string, unknown> = {};
    if (body.name !== undefined) meta.name = body.name;
    if (body.sort !== undefined) meta.sort = body.sort;
    if (body.color !== undefined) meta.color = body.color;
    if (Object.keys(meta).length > 0) await updateDesignGroup(groupId, meta);

    if (typeof body.scenarioRef === "string" && body.scenarioRef.trim()) {
      await assignScenario(groupId, body.scenarioRef.trim(), { force: body.force === true });
    }
    const group = await getDesignGroup(groupId);
    return NextResponse.json({ group });
  } catch (err) {
    // Changing the scenario would overwrite the premise under built implications:
    // 409 + needsConfirm so the client can re-send with { force: true }.
    if (err instanceof ScenarioHasCardsError)
      return NextResponse.json(
        {
          error: `This group already has ${err.count} implication${err.count === 1 ? "" : "s"} built on its current scenario. Reassigning will change the premise under that work. Reassign anyway?`,
          needsConfirm: true,
          count: err.count,
        },
        { status: 409 }
      );
    const msg = err instanceof Error ? err.message : "";
    if (msg === "SCENARIO_NOT_FOUND")
      return NextResponse.json({ error: "That scenario could not be found." }, { status: 404 });
    console.error("[PATCH design-group]", err);
    return NextResponse.json({ error: "Failed to update design group." }, { status: 500 });
  }
}

// Admin-only: delete a group. (The backing Ripples session is left intact — an
// admin can still find/clean it up under All sessions; deleting a group is a
// registry action, not a data purge.)
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; groupId: string }> }
) {
  if (!supabaseConfigured())
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  if (!(await getSessionUser()))
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id, groupId } = await params;
  const r = await resolve(id, groupId);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });

  try {
    await deleteDesignGroup(groupId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE design-group]", err);
    return NextResponse.json({ error: "Failed to delete design group." }, { status: 500 });
  }
}
