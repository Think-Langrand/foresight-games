import { NextResponse } from "next/server";
import {
  getSessionResults,
  updateSession,
  getSessionByCode,
  deleteSession,
  supabaseConfigured,
  type SessionStatus,
} from "@/lib/workshop";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  if (!supabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
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
  if (!supabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  const { code } = await params;
  let body: { status?: SessionStatus; prompt?: string; currentUncertaintyId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  try {
    const session = await getSessionByCode(code);
    if (!session) return NextResponse.json({ error: "Session not found." }, { status: 404 });
    await updateSession(session.id, session.code, body);
    const results = await getSessionResults(code, { force: true });
    return NextResponse.json(results);
  } catch (err) {
    console.error("[PATCH /api/sessions/:code]", err);
    return NextResponse.json({ error: "Failed to update session." }, { status: 500 });
  }
}

// Admin: delete a session (cascades to its teams/submissions/responses).
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  if (!supabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  const { code } = await params;
  try {
    await deleteSession(code);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/sessions/:code]", err);
    return NextResponse.json({ error: "Failed to delete session." }, { status: 500 });
  }
}
