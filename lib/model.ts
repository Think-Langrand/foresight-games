import "server-only";

import seed from "@/data/model.seed.json";
import {
  airtableConfigured,
  listRecords,
  TABLES,
  type AirtableRecord,
} from "@/lib/airtable";
import {
  THEME_ORDER,
  shortDirection,
  type Driver,
  type Model,
  type Outcome,
  type Uncertainty,
  type LoopImpact,
  type Direction,
  type Alignment,
  type Effect,
  type Magnitude,
} from "@/lib/types";

const SEED = seed as Model;

// ---- Airtable field row shapes (only the fields we read) ----
type DriverRow = {
  Driver?: string;
  Theme?: string;
  Headline?: string;
  Short?: string;
  Long?: string;
  Impact?: string;
  Uncertainty?: string;
  "Top-Right (ranked)"?: boolean;
  Uncertainties?: string[];
  "Neutral reading"?: string;
  "Neutral headline"?: string;
  "Neutral name"?: string;
};
type UncertaintyRow = {
  Uncertainty?: string;
  Question?: string;
  Driver?: string[];
  "Pole A"?: string;
  "Pole B"?: string;
  Outcomes?: string[];
  "Sharpest Axis?"?: boolean;
};
type OutcomeRow = {
  Outcome?: string;
  Uncertainty?: string[];
  Direction?: string;
  Narrative?: string;
  "Loop Impacts"?: string[];
  Alignment?: string;
  "Strategic move"?: string;
};
type LoopImpactRow = {
  Impact?: string;
  Outcome?: string[];
  Loop?: string[];
  Effect?: string;
  Magnitude?: string;
  Mechanism?: string;
};
type LoopRow = {
  Name?: string;
  Subsystem?: string;
  Tag?: string;
};

const DIR_RANK: Record<string, number> = {
  Positive: 0,
  "Mixed / depends": 1,
  Negative: 2,
};

