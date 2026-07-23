import { NextResponse } from "next/server";
import {
  getSessionByCode,
  addResponse,
  removeUpvote,
  supabaseConfigured,
  type ResponseKind,
} from "@/lib/workshop";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  if (!supabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  const { code } = await params;
  let body: {
    kind?: ResponseKind;
    submissionId?: string | null;
    scenarioUncertaintyId?: string;
    pollKey?: string;
    value?: string;
    valueNumber?: number | null;
    participantId?: string;
    label?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body.kind) return NextResponse.json({ error: "kind is required." }, { status: 400 });

  try {
    const session = await getSessionByCode(code);
    if (!session) return NextResponse.json({ error: "Session not found." }, { status: 404 });
    if (session.status === "Closed")
      return NextResponse.json({ error: "Session is closed." }, { status: 403 });

    await addResponse({
      sessionId: session.id,
      code: session.code,
      uncertaintyId: body.scenarioUncertaintyId ?? session.uncertaintyId,
      participantId: (body.participantId ?? "anon").slice(0, 60),
      kind: body.kind,
      submissionId: body.submissionId ?? null,
      pollKey: body.pollKey,
      value: body.value,
      valueNumber: body.valueNumber ?? null,
      label: body.label,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[POST responses]", err);
    return NextResponse.json({ error: "Failed to record response." }, { status: 500 });
  }
}

// Remove a participant's upvote from a submission (toggle off).
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  if (!supabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  const { code } = await params;
  let body: { participantId?: string; submissionId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body.submissionId)
    return NextResponse.json({ error: "submissionId is required." }, { status: 400 });

  try {
    const session = await getSessionByCode(code);
    if (!session) return NextResponse.json({ error: "Session not found." }, { status: 404 });
    if (session.status === "Closed")
      return NextResponse.json({ error: "Session is closed." }, { status: 403 });

    await removeUpvote({
      code: session.code,
      participantId: (body.participantId ?? "anon").slice(0, 60),
      submissionId: body.submissionId,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE responses]", err);
    return NextResponse.json({ error: "Failed to remove upvote." }, { status: 500 });
  }
}
