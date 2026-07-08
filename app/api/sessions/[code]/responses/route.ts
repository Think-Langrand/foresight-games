import { NextResponse } from "next/server";
import { getSessionByCode, addResponse, type ResponseKind } from "@/lib/workshop";
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
    kind?: ResponseKind;
    submissionId?: string | null;
    outcomeId?: string | null;
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

  const session = await getSessionByCode(code);
  if (!session) return NextResponse.json({ error: "Session not found." }, { status: 404 });
  if (session.status === "Closed")
    return NextResponse.json({ error: "Session is closed." }, { status: 403 });

  try {
    await addResponse({
      sessionId: session.id,
      code: session.code,
      participantId: (body.participantId ?? "anon").slice(0, 60),
      kind: body.kind,
      submissionId: body.submissionId ?? null,
      outcomeId: body.outcomeId ?? null,
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
