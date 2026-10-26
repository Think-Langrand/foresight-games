import { NextResponse } from "next/server";
import { getSessionByCode, supabaseConfigured, updateSession } from "@/lib/workshop";
import { getPlayerByParticipant, listBoardCards } from "@/lib/ripples";
import { getExerciseBySessionCode } from "@/lib/design-group-exercises";
import { getExerciseType, resolveEffectiveSections, COMMITMENTS_STEP_MOVES } from "@/lib/exercise-types";
import { indexCommitmentsBoard } from "@/lib/commitments-shape";
import {
  coerceExecSummary,
  execSummaryReadiness,
  execSummaryReuse,
} from "@/lib/exec-summary-shape";
import { execSummaryFingerprint } from "@/lib/exec-summary-fingerprint";
import { draftExecSummary, type ExecSummaryInput } from "@/lib/analysis/exec-summary";
import { isTreeRoot } from "@/lib/ripples-types";

export const dynamic = "force-dynamic";

// Draft the handoff lead from the group's own Session 4 work.
//
// A SIBLING OF ../route.ts, not a mode of it: that one stores words a human typed, this one
// spends money. Keeping them apart means the save path has no branch that can accidentally
// call a model, and this one can be rate-limited or disabled on its own later.
//
// IT ONLY DRAFTS. The result is returned and stored with source "generated", which is what
// the deck reads to say "drafted" rather than "written by your group". It becomes the
// group's the moment anyone edits a word, and the ordinary save route sets source "edited".
//
// GATED ON THE FOUR EARLIER STEPS, checked again here and not only in the UI: a model call
// is the one thing on this board worth refusing, and a thin summary confidently written
// from three answers is worse than no summary.

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  if (!supabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  const { code } = await params;
  let body: { participantId?: string; force?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const session = await getSessionByCode(code);
    if (!session) return NextResponse.json({ error: "Session not found." }, { status: 404 });
    if (session.scope !== "Ripples") {
      return NextResponse.json({ error: "Not a Ripples session." }, { status: 400 });
    }
    const player = await getPlayerByParticipant(session.code, body.participantId ?? "");
    if (!player) return NextResponse.json({ error: "Join the session first." }, { status: 403 });

    const exercise = await getExerciseBySessionCode(session.code);
    if (!exercise) {
      return NextResponse.json(
        { error: "This board is not part of a design group week." },
        { status: 400 }
      );
    }
    if (getExerciseType(exercise.type)?.render !== "commitments") {
      return NextResponse.json(
        { error: "The handoff summary belongs to Session 4." },
        { status: 400 }
      );
    }

    const existing = coerceExecSummary(
      ((session.config ?? {}) as Record<string, unknown>).execSummary
    );

    // A LEAD THE GROUP WROTE is never regenerated over, whatever is asked. Those are their
    // words; losing them to an automatic run would be the worst bug this feature could have.
    // It answers here, before the board is even read, so no later branch can reach them.
    if (existing?.source === "edited") {
      return NextResponse.json({ ok: true, override: existing, reused: true });
    }

    const cards = await listBoardCards(session.code);
    const sections = resolveEffectiveSections(exercise.type, exercise.sections);
    const changeSecs = sections.filter((s) => s.step !== COMMITMENTS_STEP_MOVES);
    const moveSecs = sections.filter((s) => s.step === COMMITMENTS_STEP_MOVES);
    const answered = (specs: typeof sections) =>
      specs.filter((sec) =>
        cards.some((c) => c.order === "STICKY" && c.section === sec.key && c.text.trim())
      ).length;
    const board = indexCommitmentsBoard(cards);
    const placements = [...board.picks.values()].filter(
      (p) => p.plausibility !== null && p.impact !== null
    );

    // Re-checked server-side. The UI hides the button, but the button is not the rule.
    const readiness = execSummaryReadiness({
      changes: answered(changeSecs),
      changesTotal: changeSecs.length,
      placements: placements.length,
      responses: board.responses.length,
      moves: answered(moveSecs),
      movesTotal: moveSecs.length,
    });
    if (!readiness.ready) {
      return NextResponse.json(
        { error: `Finish these first: ${readiness.missing.join(", ")}.`, missing: readiness.missing },
        { status: 409 }
      );
    }

    const answersFor = (specs: typeof sections) =>
      specs
        .map((sec) => ({
          label: sec.label,
          answers: cards
            .filter((c) => c.order === "STICKY" && c.section === sec.key && c.text.trim())
            .map((c) => c.text.trim()),
        }))
        .filter((b) => b.answers.length > 0);

    // ASSEMBLED BEFORE IT IS DECIDED WHETHER TO DRAFT, because the decision is made on this
    // material and nothing else. It is all local work over cards already in hand.
    const material: ExecSummaryInput = {
      scenarioTitle: session.prompt ?? "",
      changes: answersFor(changeSecs),
      role: answersFor(moveSecs),
      // Session 2's key changes reach this board as seeded copies carrying sourceLabel.
      keyChanges: cards
        .filter((c) => isTreeRoot(c) && c.sourceLabel && c.text.trim())
        .map((c) => c.text.trim())
        .slice(0, 10),
      // Strongest first, so a truncated digest keeps what the group weighted highest.
      stakes: placements
        .map((p) => ({ text: p.text.trim(), score: p.plausibility! * p.impact! }))
        .sort((a, b) => b.score - a.score),
      responses: board.responses.map((r) => r.text.trim()).filter(Boolean),
    };

    // IS THERE ANYTHING TO SAY? A draft built from exactly this material is current however
    // long ago it was written, so reopening a finished board costs nothing and leaves the
    // lead the group is reading alone. A draft built from different material is about the
    // old answers and gets replaced. See execSummaryReuse — this replaced a one-minute
    // clock that could not tell a changed answer from a returning reader.
    //
    // It also still settles the race it was first written for: every member's board fires
    // this the instant the fourth step lands, and once one has written, the rest match the
    // fingerprint and are handed that draft instead of paying for their own.
    const fingerprint = execSummaryFingerprint(material);
    if (execSummaryReuse(existing, fingerprint, body.force === true) === "reuse") {
      return NextResponse.json({ ok: true, override: existing, reused: true });
    }

    const text = await draftExecSummary(material);

    if (!text) {
      return NextResponse.json(
        { error: "Drafting is not available on this server." },
        { status: 503 }
      );
    }

    // Merge over a freshly read blob, as the save route does and for the same reason.
    const fresh = await getSessionByCode(session.code);
    if (!fresh) return NextResponse.json({ error: "Session not found." }, { status: 404 });
    const stored = (fresh.config ?? {}) as Record<string, unknown>;
    const override = coerceExecSummary({
      text,
      source: "generated",
      editedAt: new Date().toISOString(),
      editedBy: "",
      // Stamped so the next run can tell whether the board has moved since.
      sourceHash: fingerprint,
    });
    await updateSession(fresh.id, fresh.code, { config: { ...stored, execSummary: override } });
    return NextResponse.json({ ok: true, override });
  } catch (err) {
    console.error("[POST ripples/exec-summary/generate]", err);
    return NextResponse.json({ error: "Could not draft the summary." }, { status: 500 });
  }
}
