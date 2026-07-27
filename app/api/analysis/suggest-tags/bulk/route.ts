import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/supabase-auth";
import { listAllTeams } from "@/lib/teams";
import { supabaseConfigured } from "@/lib/supabase";
import { autoTagTeam, llmConfigured, mapPool } from "@/lib/analysis/suggest";

export const dynamic = "force-dynamic";

// Facilitator-only: auto-tag a batch of untagged kernels in one go. Given a list
// of team ids (the untagged kernels currently on screen), suggest + SAVE tone and
// family for each — skipping any that already carry a facilitator tag. Bounded
// concurrency keeps a large batch from hammering the LLM.
export async function POST(req: Request) {
  if (!supabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to auto-tag." }, { status: 401 });
  if (!llmConfigured()) {
    return NextResponse.json(
      { error: "LLM tagging is not configured (missing OPENAI_API_KEY)." },
      { status: 503 }
    );
  }

  let body: { teamIds?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const ids = Array.isArray(body.teamIds)
    ? new Set(body.teamIds.filter((x): x is string => typeof x === "string"))
    : null;
  if (!ids || ids.size === 0) {
    return NextResponse.json({ error: "teamIds is required." }, { status: 400 });
  }

  // Only submitted, currently-untagged teams among the requested ids.
  const teams = (await listAllTeams({ onlySubmitted: true })).filter(
    (t) => ids.has(t.id) && !t.tone
  );

  const saved = await mapPool(teams, 4, (t) => autoTagTeam(t));
  const tagged = saved.filter(Boolean).length;

  return NextResponse.json({ requested: ids.size, eligible: teams.length, tagged });
}
