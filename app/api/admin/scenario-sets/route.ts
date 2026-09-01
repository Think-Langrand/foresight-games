import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/supabase-auth";
import { getScenarioSets } from "@/lib/foresight/client";

export const dynamic = "force-dynamic";

// Admin-only: list a Carmelita project's scenario sets, for the project editor's
// "default scenario set" picker. Fetched lazily client-side so the (sometimes flaky)
// foresight platform can't block the admin page — returns [] with an error note on failure.
export async function GET(req: Request) {
  if (!(await getSessionUser()))
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const ref = new URL(req.url).searchParams.get("ref")?.trim();
  if (!ref) return NextResponse.json({ sets: [] });

  try {
    const sets = await getScenarioSets(ref);
    return NextResponse.json({
      sets: sets.map((s) => ({ id: s.id, domain: s.domain, scenarioCount: s.scenarioCount })),
    });
  } catch (err) {
    console.error("[GET admin/scenario-sets]", err);
    return NextResponse.json({ sets: [], error: "Could not load scenario sets from the platform." });
  }
}
