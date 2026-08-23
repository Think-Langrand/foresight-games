import { NextResponse } from "next/server";
import { supabaseConfigured } from "@/lib/supabase";
import { getSessionUser } from "@/lib/supabase-auth";
import { getProjectById } from "@/lib/projects";
import { getDesignGroup } from "@/lib/design-groups";
import { getExercise, lockExercise, unlockExercise } from "@/lib/design-group-exercises";

export const dynamic = "force-dynamic";

// Admin-only: lock/unlock a week. Lock moves the backing board to HARVEST (renders
// the output, blocks new cards); unlock returns it to BUILD. Body: { action }.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; groupId: string; exerciseId: string }> }
) {
  if (!supabaseConfigured())
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  if (!(await getSessionUser()))
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id, groupId, exerciseId } = await params;
  const project = await getProjectById(id);
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const group = await getDesignGroup(groupId);
  if (!group || group.projectId !== project.id)
    return NextResponse.json({ error: "Design group not found." }, { status: 404 });
  const exercise = await getExercise(exerciseId);
  if (!exercise || exercise.groupId !== group.id)
    return NextResponse.json({ error: "Exercise not found." }, { status: 404 });

  let body: { action?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    if (body.action === "unlock") await unlockExercise(exerciseId);
    else if (body.action === "lock") await lockExercise(exerciseId);
    else return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    return NextResponse.json({ exercise: await getExercise(exerciseId) });
  } catch (err) {
    console.error("[POST exercise lock]", err);
    return NextResponse.json({ error: "Failed to update exercise." }, { status: 500 });
  }
}
