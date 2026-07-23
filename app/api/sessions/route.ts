import { NextResponse } from "next/server";
import { getModel, findScenarioUncertainty, getScenarioList } from "@/lib/model";
import { createSession, supabaseConfigured } from "@/lib/workshop";
import type { Pacing } from "@/lib/workshop-types";

export const dynamic = "force-dynamic";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export async function POST(req: Request) {
  if (!supabaseConfigured()) {
    return NextResponse.json(
      { error: "Database is not configured on the server." },
      { status: 503 }
    );
  }
  let body: {
    scope?: "Single" | "Full" | "Cards";
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

  const now = new Date();
  const dateLabel = `${MONTHS[now.getMonth()]} ${now.getDate()}`;

  // ---- Card game: teams draw outcome cards and build scenario triads ----
  if (scope === "Cards") {
    try {
      const session = await createSession({
        scope: "Cards",
        uncertaintyId: null,
        mode: "Divergent",
        prompt: prompt?.trim() || "Build a future scenario from your cards.",
        title: `Scenario cards — ${dateLabel}`,
        facilitator: facilitator?.trim() || "",
      });
      return NextResponse.json({ code: session.code, id: session.id });
    } catch (err) {
      console.error("[POST /api/sessions] cards", err);
      return NextResponse.json({ error: "Failed to create session." }, { status: 500 });
    }
  }

  const { model, driverNameBySlug } = await getModel();

  // ---- Full workshop: one session that walks all scenario uncertainties ----
  if (scope === "Full") {
    const list = getScenarioList(model, driverNameBySlug);
    if (list.length === 0) {
      return NextResponse.json(
        { error: "No scenario uncertainties in the model." },
        { status: 404 }
      );
    }
    const first = list[0];
    const firstDriver =
      findScenarioUncertainty(model, first.id, driverNameBySlug)?.sourceDrivers[0] ?? null;
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
  const found = findScenarioUncertainty(model, scenarioId, driverNameBySlug);
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
