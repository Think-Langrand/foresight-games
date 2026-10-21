import { NextResponse } from "next/server";
import { getSessionByCode, supabaseConfigured } from "@/lib/workshop";
import { getPlayerByParticipant } from "@/lib/ripples";
import {
  MIGRATION_0029_MISSING,
  getExerciseBySessionCode,
  submitExercise,
  unsubmitExercise,
} from "@/lib/design-group-exercises";

export const dynamic = "force-dynamic";

// The GROUP's own "we are finished with this week", written from Session 4's review step.
//
// NOT ../submit, which is the solo path: that one stores ONE PLAYER's reflection answers on
// their ripple_players row (submitAnswers in lib/ripples.ts). A shared board's submit is a
// statement about the whole week, so it lands on design_group_exercises instead — two
// columns added by migration 0029.
//
// IT LOCKS NOTHING. The board is as editable the moment after a submit as the moment
// before, which is the point: a group that spots a typo in its own handoff can fix it
// without asking an admin to unlock anything. Locking is a separate, admin act. Because
// nothing is gated on it, a mis-click costs nothing and DELETE undoes it.
//
// ANY MEMBER OF THE BOARD MAY SUBMIT, and may undo anyone's submit. A shared board has no
// owner and no roles, and these four weeks are worked asynchronously by people who are not
// in the room together — a rule like "only the person who submitted may undo" would strand
// a group whose submitter has gone home. The display name is recorded so the act is
// attributable even though it is not restricted.

// Resolve the caller to a player on this board and to the week the board belongs to. Both
// routes need exactly this, and both refusals are the same, so they are written once.
async function resolve(code: string, participantId: string) {
  const session = await getSessionByCode(code);
  if (!session) return { error: "Session not found.", status: 404 as const };
  if (session.scope !== "Ripples") {
    return { error: "Not a Ripples session.", status: 400 as const };
  }

  // Deliberately NO phase check, unlike every write route on this board. Those refuse
  // outside BUILD because they change the board; this one records a fact about the week.
  // A group reaching the review step just as a facilitator locks the board should still be
  // able to say it finished.

  const player = await getPlayerByParticipant(session.code, participantId);
  if (!player) return { error: "Join the session first.", status: 403 as const };

  const exercise = await getExerciseBySessionCode(session.code);
  if (!exercise) {
    // A standalone Ripples session with no design-group week behind it. There is nowhere to
    // record a submit, and silently succeeding would show the group a submitted state that
    // vanishes on reload.
    return { error: "This board is not part of a design group week.", status: 400 as const };
  }
  return { player, exercise };
}

// A read of a week degrades gracefully when migration 0029 is missing, but a write cannot:
// there is nowhere to put the stamp. Say so, rather than "something went wrong", so whoever
// sees it knows it is an unapplied migration and not their board.
const failed = (err: unknown, what: "Submitting" | "Undoing") =>
  err instanceof Error && err.message === MIGRATION_0029_MISSING
    ? { error: `${what} is not available yet on this server.`, status: 503 }
    : { error: `${what === "Submitting" ? "Failed to submit." : "Failed to undo."}`, status: 500 };

export async function POST(
  req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
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

    // Already submitted: report the EXISTING stamp rather than overwriting it. Two people
    // pressing Submit within a second of each other is the normal case on a shared board,
    // and the second press must not relabel the week with the second name.
    if (r.exercise.submittedAt) {
      return NextResponse.json({
        ok: true,
        submittedAt: r.exercise.submittedAt,
        submittedBy: r.exercise.submittedBy,
      });
    }

    await submitExercise(r.exercise.id, r.player.displayName);
    // Re-read rather than echoing a locally built timestamp, so the client shows the same
    // instant the database stored and a second viewer's poll agrees with it.
    //
    // `r.exercise.sessionCode`, never the raw URL `code`: getExerciseBySessionCode matches
    // exactly, so a differently-cased code would write the stamp and then fail to read it
    // back, and the group would be told its submit did not land.
    const after = await getExerciseBySessionCode(r.exercise.sessionCode ?? code);
    return NextResponse.json({
      ok: true,
      submittedAt: after?.submittedAt ?? null,
      submittedBy: after?.submittedBy ?? null,
    });
  } catch (err) {
    console.error("[POST ripples/board-submit]", err);
    const { error, status } = failed(err, "Submitting");
    return NextResponse.json({ error }, { status });
  }
}

// Undo. Idempotent: undoing a week that is not submitted is a 200, because the only way to
// get here is a second click on a control that has already gone back to "Submit".
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
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

    if (r.exercise.submittedAt) await unsubmitExercise(r.exercise.id);
    return NextResponse.json({ ok: true, submittedAt: null, submittedBy: null });
  } catch (err) {
    console.error("[DELETE ripples/board-submit]", err);
    const { error, status } = failed(err, "Undoing");
    return NextResponse.json({ error }, { status });
  }
}
