import { NextResponse } from "next/server";
import { getSessionByCode, addSubmission, type Lean } from "@/lib/workshop";
import { airtableConfigured } from "@/lib/airtable";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  if (!airtableConfigured()) {
    return NextResponse.json({ error: "Airtable not configured." }, { status: 503 });
  }
  const { code } = await params;
  let body: {
    text?: string;
    author?: string;
    lean?: Lean | null;
    participantId?: string;
    scenarioUncertaintyId?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const text = body.text?.trim();
  if (!text) return NextResponse.json({ error: "Text is required." }, { status: 400 });
  if (text.length > 600)
    return NextResponse.json({ error: "Text too long (max 600)." }, { status: 400 });

  const session = await getSessionByCode(code);
  if (!session) return NextResponse.json({ error: "Session not found." }, { status: 404 });
  if (session.status === "Closed")
    return NextResponse.json({ error: "Session is closed." }, { status: 403 });

  try {
    const submission = await addSubmission({
      sessionId: session.id,
      code: session.code,
      // Tag with the uncertainty the participant is viewing; fall back to the session's.
      uncertaintyId: body.scenarioUncertaintyId ?? session.uncertaintyId,
      text,
      author: (body.author ?? "").trim().slice(0, 60),
      lean: body.lean ?? null,
      participantId: (body.participantId ?? "anon").slice(0, 60),
    });
    return NextResponse.json({ submission });
  } catch (err) {
    console.error("[POST submissions]", err);
    return NextResponse.json({ error: "Failed to add submission." }, { status: 500 });
  }
}
