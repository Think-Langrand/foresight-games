import { NextResponse } from "next/server";
import { getSessionByCode, supabaseConfigured } from "@/lib/workshop";
import { getPlayerByParticipant, submitAnswers } from "@/lib/ripples";

export const dynamic = "force-dynamic";

// Submit the reflection answers after the three rounds. Stores this player's
// answers (keyed by question index) and marks them submitted.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  if (!supabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  const { code } = await params;
  let body: { participantId?: string; answers?: string[] } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const session = await getSessionByCode(code);
    if (!session) return NextResponse.json({ error: "Session not found." }, { status: 404 });
    if (session.scope !== "Ripples") {
      return NextResponse.json({ error: "Not an implication-mapping session." }, { status: 400 });
    }
    if (session.phase !== "BUILD") {
      return NextResponse.json({ error: "The worksheet isn't open." }, { status: 403 });
    }

    const player = await getPlayerByParticipant(session.code, body.participantId ?? "");
    if (!player) return NextResponse.json({ error: "Join the session first." }, { status: 403 });

    // Store answers keyed by question index, trimmed to a sane length.
    const answers: Record<string, string> = {};
    (body.answers ?? []).forEach((a, i) => {
      if (typeof a === "string" && a.trim()) answers[String(i)] = a.trim().slice(0, 2000);
    });

    await submitAnswers({
      code: session.code,
      playerId: player.id,
      answers,
      submittedAt: new Date().toISOString(),
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[POST ripples/submit]", err);
    return NextResponse.json({ error: "Failed to submit." }, { status: 500 });
  }
}
