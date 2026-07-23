// Seed Supabase content tables from the bundled JSON snapshots.
//
//   node scripts/seed-supabase.mjs
//
// Idempotent (upserts on primary key). Reads env from .env.local / .env, or
// from the process env when run in CI / on the host. Requires:
//   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Seeds:
//   uncertainties  <- data/uncertainties.seed.json  (13 rows)
//   card_outcomes  <- data/uncertainties.seed.json  (52 rows)
//   content[model] <- data/model.seed.json          (nested Explore model)

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

// Minimal .env loader (no dependency): .env then .env.local override.
function loadEnv() {
  for (const file of [".env", ".env.local"]) {
    let raw;
    try {
      raw = readFileSync(join(root, file), "utf8");
    } catch {
      continue;
    }
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const [, k, v] = m;
      process.env[k] = v.replace(/^["']|["']$/g, "");
    }
  }
}
loadEnv();

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SERVICE_KEY) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Set them in .env.local."
  );
  process.exit(1);
}

const sb = createClient(URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const readJson = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));

async function main() {
  const { uncertainties } = readJson("data/uncertainties.seed.json");
  const model = readJson("data/model.seed.json");

  // uncertainties
  const uncRows = uncertainties.map((u) => ({
    slug: u.id,
    number: u.number ?? 0,
    domain: u.domain ?? "",
    title: u.title ?? "",
    question: u.question ?? "",
    source_driver_ids: u.sourceDriverIds ?? [],
  }));
  {
    const { error } = await sb.from("uncertainties").upsert(uncRows, { onConflict: "slug" });
    if (error) throw error;
    console.log(`✓ uncertainties: ${uncRows.length}`);
  }

  // card_outcomes
  const cardRows = uncertainties.flatMap((u) =>
    u.outcomes.map((o, i) => ({
      code: o.code,
      uncertainty_slug: u.id,
      role: o.role ?? "Core",
      title: o.title ?? "",
      description: o.description ?? "",
      sort_order: i,
    }))
  );
  {
    const { error } = await sb.from("card_outcomes").upsert(cardRows, { onConflict: "code" });
    if (error) throw error;
    console.log(`✓ card_outcomes: ${cardRows.length}`);
  }

  // content['model'] — the nested Explore model (drivers). scenarioUncertainties
  // are derived at read time from the uncertainties table, so we store drivers only.
  {
    const { error } = await sb
      .from("content")
      .upsert(
        { key: "model", data: { drivers: model.drivers ?? [] }, updated_at: new Date().toISOString() },
        { onConflict: "key" }
      );
    if (error) throw error;
    console.log(`✓ content[model]: ${model.drivers?.length ?? 0} drivers`);
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
