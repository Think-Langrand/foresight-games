import { NextResponse } from "next/server";
import { supabaseConfigured } from "@/lib/supabase";
import { getSessionUser } from "@/lib/supabase-auth";
import { getProjectById } from "@/lib/projects";
import { getDesignGroup } from "@/lib/design-groups";
import { listExercises } from "@/lib/design-group-exercises";
import { getExerciseType } from "@/lib/exercise-types";
import { getSessionByCode } from "@/lib/workshop";
import { getCardsByIds, getRippleTeams, seedFirstCards } from "@/lib/ripples";

export const dynamic = "force-dynamic";

// Per-request cap; the admin UI batches larger selections ("Add all") to this size
// (SEED_BATCH in components/admin/AdminGroupAnswers.tsx — keep them equal).
const MAX_SEED = 50;

// Admin-only: seed an implications week's key changes (FIRST cards) from answers on the
// same group's other weeks — e.g. Session 1's "Our 6 key changes" → Session 2's map.
// Body: { exerciseId, sourceCardIds[] }. Card text is read from the DB, never the client.
// Already-seeded sources are skipped. No phase check: admins may seed before a week opens.
export async function POST(
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

  const body = (await req.json().catch(() => ({}))) as { exerciseId?: unknown; sourceCardIds?: unknown };
  const exerciseId = typeof body.exerciseId === "string" ? body.exerciseId : "";
  const sourceCardIds = Array.isArray(body.sourceCardIds)
    ? body.sourceCardIds.filter((x): x is string => typeof x === "string")
    : [];
  if (!exerciseId || sourceCardIds.length === 0)
    return NextResponse.json({ error: "exerciseId and sourceCardIds are required." }, { status: 400 });
  if (sourceCardIds.length > MAX_SEED)
    return NextResponse.json({ error: `Seed at most ${MAX_SEED} answers at once.` }, { status: 400 });

  try {
    const exercises = await listExercises(groupId);
    const target = exercises.find((e) => e.id === exerciseId);
    if (!target || !target.sessionCode)
      return NextResponse.json({ error: "Exercise not found." }, { status: 404 });
    if (getExerciseType(target.type)?.render !== "implications")
      return NextResponse.json({ error: "Only implications weeks can be seeded." }, { status: 400 });

    // Source weeks = this group's other board-backed weeks, keyed by board code.
    const sourceWeeks = new Map(
      exercises
        .filter((e) => e.id !== target.id && e.sessionCode)
        .map((e) => [e.sessionCode!.toUpperCase(), e.title])
    );
    const found = await getCardsByIds(sourceCardIds);
    const byId = new Map(found.map((c) => [c.id, c]));
    const items: { sourceCardId: string; text: string; sourceLabel: string }[] = [];
    for (const cid of sourceCardIds) {
      const c = byId.get(cid);
      const label = c ? sourceWeeks.get(c.code.toUpperCase()) : undefined;
      if (!c || label === undefined || !c.text.trim())
        return NextResponse.json({ error: "One or more answers aren't from this group's other weeks." }, { status: 400 });
      items.push({ sourceCardId: c.id, text: c.text.trim(), sourceLabel: label });
    }

    const session = await getSessionByCode(target.sessionCode);
    const team = (await getRippleTeams(target.sessionCode))[0];
    if (!session || !team)
      return NextResponse.json({ error: "This week's board isn't set up yet." }, { status: 409 });

    const result = await seedFirstCards({ sessionId: session.id, code: session.code, teamId: team.id, items });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[POST group seed]", err);
    return NextResponse.json({ error: "Failed to seed key changes." }, { status: 500 });
  }
}
