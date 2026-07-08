import { NextResponse } from "next/server";
import { getModel } from "@/lib/model";
import { createSession, type WorkshopMode } from "@/lib/workshop";
import { airtableConfigured } from "@/lib/airtable";

export const dynamic = "force-dynamic";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export async function POST(req: Request) {
  if (!airtableConfigured()) {
    return NextResponse.json(
      { error: "Airtable is not configured on the server." },
      { status: 503 }
    );
  }
  let body: { uncertaintyId?: string; mode?: WorkshopMode; prompt?: string; facilitator?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const { uncertaintyId, mode, prompt, facilitator } = body;
  if (!uncertaintyId) {
    return NextResponse.json({ error: "uncertaintyId is required." }, { status: 400 });
  }

  const { model } = await getModel();
  let foundDriver = null;
  let foundUnc = null;
  for (const d of model.drivers) {
    const u = d.uncertainties.find((x) => x.id === uncertaintyId);
    if (u) {
      foundDriver = d;
      foundUnc = u;
      break;
    }
  }
  if (!foundUnc || !foundDriver) {
    return NextResponse.json({ error: "Uncertainty not found in model." }, { status: 404 });
  }

  const now = new Date();
  const dateLabel = `${MONTHS[now.getMonth()]} ${now.getDate()}`;
  try {
    const session = await createSession({
      uncertaintyId,
      driverId: foundDriver.id,
      mode: mode ?? "Both",
      prompt: prompt?.trim() || foundUnc.question,
      title: `${foundUnc.label} — ${dateLabel}`,
      facilitator: facilitator?.trim() || "",
    });
    return NextResponse.json({ code: session.code, id: session.id });
  } catch (err) {
    console.error("[POST /api/sessions]", err);
    return NextResponse.json({ error: "Failed to create session." }, { status: 500 });
  }
}
