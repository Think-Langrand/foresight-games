import { NextResponse } from "next/server";
import { supabaseConfigured } from "@/lib/supabase";
import { getSessionUser } from "@/lib/supabase-auth";
import { getProjectById } from "@/lib/projects";
import { poolCohortImplications } from "@/lib/analysis/cohort-pool";

export const dynamic = "force-dynamic";

// Admin-only: what a cohort run WOULD pool, without running it. Queries only — no model
// call, nothing written — so the page can show which groups contribute and how many
// implications there are before a facilitator decides to spend a run.
//
// Same code path as the run itself (poolCohortImplications), so the numbers here are the
// numbers the run uses rather than an estimate that can drift from it.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!supabaseConfigured())
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  if (!(await getSessionUser()))
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;
  const project = await getProjectById(id);
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const url = new URL(req.url);
  const raw = url.searchParams.get("weekSort");
  const weekSort = raw !== null && Number.isFinite(Number(raw)) ? Number(raw) : undefined;

  try {
    const pool = await poolCohortImplications(project.id, { weekSort });
    // The items themselves are not sent: the page only needs the shape of the pool, and a
    // preview that shipped 250 implications to render a count would be silly.
    return NextResponse.json({
      projectName: project.name,
      weeks: pool.weeks,
      week: pool.week,
      groups: pool.groups,
      itemCount: pool.items.length,
    });
  } catch (err) {
    console.error("[GET cohort implications]", err);
    return NextResponse.json({ error: "Failed to read the cohort's boards." }, { status: 500 });
  }
}
