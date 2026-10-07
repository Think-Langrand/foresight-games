import { NextResponse } from "next/server";
import { supabaseConfigured } from "@/lib/supabase";
import { getSessionUser } from "@/lib/supabase-auth";
import { getProjectById } from "@/lib/projects";
import { getDesignGroup } from "@/lib/design-groups";
import { listExercises } from "@/lib/design-group-exercises";
import { getExerciseType } from "@/lib/exercise-types";
import { getSessionByCode, updateSession } from "@/lib/workshop";
import { getRipplesView } from "@/lib/ripples";
import { shapeFromView } from "@/lib/group-answers-shape";
import { indexSynthesisBoard, summaryCardCount } from "@/lib/synthesis-shape";
import { summarizeSynthesis } from "@/lib/analysis/synthesis-summary";
import { summaryInputHash, type SynthesisSummary } from "@/lib/synthesis-summary-shape";

export const dynamic = "force-dynamic";
// One model call over the whole board. The comparable whole-board call (clustering) measured
// 25–41s on a real group, so the same headroom.
export const maxDuration = 120;

// Admin-only: write the facilitator's executive summary of a Week 3 board's steps 1–2 and
// store it on the board's session config, where every member's board picks it up live.
// Body: { exerciseId }.
//
// The material is read from the DB, never from the request — the client says which week,
// not what is on it (as the cluster and seed routes do). This is the one admin LLM route
// that writes, and it writes exactly one thing: config.summary. The merge is over the
// stored blob as-is, not a resolved copy, so nothing else in the config is touched.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; groupId: string }> }
) {
  if (!supabaseConfigured())
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  if (!(await getSessionUser()))
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!process.env.OPENAI_API_KEY)
    return NextResponse.json(
      { error: "Summarizing needs a model (missing OPENAI_API_KEY)." },
      { status: 503 }
    );

  const { id, groupId } = await params;
  const project = await getProjectById(id);
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const group = await getDesignGroup(groupId);
  if (!group || group.projectId !== project.id)
    return NextResponse.json({ error: "Design group not found." }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { exerciseId?: unknown };
  const exerciseId = typeof body.exerciseId === "string" ? body.exerciseId : "";
  if (!exerciseId) return NextResponse.json({ error: "exerciseId is required." }, { status: 400 });

  try {
    const exercise = (await listExercises(groupId)).find((e) => e.id === exerciseId);
    if (!exercise || !exercise.sessionCode)
      return NextResponse.json({ error: "Exercise not found." }, { status: 404 });
    if (getExerciseType(exercise.type)?.render !== "synthesis")
      return NextResponse.json({ error: "Only a synthesis week can be summarized." }, { status: 400 });

    const session = await getSessionByCode(exercise.sessionCode);
    if (!session) return NextResponse.json({ error: "Board not found." }, { status: 404 });
    const view = await getRipplesView(session);
    const shaped = shapeFromView(exercise, view);
    if (shaped.kind !== "synthesis")
      return NextResponse.json({ error: "This board is not a synthesis board." }, { status: 400 });
    if (shaped.themes.length === 0)
      return NextResponse.json({ error: "There are no themes to summarize yet." }, { status: 400 });

    const generated = await summarizeSynthesis(shaped, view.config.scenarioTitle);
    if (!generated)
      return NextResponse.json({ error: "The model did not return a summary." }, { status: 502 });

    const summary: SynthesisSummary = {
      ...generated,
      generatedAt: new Date().toISOString(),
      cardCount: summaryCardCount(indexSynthesisBoard(view.cards)),
      // Exactly what the model read, so the client can tell an edit from no change.
      inputHash: summaryInputHash(shaped),
    };
    const stored = (session.config ?? {}) as Record<string, unknown>;
    await updateSession(session.id, session.code, { config: { ...stored, summary } });

    return NextResponse.json({ summary });
  } catch (err) {
    console.error("[POST group summary]", err);
    return NextResponse.json({ error: "Failed to summarize the board." }, { status: 500 });
  }
}
