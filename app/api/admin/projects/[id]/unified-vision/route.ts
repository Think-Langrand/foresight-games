import { NextResponse } from "next/server";
import { supabaseConfigured } from "@/lib/supabase";
import { getSessionUser } from "@/lib/supabase-auth";
import { getProjectById } from "@/lib/projects";
import { draftUnifiedVision } from "@/lib/analysis/unified-vision";
import { keepaliveJsonResponse } from "@/lib/keepalive-stream";

export const dynamic = "force-dynamic";
// Inert on Render (a Vercel directive). What keeps a long run alive here is the keepalive
// stream below — see lib/keepalive-stream.ts.
export const maxDuration = 300;

// Admin-only: read the groups' vision statements against each other and draft one the whole
// cohort could stand behind.
//
// READ-ONLY BY DESIGN, like every analysis route it sits beside. Nothing here writes a card,
// a config key or a row — a drafted vision is returned, never stored, so adopting one stays
// a decision a facilitator makes on a board rather than something a model did to a project.
//
// A SEPARATE ROUTE RATHER THAN A VIEW ON A COHORT RUN, because this is not a clustering
// question: four groups produce four paragraphs, and clustering four paragraphs answers
// nothing. See the header of lib/analysis/unified-vision-shape.ts.
const CRITERIA_MAX = 4000;

function stringList(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = [...new Set(v.filter((x): x is string => typeof x === "string" && x.length > 0))];
  return out.length > 0 ? out.slice(0, 200) : undefined;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!supabaseConfigured())
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  if (!(await getSessionUser())) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!process.env.OPENAI_API_KEY)
    return NextResponse.json(
      { error: "Drafting a vision needs a model (missing OPENAI_API_KEY)." },
      { status: 503 }
    );

  const { id } = await params;
  const project = await getProjectById(id);
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const criteria =
    typeof body.criteria === "string" && body.criteria.trim()
      ? body.criteria.trim().slice(0, CRITERIA_MAX)
      : null;

  // Streamed: one gpt-5 call over several paragraphs can pass 60 seconds, and Render closes
  // a connection that has been idle that long. The guards above still carry real statuses.
  return keepaliveJsonResponse(
    async () => {
      const result = await draftUnifiedVision({
        projectId: project.id,
        criteria,
        weekSort: typeof body.weekSort === "number" ? body.weekSort : undefined,
        groupIds: stringList(body.groupIds),
      });
      return result.ok
        ? { ok: true as const, data: result.vision }
        : { ok: false as const, status: result.status, error: result.error };
    },
    { label: "POST unified vision", fallback: "Failed to draft a unified vision." }
  );
}
