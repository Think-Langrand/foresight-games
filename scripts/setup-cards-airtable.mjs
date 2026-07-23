// Optional setup for the card game's DECK in Airtable.
//
// Live workshop state (sessions, teams, submissions, responses) lives in
// Supabase now — this script only concerns the static outcome-card DECK, which
// stays in Airtable. It creates a "Cards" table and loads the 52-card deck.
//
// The app reads the deck via lib/cards.ts, which falls back to
// data/cards.seed.json (mirrored to data/cards-backup.csv) whenever Airtable is
// unavailable — so running this is optional; it just lets you edit the deck in
// Airtable instead of the seed file.
//
// Idempotent: skips the table if it exists; only loads the deck if it's empty.
// Safe to re-run (e.g. after the monthly Airtable API quota resets).
//
//   node --env-file=.env scripts/setup-cards-airtable.mjs
//   node --env-file=.env.local scripts/setup-cards-airtable.mjs
//
// Requires AIRTABLE_TOKEN with schema (metadata) write scope.

import { readFileSync } from "node:fs";

const API = "https://api.airtable.com/v0";
const TOKEN = process.env.AIRTABLE_TOKEN || process.env.AIRTABLE_API_KEY;
const BASE = process.env.AIRTABLE_BASE_ID || "appJbrDG28mXRJgfA";

if (!TOKEN) {
  console.error("Missing AIRTABLE_TOKEN. Run with: node --env-file=.env scripts/setup-cards-airtable.mjs");
  process.exit(1);
}

const headers = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };

async function req(method, url, body) {
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    if (res.status === 429) {
      throw new Error(
        `Airtable is over its monthly API quota (429). Wait for the reset or upgrade the plan, then re-run.\n${text.slice(0, 200)}`
      );
    }
    throw new Error(`${method} ${url} → ${res.status}: ${text.slice(0, 400)}`);
  }
  return text ? JSON.parse(text) : {};
}

async function listTables() {
  const data = await req("GET", `${API}/meta/bases/${BASE}/tables`);
  return data.tables ?? [];
}

const CARDS_FIELDS = [
  { name: "Card ID", type: "singleLineText" }, // primary
  { name: "Title", type: "singleLineText" },
  { name: "Dimension", type: "singleLineText" },
  { name: "Source Drivers", type: "multilineText" },
  { name: "Level", type: "singleLineText" },
  { name: "Seeding Question", type: "multilineText" },
  { name: "Condition", type: "multilineText" },
  {
    name: "Role",
    type: "singleSelect",
    options: { choices: [{ name: "Core" }, { name: "Edge" }, { name: "Wildcard" }] },
  },
];

async function ensureTable(existing, name, fields) {
  const found = existing.find((t) => t.name.toLowerCase() === name.toLowerCase());
  if (found) {
    console.log(`✓ Table "${name}" already exists (${found.id})`);
    return found.id;
  }
  const created = await req("POST", `${API}/meta/bases/${BASE}/tables`, { name, fields });
  console.log(`＋ Created table "${name}" (${created.id})`);
  return created.id;
}

async function tableIsEmpty(tableId) {
  const data = await req("GET", `${API}/${BASE}/${tableId}?maxRecords=1`);
  return (data.records ?? []).length === 0;
}

async function loadDeck(cardsTableId) {
  if (!(await tableIsEmpty(cardsTableId))) {
    console.log("✓ Cards table already has records — skipping deck load.");
    return;
  }
  const deck = JSON.parse(readFileSync(new URL("../data/cards.seed.json", import.meta.url)));
  const records = deck.map((c) => ({
    fields: {
      "Card ID": c.id,
      Title: c.title,
      Dimension: c.dimension,
      "Source Drivers": c.sourceDrivers,
      Level: c.level,
      "Seeding Question": c.seedingQuestion,
      Condition: c.condition,
      Role: c.role,
    },
  }));
  for (let i = 0; i < records.length; i += 10) {
    await req("POST", `${API}/${BASE}/${cardsTableId}`, {
      records: records.slice(i, i + 10),
      typecast: true,
    });
  }
  console.log(`＋ Loaded ${records.length} cards into the deck.`);
}

async function main() {
  console.log(`Base ${BASE}\n`);
  const existing = await listTables();
  const cardsId = await ensureTable(existing, "Cards", CARDS_FIELDS);
  await loadDeck(cardsId);
  console.log("\nDone. The card game now reads its deck live from Airtable.");
}

main().catch((err) => {
  console.error("\n" + err.message);
  process.exit(1);
});
