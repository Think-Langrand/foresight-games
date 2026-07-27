import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/supabase-auth";
import { updateTeam } from "@/lib/teams";
import { supabaseConfigured } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Facilitator-only: set/clear the tone + family judgement tags on one kernel.
// Tagging is a curation action, so it is gated behind the facilitator login even
// though the analysis view itself is public.
export async function POST(req: Request) {
  if (!supabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to tag kernels." }, { status: 401 });

  let body: { teamId?: string; tone?: string | null; family?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.teamId) {
    return NextResponse.json({ error: "teamId is required." }, { status: 400 });
  }

  const tone = body.tone ?? null;
  if (tone !== null && tone !== "hopeful" && tone !== "dark") {
    return NextResponse.json({ error: "tone must be 'hopeful', 'dark', or null." }, { status: 400 });
  }
  const family = body.family == null ? null : String(body.family).trim().slice(0, 80) || null;

  try {
    const team = await updateTeam(body.teamId, "", { tone, family });
    return NextResponse.json({ team: { id: team.id, tone: team.tone, family: team.family } });
  } catch (err) {
    console.error("[POST analysis/tag]", err);
    // Most likely cause before the 0004 migration is applied: unknown column.
    return NextResponse.json(
      { error: "Failed to save tags. Ensure migration 0004_team_analysis_tags is applied." },
      { status: 500 }
    );
  }
}
