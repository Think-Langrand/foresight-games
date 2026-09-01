import { NextResponse } from "next/server";
import { supabaseConfigured } from "@/lib/supabase";
import { getSessionUser } from "@/lib/supabase-auth";
import { getProjectById } from "@/lib/projects";
import { getDesignGroup } from "@/lib/design-groups";
import { getExercise, listExercises } from "@/lib/design-group-exercises";
import { deleteCard, deleteAllCards } from "@/lib/ripples";

export const dynamic = "force-dynamic";

// Admin-only: delete answers (ripple_cards) on a design group's boards. Irreversible —
// the client confirms first. Query params select the scope:
//   ?exerciseId=X&cardId=Y  → delete one answer
//   ?exerciseId=X           → clear that week's whole board
//   (none)                  → reset the group (clear every week's board)
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; groupId: string }> }
) {
  if (!supabaseConfigured())
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  if (!(await getSessionUser()))
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id, groupId } = await params;
  const project = await getProjectById(id);
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const group = await getDesignGroup(groupId);
  if (!group || group.projectId !== project.id)
    return NextResponse.json({ error: "Design group not found." }, { status: 404 });

  const url = new URL(req.url);
  const exerciseId = url.searchParams.get("exerciseId");
  const cardId = url.searchParams.get("cardId");

  try {
    if (exerciseId) {
      const ex = await getExercise(exerciseId);
      if (!ex || ex.groupId !== group.id)
        return NextResponse.json({ error: "Exercise not found." }, { status: 404 });
      if (ex.sessionCode) {
        if (cardId) await deleteCard(ex.sessionCode, cardId);
        else await deleteAllCards(ex.sessionCode);
      }
    } else {
      // Reset the whole group: clear every board-backed exercise.
      const exercises = await listExercises(groupId);
      for (const ex of exercises) if (ex.sessionCode) await deleteAllCards(ex.sessionCode);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE group cards]", err);
    return NextResponse.json({ error: "Failed to delete answers." }, { status: 500 });
  }
}
