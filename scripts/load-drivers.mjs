// Load / refresh the Supabase `drivers` table.
//
// Default source is the bundled data/drivers.seed.json. Pass a CSV path to load
// from a spreadsheet export instead — headers: slug,number,name,theme,headline,body
// (any subset; name + slug are required). Upserts on `slug`, so it's safe to re-run.
//
//   node --env-file=.env.local scripts/load-drivers.mjs
//   node --env-file=.env.local scripts/load-drivers.mjs path/to/drivers.csv
//
// Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "Missing Supabase env. Run: node --env-file=.env.local scripts/load-drivers.mjs"
  );
  process.exit(1);
}

// Minimal CSV parser (quoted fields, embedded commas/newlines, doubled quotes).
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c === "\r") { /* skip */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function fromCsv(text) {
  const rows = parseCsv(text);
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const o = {};
    headers.forEach((h, i) => (o[h] = (r[i] ?? "").trim()));
    return {
      slug: o.slug,
      number: o.number ? Number(o.number) : 0,
      name: o.name,
      theme: o.theme ?? "",
      headline: o.headline ?? "",
      body: o.body ?? "",
    };
  });
}

function fromSeed() {
  const seed = JSON.parse(
    readFileSync(new URL("../data/drivers.seed.json", import.meta.url))
  );
  return seed.drivers.map((d) => ({
    slug: d.slug,
    number: d.number ?? 0,
    name: d.name,
    theme: d.theme ?? "",
    headline: d.headline ?? "",
    body: d.body ?? "",
  }));
}

async function main() {
  const csvPath = process.argv[2];
  const drivers = csvPath ? fromCsv(readFileSync(csvPath, "utf8")) : fromSeed();
  const bad = drivers.filter((d) => !d.slug || !d.name);
  if (bad.length) {
    console.error(`${bad.length} row(s) missing slug or name — aborting.`);
    process.exit(1);
  }
  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { error } = await db.from("drivers").upsert(drivers, { onConflict: "slug" });
  if (error) {
    console.error("Upsert failed:", error.message);
    process.exit(1);
  }
  console.log(
    `Loaded ${drivers.length} drivers from ${csvPath ?? "data/drivers.seed.json"}.`
  );
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
