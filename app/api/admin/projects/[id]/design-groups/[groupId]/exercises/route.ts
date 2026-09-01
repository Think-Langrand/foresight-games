import { NextResponse } from "next/server";
import { supabaseConfigured } from "@/lib/supabase";
import { getSessionUser } from "@/lib/supabase-auth";
import { getProjectById } from "@/lib/projects";
import { getDesignGroup } from "@/lib/design-groups";
import {
  listExercises,
  createExercise,
  provisionExerciseBoard,
} from "@/lib/design-group-exercises";
import { isBoardBacked, type WorksheetSection } from "@/lib/exercise-types";

export const dynamic = "force-dynamic";

// Resolve project + group and confirm the group belongs to the project.
async function resolve(projectId: string, groupId: string) {
  const project = await getProjectById(projectId);
  if (!project) return { error: "Project not found.", status: 404 as const };
  const group = await getDesignGroup(groupId);
  if (!group || group.projectId !== project.id)
    return { error: "Design group not found.", status: 404 as const };
  return { project, group };
}

// Admin-only: list a group's exercises (weeks).
export async function GET(
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
  return NextResponse.json({ exercises: await listExercises(groupId) });
}

// Admin-only: add an exercise. Provisions its shared board immediately when the type
// is board-backed AND the group already has a scenario (otherwise the board is
// provisioned later, when the scenario is assigned).
export async function POST(
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
    title?: string;
    type?: string;
    opensAt?: string | null;
    sort?: number;
    sections?: WorksheetSection[];
  } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const title = (body.title ?? "").trim();
  if (!title) return NextResponse.json({ error: "Title is required." }, { status: 400 });

  try {
    const existing = await listExercises(groupId);
    const exercise = await createExercise({
      groupId,
      sort: typeof body.sort === "number" ? body.sort : existing.length,
      title,
      type: body.type ?? "placeholder",
      opensAt: body.opensAt ?? null,
      sections: body.sections, // coerced in createExercise via resolveSections
    });
    if (isBoardBacked(exercise.type) && r.group.scenarioRef) {
      await provisionExerciseBoard(exercise, {
        projectId: r.group.projectId,
        scenarioRef: r.group.scenarioRef,
        carmelitaProjectRef: r.project.carmelitaProjectRef,
      });
    }
    // Re-read so the response includes any freshly-provisioned session_code.
    const exercises = await listExercises(groupId);
    return NextResponse.json({ exercise: exercises.find((e) => e.id === exercise.id) ?? exercise });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg === "SCENARIO_NOT_FOUND")
      return NextResponse.json({ error: "The group's scenario could not be found." }, { status: 404 });
    console.error("[POST exercise]", err);
    return NextResponse.json({ error: "Failed to add exercise." }, { status: 500 });
  }
}
