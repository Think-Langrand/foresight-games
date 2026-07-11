import { NextResponse } from "next/server";
import { getModel, findScenarioUncertainty, getScenarioList } from "@/lib/model";
import { createSession } from "@/lib/workshop";
import type { Pacing } from "@/lib/workshop-types";
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
  let body: {
    scope?: "Single" | "Full";
    scenarioId?: string;
    pacing?: Pacing;
    prompt?: string;
    facilitator?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const { scope, scenarioId, pacing, prompt, facilitator } = body;
  const { model } = await getModel();

  const now = new Date();
  const dateLabel = `${MONTHS[now.getMonth()]} ${now.getDate()}`;

  // ---- Full workshop: one session that walks all scenario uncertainties ----
  if (scope === "Full") {
    const list = getScenarioList(model);
    if (list.length === 0) {
      return NextResponse.json(
        { error: "No scenario uncertainties in the model." },
        { status: 404 }
      );
    }
    const first = list[0];
    const firstDriver = findScenarioUncertainty(model, first.id)?.sourceDrivers[0] ?? null;
    try {
      const session = await createSession({
        scope: "Full",
        pacing: pacing ?? "Facilitator-paced",
        uncertaintyId: first.id, // starting current pointer
        driverId: firstDriver?.id ?? null,
        mode: "Divergent",
        prompt: prompt?.trim() || first.question,
        title: `Full workshop — ${dateLabel}`,
        facilitator: facilitator?.trim() || "",
      });
      return NextResponse.json({ code: session.code, id: session.id });
    } catch (err) {
      console.error("[POST /api/sessions] full", err);
      return NextResponse.json({ error: "Failed to create session." }, { status: 500 });
    }
  }

  // ---- Single uncertainty (launched from an Explore card) ----
  if (!scenarioId) {
    return NextResponse.json({ error: "scenarioId is required." }, { status: 400 });
  }
  const found = findScenarioUncertainty(model, scenarioId);
  if (!found) {
    return NextResponse.json(
      { error: "Scenario uncertainty not found in model." },
      { status: 404 }
    );
  }
  const { scenario, sourceDrivers } = found;
  try {
    const session = await createSession({
      scope: "Single",
      uncertaintyId: scenarioId,
      driverId: sourceDrivers[0]?.id ?? null,
      mode: "Divergent",
      prompt: prompt?.trim() || scenario.question,
      title: `${scenario.label} — ${dateLabel}`,
      facilitator: facilitator?.trim() || "",
    });
    return NextResponse.json({ code: session.code, id: session.id });
  } catch (err) {
    console.error("[POST /api/sessions]", err);
    return NextResponse.json({ error: "Failed to create session." }, { status: 500 });
  }
}
