import { NextResponse } from "next/server";
import {
  getSessionResults,
  updateSession,
  getSessionByCode,
  deleteSession,
  supabaseConfigured,
  type SessionStatus,
} from "@/lib/workshop";
import { getSessionUser } from "@/lib/supabase-auth";
import { isRipplePhase, resolveConfig, secondsForPhase } from "@/lib/ripples-types";

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
  let body: {
    status?: SessionStatus;
    prompt?: string;
    currentUncertaintyId?: string;
    // Ripples phase machine. phaseEndsAt (ISO string or null) overrides the
    // server-computed deadline (e.g. a "+30s" extend); omit it and the server
    // derives the deadline from config for timed phases.
    phase?: string;
    phaseEndsAt?: string | null;
    config?: Record<string, unknown>;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  try {
    const session = await getSessionByCode(code);
    if (!session) return NextResponse.json({ error: "Session not found." }, { status: 404 });

    const patch: Parameters<typeof updateSession>[2] = {};
    if (body.status) patch.status = body.status;
    if (body.prompt !== undefined) patch.prompt = body.prompt;
    if (body.currentUncertaintyId) patch.currentUncertaintyId = body.currentUncertaintyId;
    if (body.config !== undefined) patch.config = body.config;

    if (body.phase) {
      if (!isRipplePhase(body.phase)) {
        return NextResponse.json({ error: "Invalid phase." }, { status: 400 });
      }
      patch.phase = body.phase;
      if (body.phaseEndsAt !== undefined) {
        patch.phaseEndsAt = body.phaseEndsAt;
      } else {
        // Server-authoritative timer: derive the deadline from config so it is
        // the same timestamp on every client (no facilitator clock skew).
        const cfg = resolveConfig(body.config ?? session.config);
        const secs = secondsForPhase(cfg, body.phase);
        patch.phaseEndsAt = secs ? new Date(Date.now() + secs * 1000).toISOString() : null;
      }
    } else if (body.phaseEndsAt !== undefined) {
      patch.phaseEndsAt = body.phaseEndsAt; // extend/clear without changing phase
    }

    await updateSession(session.id, session.code, patch);

    // Ripples has no submissions/responses to aggregate — return the fresh session.
    if (session.scope === "Ripples") {
      const fresh = await getSessionByCode(code, { force: true });
      return NextResponse.json({ session: fresh });
    }
    const results = await getSessionResults(code, { force: true });
    return NextResponse.json(results);
  } catch (err) {
    console.error("[PATCH /api/sessions/:code]", err);
    return NextResponse.json({ error: "Failed to update session." }, { status: 500 });
  }
}

// Admin-only: delete a session (cascades teams/submissions/responses).
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  if (!supabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { code } = await params;
  try {
    const session = await getSessionByCode(code);
    if (!session) return NextResponse.json({ error: "Session not found." }, { status: 404 });
    await deleteSession(session.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/sessions/:code]", err);
    return NextResponse.json({ error: "Failed to delete session." }, { status: 500 });
  }
}
