import "server-only";

import seed from "@/data/model.seed.json";
import { getUncertaintyRows, type UncertaintyRow } from "@/lib/cards";
import { getDrivers } from "@/lib/drivers";
import { supabaseAdmin, supabaseConfigured } from "@/lib/supabase";
import type { Driver, Model, ScenarioUncertainty } from "@/lib/types";
import type { ScenarioLite } from "@/lib/workshop-types";

// A scenario's source drivers are referenced by slide-driver slug (see
// data/uncertainties.seed.json + the `drivers` table), resolved to names here.
export type DriverNameBySlug = Map<string, string>;

// The foresight model has two parts:
//   • drivers — the nested Explore model (drivers → uncertainties → outcomes →
//     loop impacts). Stored as a JSONB document in Supabase `content['model']`,
//     falling back to the bundled snapshot (data/model.seed.json).
//   • scenarioUncertainties — the 13 workshop dimensions. Derived from the
//     shared `uncertainties` table (see lib/cards.ts), so the deck and the
//     workshop stay in lock-step. (Formerly both came from Airtable.)

const SEED_DRIVERS: Driver[] = (seed as { drivers: Driver[] }).drivers;

// Turn a normalized uncertainty row into a scenario uncertainty. The curated
// U01…U13 workshop id is derived from the uncertainty number.
function deriveScenarios(rows: UncertaintyRow[]): ScenarioUncertainty[] {
  return rows
    .map((u) => ({
      id: u.id,
      workshopId: `U${String(u.number).padStart(2, "0")}`,
      label: u.title,
      question: u.question,
      poleA: "",
      poleB: "",
      capabilityDomain: u.domain,
      whyItMatters: "",
      identityImplication: "",
      sourceDriverIds: u.sourceDriverIds ?? [],
      mappedUncertaintyIds: [],
    }))
    .sort((a, b) => a.workshopId.localeCompare(b.workshopId));
}

// Read the nested Explore drivers from Supabase content['model'] (or seed).
async function getModelDrivers(): Promise<Driver[]> {
  if (!supabaseConfigured()) return SEED_DRIVERS;
  try {
    const { data, error } = await supabaseAdmin()
      .from("content")
      .select("data")
      .eq("key", "model")
      .maybeSingle();
    if (error) throw error;
    const drivers = (data?.data as { drivers?: Driver[] } | null)?.drivers;
    return drivers && drivers.length ? drivers : SEED_DRIVERS;
  } catch (err) {
    console.error("[getModelDrivers] Supabase read failed, using seed:", err);
    return SEED_DRIVERS;
  }
}

/**
 * The full foresight model. Reads from Supabase when configured, otherwise
 * returns the bundled seed snapshot. Also returns a slug→name map for the
 * scenario source drivers (from the slide `drivers` table).
 */
export async function getModel(): Promise<{
  model: Model;
  source: "supabase" | "seed";
  driverNameBySlug: DriverNameBySlug;
}> {
  const [drivers, uncRows, slideDrivers] = await Promise.all([
    getModelDrivers(),
    getUncertaintyRows(),
    getDrivers(),
  ]);
  const model: Model = { drivers, scenarioUncertainties: deriveScenarios(uncRows) };
  const driverNameBySlug: DriverNameBySlug = new Map(
    slideDrivers.map((d) => [d.slug, d.name])
  );
  return { model, source: supabaseConfigured() ? "supabase" : "seed", driverNameBySlug };
}

export function getSeedModel(): Model {
  return { drivers: SEED_DRIVERS, scenarioUncertainties: [] };
}

/** Find an uncertainty (and its driver) by id in a model. */
export function findUncertainty(model: Model, uncertaintyId: string) {
  for (const driver of model.drivers) {
    const uncertainty = driver.uncertainties.find((u) => u.id === uncertaintyId);
    if (uncertainty) return { driver, uncertainty };
  }
  return null;
}

/** Find a scenario uncertainty (and its source drivers) by id in a model. */
export function findScenarioUncertainty(
  model: Model,
  scenarioId: string,
  driverNameBySlug?: DriverNameBySlug
) {
  const scenario = model.scenarioUncertainties.find((s) => s.id === scenarioId);
  if (!scenario) return null;
  const sourceDrivers = scenario.sourceDriverIds
    .map((slug) => ({ id: slug, name: driverNameBySlug?.get(slug) ?? "" }))
    .filter((d) => d.name);
  return { scenario, sourceDrivers };
}

// Capability-domain order used across Explore and the live workshop views.
// Matches the domain strings on the uncertainties (see data/uncertainties.seed.json).
export const CAPABILITY_DOMAIN_ORDER = [
  "Permission to Act",
  "Capacity to Act",
  "Ability to See",
  "Ability to Speak and Be Believed",
  "Ability to Adapt",
];

/** Ordered, client-safe scenario list for the live views (domain order, then U##). */
export function getScenarioList(
  model: Model,
  driverNameBySlug?: DriverNameBySlug
): ScenarioLite[] {
  const rank = (domain: string) => {
    const i = CAPABILITY_DOMAIN_ORDER.indexOf(domain);
    return i === -1 ? 999 : i;
  };
  return model.scenarioUncertainties
    .map((s) => ({
      id: s.id,
      workshopId: s.workshopId,
      label: s.label,
      question: s.question,
      poleA: s.poleA,
      poleB: s.poleB,
      capabilityDomain: s.capabilityDomain,
      driverNames: s.sourceDriverIds
        .map((slug) => driverNameBySlug?.get(slug))
        .filter((n): n is string => Boolean(n)),
    }))
    .sort(
      (a, b) =>
        rank(a.capabilityDomain) - rank(b.capabilityDomain) ||
        a.workshopId.localeCompare(b.workshopId)
    );
}
