import { NextResponse } from "next/server";
import { supabaseConfigured } from "@/lib/supabase";
import { getSessionUser } from "@/lib/supabase-auth";
import { getProjectById } from "@/lib/projects";
import { runCohortAnalysis } from "@/lib/analysis/cohort-analysis";
import { isClusterMethod } from "@/lib/analysis/implication-cluster-shape";
import { isContextMode } from "@/lib/analysis/cohort-cluster-shape";
import { isPoolSource, poolSourceLabel } from "@/lib/analysis/cohort-pool-shape";
import { poolCohortItems } from "@/lib/analysis/cohort-pool";
import { keepaliveJsonResponse } from "@/lib/keepalive-stream";

export const dynamic = "force-dynamic";
// Inert on Render (a Vercel directive), kept so the intent travels if this ever moves to a
// serverless host. What actually keeps a long run alive here is the keepalive stream below.
export const maxDuration = 300;

// Admin-only: one cohort analysis — the clustering run plus the grid, the weights and the
// flips, as a single payload so no two views can disagree about the same cohort.
//
// READ-ONLY BY DESIGN, like the clustering routes it sits beside. Nothing in this path
// writes a card, a config key or a row, which is what makes it safe to re-run on real
// group material as many times as a facilitator likes.
//
// GET previews what a run would pool — which groups contribute and how many items — with
// no model call, so the size and cost of a run are visible before paying for one.
// POST runs it.

const CRITERIA_MAX = 4000;
const PROMPT_MAX = 8000;

function trimmed(v: unknown, max: number): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
}

function stringList(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = [...new Set(v.filter((x): x is string => typeof x === "string" && x.length > 0))];
  return out.length > 0 ? out.slice(0, 200) : undefined;
}

async function guard(id: string, needsModel: boolean) {
  if (!supabaseConfigured())
    return { error: NextResponse.json({ error: "Database not configured." }, { status: 503 }) };
  if (!(await getSessionUser()))
    return { error: NextResponse.json({ error: "Unauthorized." }, { status: 401 }) };
  if (needsModel && !process.env.OPENAI_API_KEY)
    return {
      error: NextResponse.json(
        { error: "Clustering needs a model (missing OPENAI_API_KEY)." },
        { status: 503 }
      ),
    };
  const project = await getProjectById(id);
  if (!project)
    return { error: NextResponse.json({ error: "Project not found." }, { status: 404 }) };
  return { project };
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const got = await guard(id, false);
  if (got.error) return got.error;

  const url = new URL(req.url);
  const sourceParam = url.searchParams.get("source");
  const source = isPoolSource(sourceParam) ? sourceParam : "implications";
  const weekParam = Number(url.searchParams.get("weekSort"));

  try {
    const pool = await poolCohortItems(got.project.id, {
      source,
      weekSort: Number.isInteger(weekParam) ? weekParam : undefined,
    });
    return NextResponse.json({
      projectName: got.project.name,
      source,
      sourceLabel: poolSourceLabel(source),
      weeks: pool.weeks,
      week: pool.week,
      groups: pool.groups,
      itemCount: pool.items.length,
    });
  } catch (err) {
    console.error("[GET cohort analysis preview]", err);
    return NextResponse.json({ error: "Could not read the cohort." }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const got = await guard(id, true);
  if (got.error) return got.error;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!isClusterMethod(body.method))
    return NextResponse.json({ error: "method must be 'llm' or 'embedding'." }, { status: 400 });
  // Captured here, not read off `body` inside the job: the guard narrows `body.method` in
  // this scope only, and the job below is a closure.
  const method = body.method;

  const minSimilarity =
    typeof body.minSimilarity === "number" && body.minSimilarity >= -1 && body.minSimilarity <= 1
      ? body.minSimilarity
      : undefined;

  // STREAMED, and not because the payload is big. A cohort run is slow and, until this,
  // completely silent — and Render closes a connection idle for 60 seconds, which killed
  // every run that took longer than that while letting a 42-second one through. See
  // lib/keepalive-stream.ts for the log that proved it.
  //
  // Everything above this line is an up-front guard and still answers with a real status
  // code. Only the long part moves into the body.
  return keepaliveJsonResponse(
    async () => {
      const result = await runCohortAnalysis({
        projectId: got.project.id,
        projectName: got.project.name,
        source: isPoolSource(body.source) ? body.source : "implications",
        method,
        context: isContextMode(body.context) ? body.context : "blind",
        criteria: trimmed(body.criteria, CRITERIA_MAX),
        promptOverride: trimmed(body.promptOverride, PROMPT_MAX),
        narrative: body.narrative === true,
        weekSort: typeof body.weekSort === "number" ? body.weekSort : undefined,
        groupIds: stringList(body.groupIds),
        minSimilarity,
        bridging: body.bridging === true,
      });
      return result.ok
        ? { ok: true as const, data: result.analysis }
        : { ok: false as const, status: result.status, error: result.error };
    },
    { label: "POST cohort analysis", fallback: "Failed to analyse the cohort." }
  );
}
