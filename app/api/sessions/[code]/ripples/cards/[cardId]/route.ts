import { NextResponse } from "next/server";
import { getSessionByCode, supabaseConfigured } from "@/lib/workshop";
import {
  applyReparent,
  deleteCard,
  flagCard,
  getPlayerByParticipant,
  getRippleCard,
  listBoardCards,
  scoreCard,
  setCardParked,
  setCardShortlisted,
  updateCardDescription,
  updateCardSort,
  updateCardText,
  voteCard,
} from "@/lib/ripples";
import {
  CARD_DESCRIPTION_MAX,
  CARD_TEXT_MAX,
  isTreeRoot,
  planReparent,
  resolveConfig,
  type ReparentRefusal,
} from "@/lib/ripples-types";
import { indexSynthesisBoard, placementError } from "@/lib/synthesis-shape";

// One human sentence per refusal planReparent can return — the reasons exist so the
// message can name the real cause, like the POST route's three distinct parent refusals.
const REPARENT_MESSAGES: Record<ReparentRefusal, string> = {
  NOT_TREE_CARD: "That card can't be moved there.",
  PARENT_NOT_FOUND: "That group no longer exists — reload the board.",
  PARENT_NOT_PLACED: "That group isn't on the board any more — reload and try again.",
  PARENT_UNAVAILABLE: "That group is parked or has been challenged out.",
  CYCLE: "A card can't be moved inside itself.",
  TOO_DEEP: "That chain is already as deep as it goes.",
  NO_CHANGE: "It's already there.",
};
import { AXIS_LABELS, SCORE_AXES, SCORE_MAX, SCORE_MIN, coerceScore } from "@/lib/ripples-scoring";

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
    action?:
      | "flag"
      | "vote"
      | "reorder"
      | "text"
      | "description"
      | "score"
      | "reparent"
      | "park"
      | "shortlist";
    participantId?: string;
    sort?: number;
    text?: string;
    description?: string | null;
    plausibility?: number | null;
    impact?: number | null;
    parentCardId?: string | null;
    parked?: boolean;
    shortlisted?: boolean;
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

    // Score a KEY CHANGE on the 1–5 plausibility / impact axes (the rank step). One
    // shared score per card — a group decision, not a per-member average — so the same
    // co-ownership rule as the text edit below applies: on a shared board anyone may set
    // it. Partial by design: each button row sends only its own axis.
    //
    // Sits ABOVE the challengeEnabled gate deliberately — design-group boards have
    // challenge off, and they are exactly the boards that rank.
    if (body.action === "score") {
      if (!config.scoringEnabled) {
        return NextResponse.json({ error: "Ranking is off for this board." }, { status: 403 });
      }
      if (!config.sharedTeam && card.authorPlayerId !== player.id) {
        return NextResponse.json({ error: "You can only score your own card." }, { status: 403 });
      }
      if (!isTreeRoot(card)) {
        return NextResponse.json({ error: "Only key changes can be scored." }, { status: 400 });
      }
      const patch: { plausibility?: number | null; impact?: number | null } = {};
      for (const axis of SCORE_AXES) {
        if (!(axis in body)) continue; // absent → leave that axis as it is
        const raw = body[axis];
        if (raw === null) {
          patch[axis] = null; // explicit clear (un-score)
          continue;
        }
        const value = coerceScore(raw);
        if (value === null) {
          return NextResponse.json(
            { error: `${AXIS_LABELS[axis]} must be ${SCORE_MIN}–${SCORE_MAX}.` },
            { status: 400 }
          );
        }
        patch[axis] = value;
      }
      if (Object.keys(patch).length === 0) {
        return NextResponse.json({ error: "No score to set." }, { status: 400 });
      }
      await scoreCard(session.code, cardId, patch);
      return NextResponse.json({ ok: true, ...patch });
    }

    // A theme's optional note about what it means. Empty clears it. Same co-ownership
    // rule as the text edit below.
    if (body.action === "description") {
      if (!config.sharedTeam && card.authorPlayerId !== player.id) {
        return NextResponse.json({ error: "You can only edit your own card." }, { status: 403 });
      }
      const raw = (body.description ?? "").trim();
      if (raw.length > CARD_DESCRIPTION_MAX) {
        return NextResponse.json(
          { error: `A description is at most ${CARD_DESCRIPTION_MAX} characters.` },
          { status: 400 }
        );
      }
      await updateCardDescription(session.code, cardId, raw || null);
      return NextResponse.json({ ok: true, description: raw || null });
    }

    // Cluster a card into a theme, un-cluster it back to the tray (parentCardId: null), or
    // re-hang a whole subtree — Week 3's drag board. Depth is encoded in card_order, so the
    // move rewrites the order of this card AND of every descendant under it; planReparent
    // works that out from the whole board and applyReparent writes it deepest-first.
    //
    // Sits ABOVE the challengeEnabled gate deliberately, like `score` below: design-group
    // boards have challenge off, and they are exactly the boards that cluster.
    if (body.action === "reparent") {
      if (!config.sharedTeam && card.authorPlayerId !== player.id) {
        return NextResponse.json({ error: "You can only move your own card." }, { status: 403 });
      }
      const parentId = body.parentCardId ?? null;
      // The SAME kind rules the add-a-card route applies. Without this a theme's answer
      // could be dragged out to a root, where no view draws it and nobody can delete it.
      if (parentId === null) {
        const misplaced = placementError(card.cardKind, undefined);
        if (misplaced) return NextResponse.json({ error: misplaced }, { status: 400 });
      } else {
        const parent = await getRippleCard(session.code, parentId);
        if (!parent) {
          return NextResponse.json({ error: REPARENT_MESSAGES.PARENT_NOT_FOUND }, { status: 404 });
        }
        if (parent.teamId !== player.teamId) {
          return NextResponse.json({ error: "That card is on another board." }, { status: 403 });
        }
        const misplaced = placementError(card.cardKind, parent.cardKind);
        if (misplaced) return NextResponse.json({ error: misplaced }, { status: 400 });
      }
      const boardCards = await listBoardCards(session.code);
      const plan = planReparent(
        boardCards.filter((c) => c.teamId === card.teamId),
        cardId,
        parentId
      );
      if (!plan.ok) {
        return NextResponse.json({ error: REPARENT_MESSAGES[plan.reason] }, { status: 400 });
      }
      await applyReparent(session.code, cardId, parentId, plan.moves);
      const own = plan.moves.find((m) => m.cardId === cardId);
      return NextResponse.json({ ok: true, parentCardId: parentId, cardOrder: own?.order });
    }

    // Week 3 step 4: pick this out as one of the three to explain to the committee.
    // Only the analytical cards can be shortlisted — a hope is not a finding and a theme
    // is the container. Refused by kind, the same way park refuses a theme.
    //
    // Assumptions joined the list because step 4 also asks which of them were challenged
    // in a way that surprised the group; that is a finding about the group's own thinking,
    // and the doc names it as a workshop output.
    if (body.action === "shortlist") {
      if (!config.sharedTeam && card.authorPlayerId !== player.id) {
        return NextResponse.json({ error: "You can only change your own card." }, { status: 403 });
      }
      if (typeof body.shortlisted !== "boolean") {
        return NextResponse.json({ error: "shortlisted must be true or false." }, { status: 400 });
      }
      if (
        card.cardKind !== "risk" &&
        card.cardKind !== "opportunity" &&
        card.cardKind !== "assumption"
      ) {
        return NextResponse.json(
          { error: "Only a risk, an opportunity or an assumption can go on the shortlist." },
          { status: 400 }
        );
      }
      await setCardShortlisted(session.code, cardId, body.shortlisted);
      return NextResponse.json({ ok: true, shortlisted: body.shortlisted });
    }

    // Park a card in Week 3's tray — set aside, not deleted, and draggable back out. Uses
    // the dedicated `parked` column, never `greyed` (that one belongs to challenge voting).
    if (body.action === "park") {
      if (!config.sharedTeam && card.authorPlayerId !== player.id) {
        return NextResponse.json({ error: "You can only park your own card." }, { status: 403 });
      }
      if (typeof body.parked !== "boolean") {
        return NextResponse.json({ error: "parked must be true or false." }, { status: 400 });
      }
      // A theme is emptied and deleted, never parked — parking one would hide its whole
      // cluster along with it.
      if (card.cardKind === "theme") {
        return NextResponse.json(
          { error: "A theme can't be parked — empty it and delete it instead." },
          { status: 400 }
        );
      }
      await setCardParked(session.code, cardId, body.parked);
      return NextResponse.json({ ok: true, parked: body.parked });
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

    // parent_card_id is ON DELETE CASCADE (migration 0007), so deleting a Week 3 theme
    // would silently take its whole subtree with it — every implication seeded in from
    // Week 2 and every hope/fear chain hanging off it. Refuse while it still holds
    // implications; the group drags them out or parks them first. (Hope/fear children are
    // the theme's own work and go with it — the client confirm names the count.)
    if (card.cardKind === "theme") {
      const board = await listBoardCards(session.code);
      const cluster = indexSynthesisBoard(board.filter((c) => c.teamId === card.teamId)).clusters;
      const held = cluster.get(cardId)?.length ?? 0;
      if (held > 0) {
        return NextResponse.json(
          {
            error: `This theme still holds ${held} implication${held === 1 ? "" : "s"}. Move them out or park them first.`,
          },
          { status: 409 }
        );
      }
    }

    await deleteCard(session.code, cardId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE ripples/cards/:id]", err);
    return NextResponse.json({ error: "Failed to delete card." }, { status: 500 });
  }
}