function assemble(
  drivers: AirtableRecord<DriverRow>[],
  uncertainties: AirtableRecord<UncertaintyRow>[],
  outcomes: AirtableRecord<OutcomeRow>[],
  impacts: AirtableRecord<LoopImpactRow>[],
  loops: AirtableRecord<LoopRow>[]
): Model {
  const loopById = new Map(loops.map((l) => [l.id, l.fields]));
  const impactById = new Map(impacts.map((im) => [im.id, im]));
  const outcomeById = new Map(outcomes.map((o) => [o.id, o]));
  const uncById = new Map(uncertainties.map((u) => [u.id, u]));

  const buildImpact = (rec: AirtableRecord<LoopImpactRow>): LoopImpact => {
    const loopId = rec.fields.Loop?.[0];
    const loop = loopId ? loopById.get(loopId) : undefined;
    return {
      id: rec.id,
      label: rec.fields.Impact ?? "",
      effect: (rec.fields.Effect ?? "Neutral / unclear") as Effect,
      magnitude: (rec.fields.Magnitude ?? "Medium") as Magnitude,
      mechanism: rec.fields.Mechanism ?? "",
      loopName: loop?.Name ?? "",
      loopSubsystem: loop?.Subsystem ?? "",
      loopCode: loop?.Tag ?? "",
    };
  };

  const buildOutcome = (rec: AirtableRecord<OutcomeRow>): Outcome => {
    const f = rec.fields;
    const imps = (f["Loop Impacts"] ?? [])
      .map((id) => impactById.get(id))
      .filter((x): x is AirtableRecord<LoopImpactRow> => Boolean(x))
      .map(buildImpact);
    return {
      id: rec.id,
      label: f.Outcome ?? "",
      direction: (f.Direction ?? "Mixed / depends") as Direction,
      alignment: (f.Alignment ?? "Mixed / depends") as Alignment,
      narrative: f.Narrative ?? "",
      strategicMove: f["Strategic move"] ?? "",
      impacts: imps,
    };
  };

  const buildUncertainty = (rec: AirtableRecord<UncertaintyRow>): Uncertainty => {
    const f = rec.fields;
    const ocs = (f.Outcomes ?? [])
      .map((id) => outcomeById.get(id))
      .filter((x): x is AirtableRecord<OutcomeRow> => Boolean(x))
      .map(buildOutcome)
      .sort(
        (a, b) =>
          (DIR_RANK[shortDirection(a.direction)] ?? 1) -
          (DIR_RANK[shortDirection(b.direction)] ?? 1)
      );
    return {
      id: rec.id,
      label: f.Uncertainty ?? "",
      question: f.Question ?? "",
      poleA: f["Pole A"] ?? "",
      poleB: f["Pole B"] ?? "",
      sharpest: Boolean(f["Sharpest Axis?"]),
      outcomes: ocs,
    };
  };

  const builtDrivers: Driver[] = drivers.map((rec) => {
    const f = rec.fields;
    const uncs = (f.Uncertainties ?? [])
      .map((id) => uncById.get(id))
      .filter((x): x is AirtableRecord<UncertaintyRow> => Boolean(x))
      .map(buildUncertainty)
      .sort((a, b) => Number(b.sharpest) - Number(a.sharpest));
    return {
      id: rec.id,
      name: f.Driver ?? "",
      theme: f.Theme ?? "",
      headline: f.Headline ?? "",
      short: f.Short ?? "",
      neutralHeadline: f["Neutral headline"] ?? "",
      neutralReading: f["Neutral reading"] ?? "",
      neutralName: f["Neutral name"] ?? "",
      topRight: Boolean(f["Top-Right (ranked)"]),
      impact: f.Impact,
      uncertainty: f.Uncertainty,
      uncertainties: uncs,
    };
  });

  // Sort: by theme order, then top-ranked first within a theme.
  builtDrivers.sort((a, b) => {
    const ta = THEME_ORDER.indexOf(a.theme as (typeof THEME_ORDER)[number]);
    const tb = THEME_ORDER.indexOf(b.theme as (typeof THEME_ORDER)[number]);
    const oa = ta === -1 ? 999 : ta;
    const ob = tb === -1 ? 999 : tb;
    if (oa !== ob) return oa - ob;
    return Number(b.topRight) - Number(a.topRight);
  });

  return { drivers: builtDrivers };
}

/**
 * The full foresight model. Reads from Airtable when configured (cached),
 * otherwise returns the bundled seed snapshot.
 */
export async function getModel(): Promise<{ model: Model; source: "airtable" | "seed" }> {
  if (!airtableConfigured()) {
    return { model: SEED, source: "seed" };
  }
  try {
    const revalidate = 300; // content is near-static during a workshop; refresh every 5 min
    const [drivers, uncertainties, outcomes, impacts, loops] = await Promise.all([
      listRecords<DriverRow>(TABLES.drivers, { revalidate }),
      listRecords<UncertaintyRow>(TABLES.uncertainties, { revalidate }),
      listRecords<OutcomeRow>(TABLES.outcomes, { revalidate }),
      listRecords<LoopImpactRow>(TABLES.loopImpacts, { revalidate }),
      listRecords<LoopRow>(TABLES.loops, { revalidate }),
    ]);
    const model = assemble(drivers, uncertainties, outcomes, impacts, loops);
    // Guard against an empty / mis-scoped base: fall back to seed rather than an empty app.
    if (model.drivers.length === 0) return { model: SEED, source: "seed" };
    return { model, source: "airtable" };
  } catch (err) {
    console.error("[getModel] Airtable read failed, using seed:", err);
    return { model: SEED, source: "seed" };
  }
}

export function getSeedModel(): Model {
  return SEED;
}

/** Find an uncertainty (and its driver) by id in a model. */
export function findUncertainty(model: Model, uncertaintyId: string) {
  for (const driver of model.drivers) {
    const uncertainty = driver.uncertainties.find((u) => u.id === uncertaintyId);
    if (uncertainty) return { driver, uncertainty };
  }
  return null;
}
