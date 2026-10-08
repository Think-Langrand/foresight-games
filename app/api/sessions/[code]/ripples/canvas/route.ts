import { NextResponse } from "next/server";
import { getSessionByCode, supabaseConfigured } from "@/lib/workshop";
import {
  getCanvasLayout,
  getPlayerByParticipant,
  listBoardCards,
  upsertCanvasLayout,
} from "@/lib/ripples";
import { implicationKey } from "@/lib/synthesis-shape";
import type { CanvasCardPos, Region } from "@/lib/canvas-shape";

export const dynamic = "force-dynamic";

// Where things sit on the Session 3 clustering canvas (0028).
//
// Kept off /ripples on purpose: that payload is fetched by the Present views and the admin
// rollups, which will never draw a canvas, and a position is the highest-frequency write
// on the board. The browser reads this through its own realtime channel.
//
// MEMBERSHIP IS NOT WRITTEN HERE. A card's theme is still parent_card_id, written by the
// cards routes, so the twin rules (0023/0024/0026) stay in exactly one place. This route
// only records geometry.

// Far enough out for the widest real board — Group 1's wheel is 2217px and the sourceless
// strip sits below it — while still rejecting a NaN-shaped accident or a hostile payload.
const LIMIT = 20000;

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const clamp = (n: number) => Math.max(-LIMIT, Math.min(LIMIT, n));

export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  if (!supabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  const { code } = await params;
  try {
    const session = await getSessionByCode(code);
    if (!session) return NextResponse.json({ error: "Session not found." }, { status: 404 });
    if (session.scope !== "Ripples") {
      return NextResponse.json({ error: "Not a Ripples session." }, { status: 400 });
    }
    return NextResponse.json(await getCanvasLayout(session.code));
  } catch (e) {
    console.error("GET ripples/canvas failed", e);
    return NextResponse.json({ error: "Could not load the canvas." }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ code: string }> }) {
  if (!supabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  const { code } = await params;

  let body: {
    participantId?: string;
    cards?: { itemId?: string; x?: number; y?: number }[];
    regions?: { themeId?: string; x?: number; y?: number; w?: number; h?: number; shape?: string }[];
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
    if (session.phase !== "BUILD") {
      return NextResponse.json({ error: "The board is not open for building." }, { status: 409 });
    }

    const player = await getPlayerByParticipant(session.code, body.participantId ?? "");
    if (!player) return NextResponse.json({ error: "Join the session first." }, { status: 403 });

    // Everything is checked against the board itself, never trusted from the client: an
    // item must be an implication that actually lives here, a region must name a real
    // theme row on this board. Otherwise a stray id would plant a row that no view can
    // ever see or clean up.
    const cards = await listBoardCards(session.code);
    const keys = new Set(cards.filter((c) => c.cardKind === null).map(implicationKey));
    const themes = new Set(cards.filter((c) => c.cardKind === "theme").map((c) => c.id));

    const cardPos: CanvasCardPos[] = [];
    for (const c of body.cards ?? []) {
      if (!c.itemId || !keys.has(c.itemId)) {
        return NextResponse.json({ error: "That implication is not on this board." }, { status: 400 });
      }
      if (!finite(c.x) || !finite(c.y)) {
        return NextResponse.json({ error: "Invalid position." }, { status: 400 });
      }
      cardPos.push({ itemId: c.itemId, x: clamp(c.x), y: clamp(c.y) });
    }

    const regions: Region[] = [];
    for (const r of body.regions ?? []) {
      if (!r.themeId || !themes.has(r.themeId)) {
        return NextResponse.json({ error: "That theme is not on this board." }, { status: 400 });
      }
      if (!finite(r.x) || !finite(r.y) || !finite(r.w) || !finite(r.h)) {
        return NextResponse.json({ error: "Invalid region." }, { status: 400 });
      }
      // w/h carry a CHECK (> 0) in 0028, so a degenerate box would be a 500 rather than a
      // 400 if it got this far.
      if (r.w <= 0 || r.h <= 0) {
        return NextResponse.json({ error: "A theme's area cannot be empty." }, { status: 400 });
      }
      regions.push({
        themeId: r.themeId,
        x: clamp(r.x),
        y: clamp(r.y),
        w: Math.min(LIMIT, r.w),
        h: Math.min(LIMIT, r.h),
        shape: r.shape === "ellipse" ? "ellipse" : "rect",
      });
    }

    if (cardPos.length === 0 && regions.length === 0) {
      return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
    }

    await upsertCanvasLayout(session.code, { cards: cardPos, regions }, player.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("PUT ripples/canvas failed", e);
    return NextResponse.json({ error: "Could not save the canvas." }, { status: 500 });
  }
}
