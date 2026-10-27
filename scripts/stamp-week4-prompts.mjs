// Put Week 4's authored prompts onto every design group of a project — including PROD.
//
//   node scripts/stamp-week4-prompts.mjs --project public-health              # dry run
//   node scripts/stamp-week4-prompts.mjs --project public-health --write
//   node scripts/stamp-week4-prompts.mjs --project public-health --write --prod
//
// WHY THIS EXISTS. resolveEffectiveSections (lib/exercise-types.ts) prefers a week's stored
// `sections` over the code template, and only falls back to the template when the column is
// empty. So once a week has been stamped — by the admin program editor, by a template, by
// the dev reset — editing COMMITMENTS_SECTIONS in code reaches NOBODY. Every group keeps
// reading the prompts it was stamped with. The symptom is a facilitator asking why the
// wording they just shipped is not on the board, and the answer is always this.
//
// IT WRITES ONE COLUMN. `design_group_exercises.sections`, on rows of type `commitments`,
// for one project. No card, no board, no session, no session_code, no title, no sort. That
// narrowness is the whole reason it is allowed near prod when reset-dev-program.mjs is not:
// that script repairs a whole program and wipes Week 4's board on the way past, which is
// the wrong price for a prompt change once a group has work on it.
//
// ANSWERS UNDER A RETIRED PROMPT ARE NOT DELETED. A key is the permanent link to every card
// ever written under it. Re-stamping to a template that drops `w4-summary` leaves those
// cards exactly where they are; the admin viewer surfaces them under a "removed block"
// heading rather than vanishing them. A group that already ran the OLD Week 4 keeps its
// work and simply stops being asked those questions.
//
// DRY RUN BY DEFAULT. It prints a per-prompt diff and writes nothing until `--write`, and
// against the prod ref it additionally demands `--prod` so the target can never be a
// surprise.
//
// CREDENTIALS. TARGET_SUPABASE_URL + TARGET_SUPABASE_SERVICE_ROLE_KEY when set, else
// NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env / .env.local. To reach
// prod, set the TARGET_ pair for the one command rather than editing .env.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { COMMITMENTS_SECTIONS } from "./week4-sections.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const PROD_REF = "ratkqnumupciffxnsbhk";

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
      process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}
loadEnv();

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const value = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

const project = value("project");
const write = flag("write");
if (!project) {
  console.error("Usage: stamp-week4-prompts.mjs --project <slug> [--write] [--prod]");
  process.exit(1);
}

const URL = process.env.TARGET_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY =
  process.env.TARGET_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error("Missing Supabase URL / service role key. See the header for which vars.");
  process.exit(1);
}

const isProd = URL.includes(PROD_REF);
if (isProd && write && !flag("prod")) {
  console.error(
    `\nTarget is PROD (${URL.replace(/^https:\/\//, "")}).\n` +
      "Re-run with --prod as well if that is what you mean.\n"
  );
  process.exit(1);
}

const sb = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

async function q(builder) {
  const { data, error } = await builder;
  if (error) throw error;
  return data;
}

// jsonb does not preserve key order, so compare a normalised form or every run reports a
// change and the script can never honestly say it had nothing to do.
const canonical = (secs) =>
  JSON.stringify(
    (secs ?? []).map((s) =>
      Object.fromEntries(
        Object.entries(s)
          .filter(([, v]) => v !== undefined && v !== null)
          .sort(([a], [b]) => a.localeCompare(b))
      )
    )
  );

function diff(before, after) {
  const lines = [];
  const byKey = new Map((before ?? []).map((s) => [s.key, s]));
  for (const s of after) {
    const was = byKey.get(s.key);
    if (!was) {
      lines.push(`        + ${s.key} [${s.step}]  ${s.label}`);
      continue;
    }
    byKey.delete(s.key);
    if (was.label !== s.label) lines.push(`        ~ ${s.key} label\n            was: ${was.label}\n            now: ${s.label}`);
    // Every free-text field, not a hand-picked few: a field this missed would be written
    // silently, which is the one thing a dry run exists to prevent.
    for (const f of ["help", "test"]) {
      if ((was[f] ?? "") === (s[f] ?? "")) continue;
      lines.push(
        `        ~ ${s.key} ${f}\n            was: ${was[f] ?? "(none)"}\n            now: ${s[f] ?? "(none)"}`
      );
    }
    if (was.step !== s.step) lines.push(`        ~ ${s.key} step  ${was.step} -> ${s.step}`);
  }
  // Prompts the template no longer offers. Their answers stay in the database.
  for (const s of byKey.values()) lines.push(`        - ${s.key}  retired (answers kept)`);
  return lines;
}

async function main() {
  console.log(`\ntarget   ${URL.replace(/^https:\/\//, "")}${isProd ? "   ** PRODUCTION **" : ""}`);
  console.log(`project  ${project}`);
  console.log(`mode     ${write ? "WRITE" : "dry run (nothing will be written)"}\n`);

  const [p] = await q(sb.from("projects").select("id, slug, name").eq("slug", project));
  if (!p) throw new Error(`No project with slug "${project}" on this database.`);

  const groups = await q(
    sb.from("design_groups").select("id, name").eq("project_id", p.id).order("sort")
  );
  if (groups.length === 0) throw new Error(`Project "${project}" has no design groups.`);

  let changed = 0;
  let current = 0;
  let missing = 0;

  for (const g of groups) {
    const rows = await q(
      sb
        .from("design_group_exercises")
        .select("id, sort, title, sections")
        .eq("group_id", g.id)
        .eq("type", "commitments")
    );
    if (rows.length === 0) {
      console.log(`   ?  ${g.name}: no commitments week on this group`);
      missing += 1;
      continue;
    }
    for (const row of rows) {
      if (canonical(row.sections) === canonical(COMMITMENTS_SECTIONS)) {
        console.log(`   =  ${g.name}: already current`);
        current += 1;
        continue;
      }
      console.log(`   ${write ? "+" : "~"}  ${g.name}  (sort ${row.sort}, "${row.title}")`);
      for (const line of diff(row.sections, COMMITMENTS_SECTIONS)) console.log(line);
      changed += 1;
      if (!write) continue;
      const { error } = await sb
        .from("design_group_exercises")
        .update({ sections: COMMITMENTS_SECTIONS, updated_at: new Date().toISOString() })
        .eq("id", row.id);
      if (error) throw error;
    }
  }

  console.log(
    `\n${current} already current, ${changed} ${write ? "re-stamped" : "would change"}` +
      (missing ? `, ${missing} group(s) with no commitments week` : "")
  );
  if (!write && changed) console.log("Nothing was written. Re-run with --write to apply.\n");
  else console.log("");
}

main().catch((err) => {
  console.error(`\n${err.message ?? err}\n`);
  process.exit(1);
});
