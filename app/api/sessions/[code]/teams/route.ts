import { NextResponse } from "next/server";
import { getSessionByCode, supabaseConfigured } from "@/lib/workshop";
import { getTeams, createTeam } from "@/lib/teams";

export const dynamic = "force-dynamic";

// List every team in a Cards session (initial load for the team + present views;
// live updates arrive via Supabase realtime, not polling).
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  if (!supabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  const { code } = await params;
  try {
    const session = await getSessionByCode(code);
    if (!session) return NextResponse.json({ error: "Session not found." }, { status: 404 });
    const teams = await getTeams(session.code);
    return NextResponse.json(
      { session, teams, fetchedAt: Date.now() },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("[GET teams]", err);
    return NextResponse.json({ error: "Failed to load teams." }, { status: 500 });
  }
}

// Create (or "join" by creating) a team — deals its seed + hand server-side.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  if (!supabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  const { code } = await params;
  let body: { name?: string } = {};
  try {
    body = await req.json();
  } catch {
    // A body is optional (name defaults to "Team N").
  }

  try {
    const session = await getSessionByCode(code);
    if (!session) return NextResponse.json({ error: "Session not found." }, { status: 404 });
    if (session.status === "Closed")
      return NextResponse.json({ error: "Session is closed." }, { status: 403 });

    const team = await createTeam({
      sessionId: session.id,
      code: session.code,
      name: (body.name ?? "").trim().slice(0, 60),
    });
    return NextResponse.json({ team });
  } catch (err) {
    console.error("[POST teams]", err);
    return NextResponse.json({ error: "Failed to create team." }, { status: 500 });
  }
}
