import { NextResponse } from "next/server";
import { getSessionByCode, supabaseConfigured, updateSession } from "@/lib/workshop";
import { getPlayerByParticipant } from "@/lib/ripples";
import { getExerciseBySessionCode } from "@/lib/design-group-exercises";
import { getExerciseType } from "@/lib/exercise-types";
import { coerceExecSummary } from "@/lib/exec-summary-shape";

export const dynamic = "force-dynamic";

// The GROUP's own edit of its handoff lead — slide 02 of the deck.
//
// AN OVERLAY. This writes sessions.config.execSummary on the Week 4 board and never touches
// a card. The projection underneath is untouched, so DELETE here restores the slide to what
// Session 4 actually says. See lib/exec-summary-shape.ts for why it is one body of text.
//
// MODELLED ON ../board-submit, the other member-authenticated route that writes something
// other than a ripple_* row, and it inherits two of that route's decisions:
//
//   ANY MEMBER MAY EDIT, and may overwrite another member's edit. A shared board has no
//   owner and no roles, and these weeks are worked asynchronously by people who are not in
//   a room together. The display name is recorded so the act is attributable even though it
//   is not restricted. Last write wins, with no history — acceptable while this is a
//   prototype, and the first thing to revisit if two people ever collide in practice.
//
//   NO PHASE CHECK. Every write route on this board refuses outside BUILD because it
//   changes the board. This one edits a document ABOUT the week, so an admin locking the
//   board to HARVEST should not strand a half-finished lead.
//
// IT IS NOT GATED ON SUBMIT. Migration 0029 is explicit that submitting gates nothing, and
// names "a group that spots a typo in its own handoff" as exactly the case it protects.
// This route is that case.

// Resolve the caller to a player on this board and to the WEEK 4 week behind it.
async function resolve(code: string, participantId: string) {
  const session = await getSessionByCode(code);
  if (!session) return { error: "Session not found.", status: 404 as const };
  if (session.scope !== "Ripples") {
    return { error: "Not a Ripples session.", status: 400 as const };
  }

  const player = await getPlayerByParticipant(session.code, participantId);
  if (!player) return { error: "Join the session first.", status: 403 as const };

  const exercise = await getExerciseBySessionCode(session.code);
  if (!exercise) {
    return { error: "This board is not part of a design group week.", status: 400 as const };
  }

  // WEEK 4 ONLY. board-submit does not need this check because a submit means the same
  // thing on any week; this one does, or a caller with a Week 2 code could park an
  // execSummary on that board's config where nothing would ever read it — or, worse, where
  // a future reader keyed on the wrong week would.
  if (getExerciseType(exercise.type)?.render !== "commitments") {
    return { error: "The handoff summary belongs to Session 4.", status: 400 as const };
  }

  return { session, player, exercise };
}

// Merge one key over a FRESHLY read config blob. The read in `resolve` is not good enough:
// between it and the write, an admin summary run or a theme-name save could have landed,
// and `{ ...stale }` would roll it back. Same reason the admin summary route re-reads.
async function writeExecSummary(code: string, value: unknown) {
  const fresh = await getSessionByCode(code);
  if (!fresh) return false;
  const stored = (fresh.config ?? {}) as Record<string, unknown>;
  await updateSession(fresh.id, fresh.code, { config: { ...stored, execSummary: value } });
  return true;
}

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  if (!supabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  const { code } = await params;
  let body: { participantId?: string; text?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const r = await resolve(code, body.participantId ?? "");
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });

    // editedBy comes from the player row, never from the body: a client that can name
    // itself can name itself anything, and this string is shown on the slide.
    const override = coerceExecSummary({
      text: body.text ?? "",
      editedAt: new Date().toISOString(),
      editedBy: r.player.displayName,
    });

    // Coerced to null = the text was blank. That is a revert, not an empty slide, and it is
    // handled here rather than asking the client to notice and call DELETE instead.
    if (!(await writeExecSummary(r.session.code, override))) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, override });
  } catch (err) {
    console.error("[POST ripples/exec-summary]", err);
    return NextResponse.json({ error: "Failed to save." }, { status: 500 });
  }
}

// Restore the board's words. Idempotent: reverting a slide that was never edited is a 200,
// because the only way to get here is a second click on a control that has already gone.
export async function DELETE(req: Request, { params }: { params: Promise<{ code: string }> }) {
  if (!supabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  const { code } = await params;
  let body: { participantId?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const r = await resolve(code, body.participantId ?? "");
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
    if (!(await writeExecSummary(r.session.code, null))) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, override: null });
  } catch (err) {
    console.error("[DELETE ripples/exec-summary]", err);
    return NextResponse.json({ error: "Failed to restore." }, { status: 500 });
  }
}
