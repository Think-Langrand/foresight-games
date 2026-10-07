import { NextResponse } from "next/server";
import { supabaseConfigured } from "@/lib/supabase";
import { getSessionUser } from "@/lib/supabase-auth";
import { getProjectById } from "@/lib/projects";
import { getDesignGroup } from "@/lib/design-groups";
import { listExercises } from "@/lib/design-group-exercises";
import { getExerciseType } from "@/lib/exercise-types";
import { listBoardCards } from "@/lib/ripples";
import { implicationSeedCandidates } from "@/lib/synthesis-shape";
import { rankSimilarImplications } from "@/lib/analysis/implication-cluster";
import type { ImplicationItem } from "@/lib/analysis/implication-cluster-shape";

export const dynamic = "force-dynamic";
// One embedding request over the week's implications (1.4s measured on 43), no LLM call.
export const maxDuration = 30;

// Admin-only: rank a week's implications by how close they sit to one Week 3 theme's
// members, for the theme view's "suggest more". Body:
//   { sourceExerciseId, memberIds: string[], candidateIds: string[] }
// where every id is a WEEK 2 card id (a Week 3 card's sourceCardId).
//
// READ-ONLY, like the sibling cluster route: the implications are read from the DB and
// nothing is written. Adding a suggested card to the theme is the board's own move.
const MAX_IDS = 500;

function idList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter((x): x is string => typeof x === "string" && x.length > 0))].slice(0, MAX_IDS);
}

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
      { error: "Suggestions need a model (missing OPENAI_API_KEY)." },
      { status: 503 }
    );

  const { id, groupId } = await params;
  const project = await getProjectById(id);
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const group = await getDesignGroup(groupId);
  if (!group || group.projectId !== project.id)
    return NextResponse.json({ error: "Design group not found." }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as {
    sourceExerciseId?: unknown;
    memberIds?: unknown;
    candidateIds?: unknown;
  };
  const sourceExerciseId =
    typeof body.sourceExerciseId === "string" ? body.sourceExerciseId : "";
  if (!sourceExerciseId)
    return NextResponse.json({ error: "sourceExerciseId is required." }, { status: 400 });
  const memberIds = idList(body.memberIds);
  const candidateIds = idList(body.candidateIds);
  if (memberIds.length === 0)
    return NextResponse.json(
      { error: "The theme has no implications from the Week 2 map to compare against." },
      { status: 400 }
    );
  if (candidateIds.length === 0)
    return NextResponse.json({ error: "Nothing left to suggest." }, { status: 400 });

  try {
    const exercises = await listExercises(groupId);
    const source = exercises.find((e) => e.id === sourceExerciseId);
    if (!source || !source.sessionCode)
      return NextResponse.json({ error: "Exercise not found." }, { status: 404 });
    if (getExerciseType(source.type)?.render !== "implications")
      return NextResponse.json(
        { error: "Only an implications week can be searched." },
        { status: 400 }
      );

    // The same candidate set the seed picker and the clustering tool use.
    const cards = await listBoardCards(source.sessionCode);
    const items: ImplicationItem[] = implicationSeedCandidates(cards).map((c) => ({
      id: c.id,
      text: c.text,
      keyChange: c.keyChange,
    }));

    const result = await rankSimilarImplications(items, memberIds, candidateIds);
    if (!result)
      return NextResponse.json({ error: "The model did not return a ranking." }, { status: 502 });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[POST group similar]", err);
    return NextResponse.json({ error: "Failed to rank implications." }, { status: 500 });
  }
}
