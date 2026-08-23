import { NextResponse } from "next/server";
import { supabaseConfigured } from "@/lib/supabase";
import { getSessionUser } from "@/lib/supabase-auth";
import { getProjectById } from "@/lib/projects";
import { getDesignGroup } from "@/lib/design-groups";
import {
  getExercise,
  updateExercise,
  deleteExercise,
  provisionExerciseBoard,
} from "@/lib/design-group-exercises";
import { isBoardBacked } from "@/lib/exercise-types";

export const dynamic = "force-dynamic";

async function resolve(projectId: string, groupId: string, exerciseId: string) {
  const project = await getProjectById(projectId);
  if (!project) return { error: "Project not found.", status: 404 as const };
  const group = await getDesignGroup(groupId);
  if (!group || group.projectId !== project.id)
    return { error: "Design group not found.", status: 404 as const };
  const exercise = await getExercise(exerciseId);
  if (!exercise || exercise.groupId !== group.id)
    return { error: "Exercise not found.", status: 404 as const };
  return { project, group, exercise };
}

// Admin-only: edit an exercise (title/sort/type/opens_at). If the type changes to a
// board-backed type and there's no board yet, provision one (needs a group scenario).
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; groupId: string; exerciseId: string }> }
) {
  if (!supabaseConfigured())
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  if (!(await getSessionUser()))
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id, groupId, exerciseId } = await params;
  const r = await resolve(id, groupId, exerciseId);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });

  let body: { title?: string; sort?: number; type?: string; opensAt?: string | null } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    await updateExercise(exerciseId, {
      title: body.title,
      sort: body.sort,
      type: body.type,
      opensAt: body.opensAt,
    });
    // A newly board-backed exercise with no board gets one provisioned (if the group
    // has a scenario). opens_at/lock still gate member access separately.
    const updated = await getExercise(exerciseId);
    if (updated && isBoardBacked(updated.type) && !updated.sessionCode && r.group.scenarioRef) {
      await provisionExerciseBoard(updated, {
        projectId: r.group.projectId,
        scenarioRef: r.group.scenarioRef,
        carmelitaProjectRef: r.project.carmelitaProjectRef,
        color: r.group.color,
      });
    }
    return NextResponse.json({ exercise: await getExercise(exerciseId) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg === "SCENARIO_NOT_FOUND")
      return NextResponse.json({ error: "The group's scenario could not be found." }, { status: 404 });
    console.error("[PATCH exercise]", err);
    return NextResponse.json({ error: "Failed to update exercise." }, { status: 500 });
  }
}

// Admin-only: delete an exercise. (The backing session is left intact under All
// sessions — deleting a week is a registry action, not a data purge.)
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; groupId: string; exerciseId: string }> }
) {
  if (!supabaseConfigured())
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  if (!(await getSessionUser()))
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id, groupId, exerciseId } = await params;
  const r = await resolve(id, groupId, exerciseId);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });

  try {
    await deleteExercise(exerciseId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE exercise]", err);
    return NextResponse.json({ error: "Failed to delete exercise." }, { status: 500 });
  }
}
