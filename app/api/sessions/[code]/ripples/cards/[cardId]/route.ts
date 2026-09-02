import { NextResponse } from "next/server";
import { getSessionByCode, supabaseConfigured } from "@/lib/workshop";
import {
  deleteCard,
  flagCard,
  getPlayerByParticipant,
  getRippleCard,
  updateCardSort,
  updateCardText,
  voteCard,
} from "@/lib/ripples";
import { CARD_TEXT_MAX, resolveConfig } from "@/lib/ripples-types";

export const dynamic = "force-dynamic";

// CHALLENGE a card as "today-thinking". flag surfaces it; a team-majority of votes
// greys it. Only during the rounds, only when enabled, only on your own board.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ code: string; cardId: string }> }
) {
  if (!supabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  const { code, cardId } = await params;
  let body: {
    action?: "flag" | "vote" | "reorder" | "text";
    participantId?: string;
    sort?: number;
    text?: string;
  } = {};
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
    if (session.phase !== "BUILD") {
      return NextResponse.json({ error: "Not editable right now." }, { status: 403 });
    }

    const player = await getPlayerByParticipant(session.code, body.participantId ?? "");
    if (!player) return NextResponse.json({ error: "Join the session first." }, { status: 403 });

    const card = await getRippleCard(session.code, cardId);
    if (!card) return NextResponse.json({ error: "Card not found." }, { status: 404 });
    if (card.teamId !== player.teamId) {
      return NextResponse.json({ error: "That card is on another board." }, { status: 403 });
    }
    const config = resolveConfig(session.config);

    // Reorder a brainstorm sticky — team-scoped, no challenge needed.
    if (body.action === "reorder") {
      await updateCardSort(session.code, cardId, typeof body.sort === "number" ? body.sort : 0);
      return NextResponse.json({ ok: true });
    }

    // Edit a card's text in place — author-owned, EXCEPT on a shared-team board (design
    // groups) where the whole group co-owns the worksheet and any member may edit any card.
    if (body.action === "text") {
      if (!config.sharedTeam && card.authorPlayerId !== player.id) {
        return NextResponse.json({ error: "You can only edit your own card." }, { status: 403 });
      }
      const text = (body.text ?? "").trim();
      if (text.length < 1 || text.length > CARD_TEXT_MAX) {
        return NextResponse.json(
          { error: `Card text must be 1–${CARD_TEXT_MAX} characters.` },
          { status: 400 }
        );
      }
      await updateCardText(session.code, cardId, text);
      return NextResponse.json({ ok: true });
    }

    if (!config.challengeEnabled) {
      return NextResponse.json({ error: "Challenge is disabled." }, { status: 403 });
    }

    if (body.action === "flag") {
      await flagCard(session.code, cardId);
      return NextResponse.json({ ok: true, flagged: true });
    }
    if (body.action === "vote") {
      const result = await voteCard({
        sessionId: session.id,
        code: session.code,
        cardId,
        teamId: card.teamId,
        playerId: player.id,
      });
      return NextResponse.json({ ok: true, ...result });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err) {
    console.error("[PATCH ripples/cards/:id]", err);
    return NextResponse.json({ error: "Failed to update card." }, { status: 500 });
  }
}

// Delete one of your own cards (its children cascade). Lets a player redo an
// answer — since each round slot holds a single entry.
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ code: string; cardId: string }> }
) {
  if (!supabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  const { code, cardId } = await params;
  let body: { participantId?: string } = {};
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
    if (session.status === "Closed") {
      return NextResponse.json({ error: "Session is closed." }, { status: 403 });
    }

    const player = await getPlayerByParticipant(session.code, body.participantId ?? "");
    if (!player) return NextResponse.json({ error: "Join the session first." }, { status: 403 });

    const card = await getRippleCard(session.code, cardId);
    if (!card) return NextResponse.json({ ok: true }); // already gone
    if (card.teamId !== player.teamId) {
      return NextResponse.json({ error: "That card is on another board." }, { status: 403 });
    }
    // Author-owned, EXCEPT on a shared-team board where the group co-owns the board.
    const config = resolveConfig(session.config);
    if (!config.sharedTeam && card.authorPlayerId !== player.id) {
      return NextResponse.json({ error: "You can only delete your own card." }, { status: 403 });
    }

    await deleteCard(session.code, cardId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE ripples/cards/:id]", err);
    return NextResponse.json({ error: "Failed to delete card." }, { status: 500 });
  }
}
