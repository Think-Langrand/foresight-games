import { NextResponse } from "next/server";
import { getSessionByCode, supabaseConfigured } from "@/lib/workshop";
import { addCard, getPlayerByParticipant, getRippleCard } from "@/lib/ripples";
import { CARD_TEXT_MAX, type CardOrder } from "@/lib/ripples-types";

export const dynamic = "force-dynamic";

const ORDERS: CardOrder[] = ["FIRST", "SECOND", "TERMINAL", "STICKY"];

// Submit an implication card. The team is derived from the player (never trusted
// from the client). Phase + parent rules are enforced server-side.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  if (!supabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  const { code } = await params;
  let body: {
    participantId?: string;
    cardOrder?: string;
    parentCardId?: string | null;
    text?: string;
    sort?: number;
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
    if (session.status === "Closed") {
      return NextResponse.json({ error: "Session is closed." }, { status: 403 });
    }

    const player = await getPlayerByParticipant(session.code, body.participantId ?? "");
    if (!player) return NextResponse.json({ error: "Join the session first." }, { status: 403 });

    const order = body.cardOrder as CardOrder;
    if (!ORDERS.includes(order)) {
      return NextResponse.json({ error: "Invalid card order." }, { status: 400 });
    }

    // The whole tree is built during one BUILD phase.
    if (session.phase !== "BUILD") {
      return NextResponse.json({ error: "Not accepting cards right now." }, { status: 403 });
    }

    const text = (body.text ?? "").trim();
    if (text.length < 1 || text.length > CARD_TEXT_MAX) {
      return NextResponse.json(
        { error: `Card text must be 1–${CARD_TEXT_MAX} characters.` },
        { status: 400 }
      );
    }

    // Tree shape: a FIRST card (key change) hangs off the scenario root with no
    // parent; SECOND builds on a FIRST; TERMINAL builds on a SECOND. STICKY is a
    // freeform brainstorm note with no parent (independent of the tree). Any number
    // of children per node.
    let parentId: string | null = null;
    if (order === "FIRST" || order === "STICKY") {
      if (body.parentCardId) {
        return NextResponse.json({ error: "This card has no parent." }, { status: 400 });
      }
    } else {
      if (!body.parentCardId) {
        return NextResponse.json({ error: "This must build on a parent node." }, { status: 400 });
      }
      const parent = await getRippleCard(session.code, body.parentCardId);
      if (!parent) return NextResponse.json({ error: "Parent card not found." }, { status: 404 });
      if (parent.teamId !== player.teamId) {
        return NextResponse.json({ error: "Parent is on another board." }, { status: 400 });
      }
      if (parent.greyed) {
        return NextResponse.json({ error: "Can't build on a challenged card." }, { status: 400 });
      }
      const needed = order === "SECOND" ? "FIRST" : "SECOND";
      if (parent.order !== needed) {
        return NextResponse.json({ error: "Build on the previous level's node." }, { status: 400 });
      }
      parentId = parent.id;
    }

    const card = await addCard({
      sessionId: session.id,
      code: session.code,
      teamId: player.teamId,
      authorPlayerId: player.id,
      order,
      parentId,
      text,
      sort: typeof body.sort === "number" ? body.sort : 0,
    });
    return NextResponse.json({ card });
  } catch (err) {
    console.error("[POST ripples/cards]", err);
    return NextResponse.json({ error: "Failed to add card." }, { status: 500 });
  }
}
