import { NextResponse } from "next/server";
import { getSessionByCode, supabaseConfigured } from "@/lib/workshop";
import {
  countPlayerChips,
  getPlayerByParticipant,
  getRippleCard,
  placeChip,
  removeChip,
} from "@/lib/ripples";
import { resolveConfig } from "@/lib/ripples-types";

export const dynamic = "force-dynamic";

// Place a wager chip. Only during WAGER, only on your own board, within the
// per-player budget, max one chip per card (DB unique → 409).
export async function POST(
  req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  if (!supabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  const { code } = await params;
  let body: { participantId?: string; cardId?: string } = {};
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
    if (session.phase !== "WAGER") {
      return NextResponse.json({ error: "Wagering isn't open." }, { status: 403 });
    }

    const player = await getPlayerByParticipant(session.code, body.participantId ?? "");
    if (!player) return NextResponse.json({ error: "Join the session first." }, { status: 403 });

    if (!body.cardId) return NextResponse.json({ error: "cardId is required." }, { status: 400 });
    const card = await getRippleCard(session.code, body.cardId);
    if (!card) return NextResponse.json({ error: "Card not found." }, { status: 404 });
    if (card.teamId !== player.teamId) {
      return NextResponse.json({ error: "You can only chip your own board." }, { status: 403 });
    }
    if (card.greyed) {
      return NextResponse.json({ error: "Can't chip a challenged card." }, { status: 400 });
    }

    const config = resolveConfig(session.config);
    const spent = await countPlayerChips(session.code, player.id);
    if (spent >= config.chipsPerPlayer) {
      return NextResponse.json({ error: "No chips left." }, { status: 403 });
    }

    try {
      const chip = await placeChip({
        sessionId: session.id,
        code: session.code,
        teamId: player.teamId,
        playerId: player.id,
        cardId: card.id,
      });
      return NextResponse.json({ chip });
    } catch (err) {
      if ((err as { code?: string }).code === "23505") {
        return NextResponse.json({ error: "Already chipped this card." }, { status: 409 });
      }
      throw err;
    }
  } catch (err) {
    console.error("[POST ripples/chips]", err);
    return NextResponse.json({ error: "Failed to place chip." }, { status: 500 });
  }
}

// Remove one of your chips (only while wagering is still open).
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  if (!supabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  const { code } = await params;
  let body: { participantId?: string; cardId?: string } = {};
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
    if (session.phase !== "WAGER") {
      return NextResponse.json({ error: "Chips are locked." }, { status: 403 });
    }
    const player = await getPlayerByParticipant(session.code, body.participantId ?? "");
    if (!player) return NextResponse.json({ error: "Join the session first." }, { status: 403 });
    if (!body.cardId) return NextResponse.json({ error: "cardId is required." }, { status: 400 });

    await removeChip({ code: session.code, playerId: player.id, cardId: body.cardId });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE ripples/chips]", err);
    return NextResponse.json({ error: "Failed to remove chip." }, { status: 500 });
  }
}
