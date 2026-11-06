import { NextResponse } from "next/server";
import { supabaseConfigured } from "@/lib/supabase";
import { getSessionUser } from "@/lib/supabase-auth";
import { getProjectById } from "@/lib/projects";
import { getDesignGroup } from "@/lib/design-groups";
import { listExercises } from "@/lib/design-group-exercises";
import { getExerciseType } from "@/lib/exercise-types";
import { listBoardCards } from "@/lib/ripples";
import { implicationSeedCandidates } from "@/lib/synthesis-shape";
import { clusterByEmbedding, clusterByLlm } from "@/lib/analysis/implication-cluster";
import {
  isClusterMethod,
  type ImplicationItem,
} from "@/lib/analysis/implication-cluster-shape";
import { keepaliveJsonResponse } from "@/lib/keepalive-stream";

export const dynamic = "force-dynamic";
// Measured on a real 43-implication board: the single LLM grouping call took 25s with no
// criteria and 41s with them — the model reasons over the whole set at once, so this grows
// with the group. 60 (what /api/analysis/cluster uses) left too little headroom; a bigger
// group would have timed out in front of a facilitator. The embedding path is far cheaper
// (1.4s to embed all 43) but shares the route.
//
// AND IT IS INERT ON RENDER ANYWAY — a Vercel directive on a long-lived Node server. The
// real cliff is 60 SECONDS OF SILENCE, which Render's router enforces by closing an idle
// connection, and the 41s measured above says a group only somewhat bigger than 43 would
// hit it. Hence the keepalive stream below.
export const maxDuration = 120;

// Admin-only: propose how a design group's Week 2 implications could be clustered into
// themes. Body: { sourceExerciseId, method, criteria?, minSimilarity? }.
//
// READ-ONLY BY DESIGN. Nothing here writes a card, and nothing should start to without a
// deliberate decision — the whole point of this round is that a facilitator can run it as
// many times as they like, on real group material, at no cost but the API call. The
// implications are read from the DB rather than taken from the request, like the sibling
// seed route: the client says which week, never what is on it.
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
      { error: "Clustering needs a model (missing OPENAI_API_KEY)." },
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
    method?: unknown;
    criteria?: unknown;
    minSimilarity?: unknown;
  };
  const sourceExerciseId =
    typeof body.sourceExerciseId === "string" ? body.sourceExerciseId : "";
  if (!sourceExerciseId)
    return NextResponse.json({ error: "sourceExerciseId is required." }, { status: 400 });
  if (!isClusterMethod(body.method))
    return NextResponse.json({ error: "method must be 'llm' or 'embedding'." }, { status: 400 });
  const method = body.method;
  const criteria =
    typeof body.criteria === "string" && body.criteria.trim()
      ? body.criteria.trim().slice(0, 2000)
      : null;
  const minSimilarity =
    typeof body.minSimilarity === "number" &&
    body.minSimilarity >= -1 &&
    body.minSimilarity <= 1
      ? body.minSimilarity
      : undefined;

  // The guards ABOVE answer with real status codes, because they are decided before any
  // work. The ones below now ride the stream's `err` frame, which carries the same status
  // and the same sentence — the client shows the sentence either way.
  return keepaliveJsonResponse(
    async () => {
      const exercises = await listExercises(groupId);
      const source = exercises.find((e) => e.id === sourceExerciseId);
      if (!source || !source.sessionCode)
        return { ok: false as const, status: 404, error: "Exercise not found." };
      if (getExerciseType(source.type)?.render !== "implications")
        return {
          ok: false as const,
          status: 400,
          error: "Only an implications week can be clustered.",
        };

      // Same candidate list the seed picker offers, so what gets clustered is exactly what
      // could be put on the Week 3 board — roots, stickies and challenged-out cards excluded.
      const cards = await listBoardCards(source.sessionCode);
      const items: ImplicationItem[] = implicationSeedCandidates(cards).map((c) => ({
        id: c.id,
        text: c.text,
        keyChange: c.keyChange,
      }));
      if (items.length < 2)
        return {
          ok: false as const,
          status: 400,
          error: "This week has fewer than two implications to cluster.",
        };

      const result =
        method === "llm"
          ? await clusterByLlm(items, criteria)
          : await clusterByEmbedding(items, { minSimilarity, criteria });

      // The helpers swallow their own errors and return null so a failure never takes the
      // request down with a stack trace; translate that into the upstream status.
      if (!result)
        return { ok: false as const, status: 502, error: "The model did not return a grouping." };

      return { ok: true as const, data: result };
    },
    { label: "POST group cluster", fallback: "Failed to cluster implications." }
  );
}
