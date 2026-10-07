import { NextResponse } from "next/server";
import { getSessionByCode, supabaseConfigured } from "@/lib/workshop";
import {
  addCard,
  getPlayerByParticipant,
  getRippleCard,
  isUniqueViolation,
  listBoardCards,
  setCardTwinKey,
} from "@/lib/ripples";
import {
  CARD_DESCRIPTION_MAX,
  CARD_TEXT_MAX,
  MAX_TREE_DEPTH,
  depthOfOrder,
  isCardKind,
  isTreeOrder,
  orderAtDepth,
  type CardKind,
  type CardOrder,
} from "@/lib/ripples-types";
import { placementError } from "@/lib/synthesis-shape";

export const dynamic = "force-dynamic";

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
    section?: string | null; // worksheet area key (STICKY only); null = default board
    cardKind?: string | null; // Week 3: theme / hope / fear / risk / opportunity / …
    description?: string | null; // optional longer note, set at creation
    // Week 3: put an implication that is already on this board into ANOTHER theme too.
    // Its text is read from the original, never from the client.
    copyOfCardId?: string | null;
  } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  // Outside the try: the catch needs to know whether a unique violation came from a copy
  // (0024) or from a one-answer question (0025) to say the right thing.
  let copyOfId: string | null = null;
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
    if (order !== "STICKY" && !isTreeOrder(order)) {
      return NextResponse.json({ error: "Invalid card order." }, { status: 400 });
    }

    // Week 3 card kinds. Absent/null = a plain implication, which is what every Week 1-2
    // caller sends, so those paths are unchanged.
    let kind: CardKind | null = null;
    if (body.cardKind != null) {
      if (!isCardKind(body.cardKind)) {
        return NextResponse.json({ error: "Invalid card kind." }, { status: 400 });
      }
      kind = body.cardKind;
    }
    if (kind !== null && order === "STICKY") {
      return NextResponse.json({ error: "A brainstorm note has no kind." }, { status: 400 });
    }

    // The whole tree is built during one BUILD phase.
    if (session.phase !== "BUILD") {
      return NextResponse.json({ error: "Not accepting cards right now." }, { status: 403 });
    }

    // Set at creation so a two-field composer ("what could be lost" + "through what
    // mechanism") is one round trip; creating then patching leaves a described-nothing
    // card behind when the second call fails.
    const description = (body.description ?? "").trim();
    if (description.length > CARD_DESCRIPTION_MAX) {
      return NextResponse.json(
        { error: `A description is at most ${CARD_DESCRIPTION_MAX} characters.` },
        { status: 400 }
      );
    }

    // A copy carries no text of its own — it is read from the original below, so that two
    // cards showing one implication can never drift apart by being typed twice.
    copyOfId =
      typeof body.copyOfCardId === "string" && body.copyOfCardId.length > 0
        ? body.copyOfCardId
        : null;
    const text = (body.text ?? "").trim();
    if ((!copyOfId && text.length < 1) || text.length > CARD_TEXT_MAX) {
      return NextResponse.json(
        { error: `Card text must be 1–${CARD_TEXT_MAX} characters.` },
        { status: 400 }
      );
    }

    // Tree shape: a FIRST card (key change) hangs off the scenario root with no
    // parent; every deeper card builds on the level directly above it. A card's
    // order encodes its depth, so the parent row alone says what its children must
    // be — no chain walk. STICKY is a freeform brainstorm note with no parent
    // (independent of the tree). Any number of children per node.
    let parentId: string | null = null;
    // The parent's kind, for the single placementError call below: undefined = this card
    // is becoming a root.
    let parentKind: CardKind | null | undefined;
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
      // Three distinct refusals, kept apart so the message names the real reason:
      // the parent isn't part of the tree, the chain is already as deep as it goes,
      // or the requested level doesn't follow the parent's.
      const parentDepth = depthOfOrder(parent.order);
      if (parentDepth === null) {
        return NextResponse.json(
          { error: "Build the map on a map node, not a brainstorm note." },
          { status: 400 }
        );
      }
      if (parentDepth >= MAX_TREE_DEPTH) {
        return NextResponse.json(
          { error: `The map is capped at ${MAX_TREE_DEPTH + 1} levels.` },
          { status: 400 }
        );
      }
      if (order !== orderAtDepth(parentDepth + 1)) {
        return NextResponse.json({ error: "Build on the previous level's node." }, { status: 400 });
      }
      if (parent.parked) {
        return NextResponse.json({ error: "Can't build on a parked card." }, { status: 400 });
      }
      parentId = parent.id;
      parentKind = parent.cardKind;
    }

    // Week 3 kind invariants, in ONE place covering both the root and parented paths, and
    // shared with the reparent action so the two cannot drift. A STICKY is forced to
    // kind null above, and placementError(null, undefined) is legal, so notes pass through.
    //
    // The root path used to skip this entirely, which let {cardOrder:"FIRST",
    // cardKind:"hope"} create a card with no theme above it — in the database, drawn by
    // no view, deletable by nobody.
    const misplaced = placementError(kind, parentKind);
    if (misplaced) return NextResponse.json({ error: misplaced }, { status: 400 });

    // --- an implication in a second theme (0023) ---------------------------------
    //
    // Clustering is not a partition. A copy is an ordinary card parented to its theme;
    // what ties it to its siblings is the shared twin key. It is written with a NULL
    // source_card_id on purpose, so it stays out of 0018's unique (code, source_card_id)
    // and admin seeding keeps working exactly as it does today — the lineage disclosure
    // follows the twin to whichever copy holds the Week 2 link.
    let twinKey: string | null = null;
    let copyText: string | null = null;
    if (copyOfId) {
      const original = await getRippleCard(session.code, copyOfId);
      if (!original || original.teamId !== player.teamId) {
        return NextResponse.json({ error: "That card isn't on this board." }, { status: 400 });
      }
      // Only plain implications travel. A theme is the container, and a hope or fear is
      // written about one theme in particular — neither is the same thing in two places.
      // …and the copy is one too: the kind is the original's, never the request's. A
      // body carrying {copyOfCardId, cardKind:"risk"} would otherwise mint a risk that
      // shares a twin key with an implication.
      if (original.cardKind !== null || kind !== null) {
        return NextResponse.json(
          { error: "Only an implication can be in more than one theme." },
          { status: 400 }
        );
      }
      if (parentKind !== "theme") {
        return NextResponse.json({ error: "Copy it into a theme." }, { status: 400 });
      }
      const key = original.twinKey ?? original.id;
      const siblings = (await listBoardCards(session.code)).filter(
        (c) => (c.twinKey ?? c.id) === key
      );
      // Guard the accident the group would otherwise have to spot by eye.
      if (siblings.some((c) => c.parentId === parentId)) {
        return NextResponse.json(
          { error: "That implication is already in this theme." },
          { status: 409 }
        );
      }
      // The original carries no key until it is first copied, so stamp it once. Doing it
      // before the insert means a failure here leaves no half-linked pair behind.
      if (!original.twinKey) await setCardTwinKey(session.code, original.id, key);
      twinKey = key;
      copyText = original.text;
    }

    const card = await addCard({
      sessionId: session.id,
      code: session.code,
      teamId: player.teamId,
      authorPlayerId: player.id,
      order,
      parentId,
      text: copyText ?? text,
      sort: typeof body.sort === "number" ? body.sort : 0,
      // A worksheet buckets sticky cards into named areas; tree cards have no section.
      section: order === "STICKY" && typeof body.section === "string" ? body.section : null,
      cardKind: kind,
      description,
      twinKey,
    });
    return NextResponse.json({ card });
  } catch (err) {
    // Two writers at once, and the database kept the first: a second copy of an
    // implication in one theme (0024), or a second answer to a one-answer question (0025)
    // — two members answering "who benefits?" on the same theme in the same moment. The
    // client refreshes on a 409, so the answer that landed is what everyone then sees.
    if (isUniqueViolation(err)) {
      return NextResponse.json(
        {
          error: copyOfId
            ? "That implication is already in this theme."
            : "Someone answered this a moment ago — refreshing to show it.",
        },
        { status: 409 }
      );
    }
    console.error("[POST ripples/cards]", err);
    return NextResponse.json({ error: "Failed to add card." }, { status: 500 });
  }
}
