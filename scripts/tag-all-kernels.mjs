// Batch-tag submitted kernels with tone + scenario family via GPT-5.
//
//   node scripts/tag-all-kernels.mjs                 # tag every untagged submitted kernel
//   node scripts/tag-all-kernels.mjs --force         # also re-tag ones already tagged
//   node scripts/tag-all-kernels.mjs --code 6SJB     # limit to one session code
//   node scripts/tag-all-kernels.mjs --dry           # classify + print, write nothing
//   node scripts/tag-all-kernels.mjs --concurrency 8 # in-flight cap (default 5)
//
// Requires NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY
// (read from .env / .env.local), and the 0004_team_analysis_tags migration applied.
//
// This is the one-shot bulk sibling of the in-app "Auto-tag" button — same model,
// prompt, and schema — for when you'd rather tag everything from the terminal.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const f of [".env", ".env.local"]) {
  try {
    for (const line of readFileSync(join(root, f), "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}

// --- args ---
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f) => {
  const i = args.indexOf(f);
  return i >= 0 ? args[i + 1] : undefined;
};
const FORCE = has("--force");
const DRY = has("--dry");
const CODE = val("--code")?.toUpperCase();
const CONCURRENCY = Number(val("--concurrency") ?? 5);

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) fail("Missing Supabase env (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
if (!process.env.OPENAI_API_KEY) fail("Missing OPENAI_API_KEY.");

const sb = createClient(URL, KEY, { auth: { persistSession: false } });
const openai = new OpenAI();

const FAMILY_HINTS = [
  "Localized trust",
  "Corporate & consumer capture",
  "Renewal & civic",
  "Epistemic collapse",
  "Authoritarian data",
];
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    tone: { type: "string", enum: ["hopeful", "dark"] },
    family: { type: "string", description: "Short scenario-family label (2-4 words)." },
  },
  required: ["tone", "family"],
};
const NARRATIVE = [
  ["convergence", "convergence"],
  ["definingCharacteristics", "defining_characteristics"],
  ["centralTension", "central_tension"],
  ["newNormal", "new_normal"],
  ["brokenAssumption", "broken_assumption"],
];

function fail(msg) {
  console.error("✗", msg);
  process.exit(1);
}

function narrativeText(row) {
  return NARRATIVE.map(([label, col]) => {
    const v = (row[col] ?? "").trim();
    return v ? `${label}: ${v}` : null;
  })
    .filter(Boolean)
    .join("\n");
}

async function classify(narrative) {
  const r = await openai.chat.completions.create({
    model: "gpt-5",
    messages: [
      {
        role: "system",
        content:
          "You are a foresight facilitator classifying a submitted scenario 'kernel'. " +
          "Judge its overall TONE — 'hopeful' (constructive, restorative, optimistic) or " +
          "'dark' (dystopian, extractive, declining) — and assign a short scenario FAMILY " +
          "label grouping worlds by their central pattern. Prefer one of these families when " +
          `it fits: ${FAMILY_HINTS.join(", ")}. Otherwise coin a concise 2-4 word label.`,
      },
      { role: "user", content: `Scenario narrative:\n${narrative}` },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "kernel_tags", schema: SCHEMA, strict: true },
    },
  });
  const parsed = JSON.parse(r.choices[0]?.message?.content ?? "{}");
  if (parsed.tone !== "hopeful" && parsed.tone !== "dark") throw new Error("invalid tone");
  return { tone: parsed.tone, family: (parsed.family ?? "").trim().slice(0, 80) };
}

async function mapPool(items, limit, worker) {
  let i = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const item = items[i++];
      await worker(item);
    }
  });
  await Promise.all(runners);
}

async function main() {
  // Preflight: confirm the tag columns exist.
  const probe = await sb.from("teams").select("id, tone, family").limit(1);
  if (probe.error) {
    fail(
      `Cannot read tone/family (${probe.error.message}). Apply migration ` +
        "supabase/migrations/0004_team_analysis_tags.sql first."
    );
  }

  let q = sb
    .from("teams")
    .select(
      "id, code, world_title, tone, family, convergence, defining_characteristics, central_tension, new_normal, broken_assumption"
    )
    .eq("status", "Submitted");
  if (CODE) q = q.eq("code", CODE);
  const { data, error } = await q;
  if (error) fail(error.message);

  const targets = data.filter((t) => {
    if (!FORCE && t.tone) return false; // skip already-tagged unless --force
    return narrativeText(t).length > 0; // skip empty-text kernels
  });

  console.error(
    `${data.length} submitted${CODE ? ` in ${CODE}` : ""}; ${targets.length} to tag` +
      `${FORCE ? " (force)" : ""}${DRY ? " (dry run)" : ""}. Concurrency ${CONCURRENCY}.`
  );

  let ok = 0;
  let failed = 0;
  await mapPool(targets, CONCURRENCY, async (t) => {
    const label = `${t.code} · ${t.world_title || "untitled"}`;
    try {
      const tags = await classify(narrativeText(t));
      if (DRY) {
        console.error(`  ~ ${label} → ${tags.tone} · ${tags.family}`);
        ok++;
        return;
      }
      const upd = await sb
        .from("teams")
        .update({ tone: tags.tone, family: tags.family })
        .eq("id", t.id);
      if (upd.error) throw new Error(upd.error.message);
      console.error(`  ✓ ${label} → ${tags.tone} · ${tags.family}`);
      ok++;
    } catch (e) {
      console.error(`  ✗ ${label}: ${e.message}`);
      failed++;
    }
  });

  console.error(`Done. ${ok} tagged, ${failed} failed.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
