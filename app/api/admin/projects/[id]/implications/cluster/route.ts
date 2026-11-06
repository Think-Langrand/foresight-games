import { NextResponse } from "next/server";
import { supabaseConfigured } from "@/lib/supabase";
import { getSessionUser } from "@/lib/supabase-auth";
import { getProjectById } from "@/lib/projects";
import { runCohortClustering } from "@/lib/analysis/cohort-cluster";
import { isClusterMethod } from "@/lib/analysis/implication-cluster-shape";
import { isContextMode } from "@/lib/analysis/cohort-cluster-shape";
import { keepaliveJsonResponse } from "@/lib/keepalive-stream";

export const dynamic = "force-dynamic";
// The app runs on Render as a long-lived Node server, so this export is inert here — it
// is kept to match the sibling routes and to describe the intent if this ever moves to a
// serverless host. A cohort LLM run over a few hundred implications can take minutes; the
// page shows elapsed time so a slow run reads as slow rather than broken. What keeps such
// a run alive on Render is the keepalive stream below, not this.
export const maxDuration = 300;

// Admin-only: pool every design group's implications for this project and propose how the
// WHOLE COHORT's material could be themed, with provenance — which groups fed each theme.
//
// READ-ONLY BY DESIGN, like the per-group cluster route it sits beside. Nothing here
// writes a card, a config key or a row, which is what makes it safe to run as many times
// as a facilitator likes on real group material.
//
// The implications are read from the DB, never taken from the request: the client says
// which week and which groups, never what is on them.
const CRITERIA_MAX = 4000;
const PROMPT_MAX = 8000;

function stringList(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = [...new Set(v.filter((x): x is string => typeof x === "string" && x.length > 0))];
  return out.length > 0 ? out.slice(0, 200) : undefined;
}

function overrideMap(v: unknown): Record<string, string> | undefined {
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === "string" && val) out[k] = val;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function trimmed(v: unknown, max: number): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
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

  const { id } = await params;
  const project = await getProjectById(id);
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!isClusterMethod(body.method))
    return NextResponse.json({ error: "method must be 'llm' or 'embedding'." }, { status: 400 });
  // Captured here, not read off `body` inside the job: the guard narrows `body.method` in
  // this scope only, and the job below is a closure.
  const method = body.method;

  const minSimilarity =
    typeof body.minSimilarity === "number" &&
    body.minSimilarity >= -1 &&
    body.minSimilarity <= 1
      ? body.minSimilarity
      : undefined;

  // STREAMED for the same reason as the cohort-analysis route beside it: a run over a few
  // hundred implications takes minutes and used to send nothing at all until it was done,
  // and Render cuts a connection that has been idle for 60 seconds. The guards above still
  // answer with real status codes; only the long part moves into the body.
  return keepaliveJsonResponse(
    async () => {
      const result = await runCohortClustering({
        projectId: project.id,
        projectName: project.name,
        method,
        context: isContextMode(body.context) ? body.context : "blind",
        criteria: trimmed(body.criteria, CRITERIA_MAX),
        promptOverride: trimmed(body.promptOverride, PROMPT_MAX),
        narrative: body.narrative === true,
        weekSort: typeof body.weekSort === "number" ? body.weekSort : undefined,
        overrides: overrideMap(body.overrides),
        groupIds: stringList(body.groupIds),
        minSimilarity,
        bridging: body.bridging === true,
      });
      return result.ok
        ? { ok: true as const, data: result.response }
        : { ok: false as const, status: result.status, error: result.error };
    },
    {
      label: "POST cohort cluster",
      fallback: "Failed to cluster the cohort's implications.",
    }
  );
}
