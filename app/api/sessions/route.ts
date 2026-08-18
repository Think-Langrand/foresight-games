import { NextResponse } from "next/server";
import { getModel, findScenarioUncertainty, getScenarioList } from "@/lib/model";
import { createSession, supabaseConfigured } from "@/lib/workshop";
import { getProjectBySlug } from "@/lib/projects";
import { getScenario, foresightConfigured, DEFAULT_PROJECT_REF } from "@/lib/foresight/client";
import { resolveConfig, type RipplesConfig } from "@/lib/ripples-types";
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
    scope?: "Single" | "Full" | "Cards" | "Solo" | "Ripples";
    scenarioId?: string;
    // Ripples: the Foresight scenario slug to run against, plus config overrides
    // (timers, chips, toggles). The premise + resolutions are snapshotted from it.
    scenarioRef?: string;
    config?: Record<string, unknown>;
    // Ripples: one-person self-paced play (no lobby/facilitator, challenge off).
    solo?: boolean;
    pacing?: Pacing;
    prompt?: string;
    facilitator?: string;
    // Optional: which project this game belongs to. Absent = the global game
    // (project_id null) — fully backward compatible.
    projectSlug?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const { scope, scenarioId, pacing, prompt, facilitator } = body;

  // Only the card game (Cards/Solo) is project-scoped; Single/Full stay global.
  // getProjectBySlug is enabled-only — you can't start a game under a disabled project.
  const project = body.projectSlug ? await getProjectBySlug(body.projectSlug) : null;
  const projectId = project?.id ?? null;

  const now = new Date();
  const dateLabel = `${MONTHS[now.getMonth()]} ${now.getDate()}`;

  // ---- Solo: one person's private world-book — same card game, no lobby.
  // Each "world" is a team in this per-device session; the deck/rules are
  // identical to Cards, so we reuse the whole team surface. ----
  if (scope === "Solo") {
    try {
      const session = await createSession({
        scope: "Solo",
        uncertaintyId: null,
        mode: "Divergent",
        prompt: prompt?.trim() || "Build a future scenario from your cards.",
        title: `Solo worlds — ${dateLabel}`,
        facilitator: facilitator?.trim() || "",
        projectId,
      });
      return NextResponse.json({ code: session.code, id: session.id });
    } catch (err) {
      console.error("[POST /api/sessions] solo", err);
      return NextResponse.json({ error: "Failed to create session." }, { status: 500 });
    }
  }

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
        projectId,
      });
      return NextResponse.json({ code: session.code, id: session.id });
    } catch (err) {
      console.error("[POST /api/sessions] cards", err);
      return NextResponse.json({ error: "Failed to create session." }, { status: 500 });
    }
  }

  // ---- Ripples: implications mapping against an existing Foresight scenario ----
  if (scope === "Ripples") {
    if (!body.scenarioRef) {
      return NextResponse.json({ error: "scenarioRef is required." }, { status: 400 });
    }
    if (!foresightConfigured()) {
      return NextResponse.json(
        { error: "Scenario platform is not configured on the server." },
        { status: 503 }
      );
    }
    // Same tenant seam as the card game: a project resolves its Carmelita ref,
    // else the default tenant (the ref the global drivers/uncertainties use).
    const projectRef = project?.carmelitaProjectRef ?? DEFAULT_PROJECT_REF;
    try {
      const scenario = await getScenario(body.scenarioRef, projectRef);
      if (!scenario) {
        return NextResponse.json({ error: "Scenario not found." }, { status: 404 });
      }
      const solo = body.solo === true;
      // Start from validated overrides (timers/chips/toggles), then snapshot the
      // scenario premise + resolutions authoritatively (never client-controlled).
      const config: RipplesConfig = {
        ...resolveConfig(body.config ?? null),
        // Solo is a group-free, self-paced mode: no challenge vote.
        solo,
        challengeEnabled: solo ? false : resolveConfig(body.config ?? null).challengeEnabled,
        scenarioRef: scenario.id,
        projectRef: project?.carmelitaProjectRef ?? null,
        scenarioTitle: scenario.title,
        premise: scenario.body || scenario.teaser || "",
        resolutions: (scenario.linkedUncertainties ?? []).map((u) => ({
          uncertaintyId: u.uncertaintyId,
          title: u.title,
          resolution: u.resolution,
        })),
      };
      const session = await createSession({
        scope: "Ripples",
        uncertaintyId: null,
        mode: "Divergent",
        prompt: scenario.title,
        title: scenario.title || `Ripples — ${dateLabel}`,
        facilitator: facilitator?.trim() || "",
        projectId,
        config: config as unknown as Record<string, unknown>,
        // Solo skips the lobby — drop the player straight into the premise.
        phase: solo ? "PREMISE" : undefined,
      });
      return NextResponse.json({ code: session.code, id: session.id });
    } catch (err) {
      console.error("[POST /api/sessions] ripples", err);
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
