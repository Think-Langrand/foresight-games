import { NextResponse } from "next/server";
import { getSessionByCode, supabaseConfigured } from "@/lib/workshop";
import { joinRipples } from "@/lib/ripples";

export const dynamic = "force-dynamic";

// Join a Ripples session: create-or-get this device's player on a team. Idempotent
// on participantId (a refresh rejoins the same player). Either join an existing
// board (teamId) or create a new one (teamName).
export async function POST(
  req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  if (!supabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  const { code } = await params;
  let body: { teamId?: string; teamName?: string; displayName?: string; participantId?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body.participantId) {
    return NextResponse.json({ error: "participantId is required." }, { status: 400 });
  }

  try {
    const session = await getSessionByCode(code);
    if (!session) return NextResponse.json({ error: "Session not found." }, { status: 404 });
    if (session.scope !== "Ripples") {
      return NextResponse.json({ error: "Not a Ripples session." }, { status: 400 });
    }
    if (session.status === "Closed") {
      return NextResponse.json({ error: "Session is closed." }, { status: 403 });
    }

    const { team, player } = await joinRipples({
      sessionId: session.id,
      code: session.code,
      participantId: body.participantId,
      displayName: (body.displayName ?? "").trim().slice(0, 60),
      teamId: body.teamId,
      teamName: body.teamName?.slice(0, 60),
      projectId: session.projectId,
    });
    return NextResponse.json({ team, player });
  } catch (err) {
    if (err instanceof Error && err.message === "TEAM_NOT_FOUND") {
      return NextResponse.json({ error: "Team not found." }, { status: 404 });
    }
    console.error("[POST ripples/players]", err);
    return NextResponse.json({ error: "Failed to join." }, { status: 500 });
  }
}
