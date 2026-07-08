import { NextResponse } from "next/server";
import {
  getSessionResults,
  updateSession,
  getSessionByCode,
  type WorkshopMode,
  type SessionStatus,
} from "@/lib/workshop";
import { getModel, findUncertainty } from "@/lib/model";
import { shortDirection } from "@/lib/types";
import type { SessionContext } from "@/lib/workshop-types";
import { airtableConfigured } from "@/lib/airtable";

export const dynamic = "force-dynamic";

async function buildContext(uncertaintyId: string | null): Promise<SessionContext | null> {
  if (!uncertaintyId) return null;
  const { model } = await getModel();
  const found = findUncertainty(model, uncertaintyId);
  if (!found) return null;
  const { driver, uncertainty } = found;
  return {
    driverName: driver.name,
    driverId: driver.id,
    uncertaintyLabel: uncertainty.label,
    question: uncertainty.question,
    poleA: uncertainty.poleA,
    poleB: uncertainty.poleB,
    outcomes: uncertainty.outcomes.map((o) => ({
      id: o.id,
      label: o.label,
      direction: shortDirection(o.direction),
      alignment: o.alignment,
      narrative: o.narrative,
    })),
  };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  if (!airtableConfigured()) {
    return NextResponse.json({ error: "Airtable not configured." }, { status: 503 });
  }
  const { code } = await params;
  try {
    const results = await getSessionResults(code);
    if (!results) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }
    const context = await buildContext(results.session.uncertaintyId);
    return NextResponse.json(
      { ...results, context },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("[GET /api/sessions/:code]", err);
    return NextResponse.json({ error: "Failed to load session." }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  if (!airtableConfigured()) {
    return NextResponse.json({ error: "Airtable not configured." }, { status: 503 });
  }
  const { code } = await params;
  let body: { mode?: WorkshopMode; status?: SessionStatus; prompt?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const session = await getSessionByCode(code);
  if (!session) return NextResponse.json({ error: "Session not found." }, { status: 404 });
  try {
    await updateSession(session.id, session.code, body);
    const results = await getSessionResults(code, { force: true });
    return NextResponse.json(results);
  } catch (err) {
    console.error("[PATCH /api/sessions/:code]", err);
    return NextResponse.json({ error: "Failed to update session." }, { status: 500 });
  }
}
