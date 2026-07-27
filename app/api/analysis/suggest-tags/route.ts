import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/supabase-auth";
import { llmConfigured, suggestTags } from "@/lib/analysis/suggest";

export const dynamic = "force-dynamic";

// Phase-2 (§5.2): return a suggested tone + scenario family for the facilitator to
// accept or override. Suggestions are NEVER auto-saved here — the client only
// fills the inputs; saving still goes through /api/analysis/tag. (Bulk and
// on-submit auto-tagging live in their own paths.)
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to request suggestions." }, { status: 401 });

  if (!llmConfigured()) {
    return NextResponse.json(
      { error: "LLM tagging is not configured (missing OPENAI_API_KEY)." },
      { status: 503 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const tags = await suggestTags({
    convergence: str(body.convergence),
    definingCharacteristics: str(body.definingCharacteristics),
    centralTension: str(body.centralTension),
    newNormal: str(body.newNormal),
    brokenAssumption: str(body.brokenAssumption),
  });

  if (!tags) {
    return NextResponse.json({ error: "Suggestion failed." }, { status: 502 });
  }
  return NextResponse.json(tags);
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
