// Dump a KernelEntry[] fixture from the live teams table for analysis unit tests.
//
//   node scripts/dump-analysis-fixture.mjs
//
// Resolves each team's triad card ids against the deck (Supabase card_outcomes +
// uncertainties, else the bundled seed) into the exact export shape consumed by
// lib/analysis. Writes lib/analysis/__fixtures__/july-2026.json.
//
// Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (from .env.local).

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

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
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}
loadEnv();

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error("Missing Supabase env.");
  process.exit(1);
}
const sb = createClient(URL, KEY, { auth: { persistSession: false } });

// Mirror lib/cards.ts tidy() + toRole().
const tidy = (s) => (s ?? "").replace(/\bai\b/g, "AI").replace(/\bchws\b/g, "CHWs");
const toRole = (r) => (r === "Edge" || r === "Wildcard" ? r : "Core");

async function buildDeckById() {
  const [{ data: uncs, error: e1 }, { data: outs, error: e2 }] = await Promise.all([
    sb.from("uncertainties").select("slug, title"),
    sb.from("card_outcomes").select("code, uncertainty_slug, role, title, description"),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  const dimBySlug = new Map((uncs ?? []).map((u) => [u.slug, u.title]));
  const byId = new Map();
  for (const o of outs ?? []) {
    byId.set(o.code, {
      title: tidy(o.title),
      role: toRole(o.role),
      dimension: dimBySlug.get(o.uncertainty_slug) ?? "",
      condition: tidy(o.description),
    });
  }
  return byId;
}

async function main() {
  const byId = await buildDeckById();
  const { data: teams, error } = await sb
    .from("teams")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;

  const entries = teams.map((t) => {
    const triad = [t.seed_card_id, ...(t.kept_ids ?? [])].filter(Boolean);
    const cards = triad
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((c) => ({ title: c.title, role: c.role, dimension: c.dimension, condition: c.condition }));
    return {
      code: t.code,
      name: t.name ?? "",
      worldTitle: t.world_title ?? "",
      status: t.status ?? "Drafting",
      convergence: t.convergence ?? "",
      primaryCondition: t.primary_condition ?? "",
      definingCharacteristics: t.defining_characteristics ?? "",
      centralTension: t.central_tension ?? "",
      newNormal: t.new_normal ?? "",
      brokenAssumption: t.broken_assumption ?? "",
      worldDescription: t.world_description ?? "",
      createdTime: t.created_at,
      cards,
    };
  });

  const outDir = join(root, "lib/analysis/__fixtures__");
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, "july-2026.json");
  writeFileSync(outFile, JSON.stringify(entries, null, 2) + "\n");
  console.error(
    `Wrote ${entries.length} entries (${entries.filter((e) => e.status === "Submitted").length} submitted) -> ${outFile}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
