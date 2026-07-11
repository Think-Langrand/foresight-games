import { NextResponse } from "next/server";
import {
  getSessionResults,
  updateSession,
  getSessionByCode,
  type SessionStatus,
} from "@/lib/workshop";
import { airtableConfigured } from "@/lib/airtable";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  if (!airtableConfigured()) {
    return NextResponse.json({ error: "Airtable not configured." }, { status: 503 });
  }
  const { code } = await params;
  try {
    const results = await getSessionResults(code);
    if (!results) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }
    return NextResponse.json(results, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("[GET /api/sessions/:code]", err);
    return NextResponse.json({ error: "Failed to load session." }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  if (!airtableConfigured()) {
    return NextResponse.json({ error: "Airtable not configured." }, { status: 503 });
  }
  const { code } = await params;
  let body: { status?: SessionStatus; prompt?: string; currentUncertaintyId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const session = await getSessionByCode(code);
  if (!session) return NextResponse.json({ error: "Session not found." }, { status: 404 });
  try {
    await updateSession(session.id, session.code, body);
    const results = await getSessionResults(code, { force: true });
    return NextResponse.json(results);
  } catch (err) {
    console.error("[PATCH /api/sessions/:code]", err);
    return NextResponse.json({ error: "Failed to update session." }, { status: 500 });
  }
}
