// Import facilitator-written implications onto a design group's Session 2 map.
//
//   node scripts/import-facilitator-implications.mjs plan   [opts]
//   node scripts/import-facilitator-implications.mjs import [opts]  [--prod]
//
// WHY THIS EXISTS. A group that built few implications in Session 2 has little to cluster in
// Session 3. Facilitators write extra implications that hang off the group's OWN chains, and
// there is no way to get them in: the admin "Export JSON" button is write-only, and typing 55
// cards into a live board by hand is not a plan. This takes an export-shaped file carrying
// extra cards and lands them as real chain cards.
//
// ADDITIVE AND IDEMPOTENT. There is no `delete` and no `update` anywhere in this file. It only
// ever inserts, and it skips anything already present, so a re-run writes nothing. Existing
// card text is never rewritten. `plan` is the dry run and writes nothing at all; `import` runs
// the same report first and refuses to write if it found a problem.
//
// WHAT IT READS FROM THE FILE: `exercises[].cards` and nothing else. The sibling arrays
// (`unclustered`, `themes[].implications`, `parked`, `orphans`) are derived projections and at
// least one of them can be stale — in the file this was built for, tray card
// c34213b2-2cae-5b9c-9d39-bbc19f8213cd reads "Changing providers…" under `unclustered` but
// "Changing verification services…" under `cards`, and `cards` is the one that matches its
// Session 2 source.
//
// WHAT IT IGNORES FROM THE FILE: every identifier except card ids. The file's `teamId`,
// `session_id` and `exerciseId` belong to whichever database it was exported from. Those are
// resolved on the TARGET, and the resolution is printed before anything is written.
//
// Card ids, though, are the one portable thing — and the two phases key on different ones,
// which is worth knowing: Session 2 cards keep their ids across environments, so the map phase
// matches on `id`. Session 3 tray rows are minted fresh per environment by seedFirstCards, so
// their ids match nothing and the tray phase matches on `source_card_id` (the unique index from
// migration 0018).
//
// CREDENTIALS. TARGET_SUPABASE_URL + TARGET_SUPABASE_SERVICE_ROLE_KEY when set, else
// NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (.env / .env.local). Writing to the prod
// ref additionally requires --prod, so a shell pointed at prod cannot write by accident.
//
// TO UNDO a map import by hand (this script will not do it for you):
//   delete from ripple_cards where code = '<CODE>' and id in (<the ids the run reported>);
// Deleting a card cascades to its subtree, so delete tips first or delete the whole set at once.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, isAbsolute } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const PROD_REF = "ratkqnumupciffxnsbhk";
const DEFAULT_FILE = "docs/data/facilitator-additions-group-2-the-known-and-unknown-2026-10-15.json";

// Mirrored from lib/ripples-types.ts:70-81. Scripts cannot import lib/ — 37 of those modules
// open with `import "server-only"`, which throws under plain node, and there is no TS runner.
// Same deliberate duplication as scripts/seed-practice-synthesis.mjs:262.
const TREE_ORDERS = [
  "FIRST", "SECOND", "TERMINAL", "ORDER_4", "ORDER_5",
  "ORDER_6", "ORDER_7", "ORDER_8", "ORDER_9", "ORDER_10",
];
const DEPTH_OF = new Map(TREE_ORDERS.map((o, i) => [o, i]));
const MAX_TREE_DEPTH = TREE_ORDERS.length - 1; // lib/ripples-types.ts:91
const CARD_TEXT_MAX = 500; // lib/ripples-types.ts:139
const CARD_DESCRIPTION_MAX = 1000; // lib/ripples-types.ts:142

// The admin views mark a facilitator addition by this prefix on the card's description —
// isFacilitatorCard in lib/ripples-types.ts. There is no boolean column to set, so the note
// IS the marker, and every row written here must carry it or it will be indistinguishable
// from the group's own work. Mirrored rather than imported, like TREE_ORDERS above.
const FACILITATOR_NOTE = "Facilitator addition";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

// ---------------------------------------------------------------- args
const argv = process.argv.slice(2);
const command = argv[0] ?? "";
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i > -1 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};

const COMMANDS = ["plan", "import"];
if (!COMMANDS.includes(command)) {
  console.error(
    `Usage: node scripts/import-facilitator-implications.mjs <${COMMANDS.join("|")}> ` +
      `[--file path] [--project slug] [--group name] [--ids-only] [--min-prior-match 1.0] [--prod]`
  );
  process.exit(1);
}

const FILE = opt("file", DEFAULT_FILE);
const PROJECT_SLUG = opt("project", "public-health");
const GROUP_OVERRIDE = opt("group", null);
const IDS_ONLY = flag("ids-only");
const MIN_PRIOR_MATCH = Number(opt("min-prior-match", "1.0"));

const URL = process.env.TARGET_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.TARGET_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error("Missing Supabase env (TARGET_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL + a service-role key).");
  process.exit(1);
}
const isProd = URL.includes(PROD_REF);
if (isProd && command === "import" && !flag("prod")) {
  console.error("That URL is the PROD project. Re-run with --prod if you mean it.");
  process.exit(1);
}

const sb = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

async function q(builder) {
  const { data, error } = await builder;
  if (error) throw error;
  return data;
}

const norm = (s) => (s ?? "").replace(/\s+/g, " ").trim().toLowerCase();
const short = (s, n = 64) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

// created_at is staggered because every view orders siblings by creation time
// (buildChildrenMap, lib/ripples-types.ts:402) — `sort` is not consulted on the Session 2 tree.
let stamp = Date.now();
const nextStamp = () => new Date((stamp += 2)).toISOString();

// ---------------------------------------------------------------- the file
function readFixture() {
  const path = isAbsolute(FILE) ? FILE : join(root, FILE);
  const raw = JSON.parse(readFileSync(path, "utf8"));
  const problems = [];
  const warnings = [];

  const blocks = (raw.exercises ?? []).filter((e) => e.kind === "implications");
  if (blocks.length !== 1) {
    throw new Error(`Expected exactly one "implications" exercise in the file, found ${blocks.length}.`);
  }
  const block = blocks[0];
  const cards = block.cards ?? [];

  // "New" is the file's own marker. It is NOT a database column — `isFacilitator` exists
  // nowhere in this repo — so it is read here and never written.
  const newCards = cards.filter((c) => c.isFacilitator === true);
  const priorCards = cards.filter((c) => c.isFacilitator !== true);
  const byId = new Map(cards.map((c) => [c.id, c]));

  if (newCards.length === 0) problems.push("The file marks no cards with isFacilitator: true — nothing to import.");

  const seen = new Set();
  for (const c of newCards) {
    const where = `${c.id?.slice(0, 8) ?? "?"} "${short(c.text, 40)}"`;
    if (!c.id || !UUID_RE.test(c.id)) problems.push(`${where}: id is not a uuid.`);
    if (seen.has(c.id)) problems.push(`${where}: id appears twice in the file.`);
    seen.add(c.id);
    if (priorCards.some((p) => p.id === c.id)) problems.push(`${where}: id collides with a pre-existing card.`);

    if (!c.parentId) problems.push(`${where}: no parentId — a chain card must hang off something.`);
    else if (!byId.has(c.parentId)) problems.push(`${where}: parent ${c.parentId.slice(0, 8)} is not in the file.`);

    const depth = DEPTH_OF.get(c.order);
    if (depth === undefined) problems.push(`${where}: order "${c.order}" is not a tree order.`);
    else if (depth === 0) problems.push(`${where}: order FIRST — key changes are not imported.`);
    else if (depth > MAX_TREE_DEPTH) problems.push(`${where}: depth ${depth} is past the cap of ${MAX_TREE_DEPTH}.`);

    const text = (c.text ?? "").trim();
    if (!text) problems.push(`${where}: empty text.`);
    if (text.length > CARD_TEXT_MAX) problems.push(`${where}: text is ${text.length} chars (max ${CARD_TEXT_MAX}).`);
    const desc = c.description ?? "";
    if (desc.length > CARD_DESCRIPTION_MAX)
      problems.push(`${where}: description is ${desc.length} chars (max ${CARD_DESCRIPTION_MAX}).`);
  }

  // Every new card must eventually hang off a PRE-EXISTING card: that is what makes this an
  // extension of the group's own map rather than a second map bolted alongside it. Also
  // catches cycles, which would otherwise loop forever in the depth resolution below.
  const priorIds = new Set(priorCards.map((c) => c.id));
  const newIds = new Set(newCards.map((c) => c.id));
  for (const c of newCards) {
    let hop = c;
    const path = new Set([c.id]);
    while (hop && newIds.has(hop.id)) {
      const next = byId.get(hop.parentId);
      if (!next) break;
      if (path.has(next.id)) {
        problems.push(`${c.id.slice(0, 8)}: parent chain is a cycle.`);
        break;
      }
      path.add(next.id);
      hop = next;
    }
    if (hop && !priorIds.has(hop.id) && !newIds.has(hop.id)) {
      problems.push(`${c.id.slice(0, 8)}: chain does not reach a pre-existing card.`);
    }
  }

  // The text fallback below is only safe while texts are unique. Say so loudly if they stop being.
  const counts = new Map();
  for (const c of cards) counts.set(norm(c.text), (counts.get(norm(c.text)) ?? 0) + 1);
  for (const [t, n] of counts) {
    if (n > 1 && t) warnings.push(`${n} cards in the file share the text "${short(t, 50)}" — text matching is ambiguous for it.`);
  }

  return { raw, block, cards, newCards, priorCards, byId, problems, warnings };
}

// ---------------------------------------------------------------- the target
async function readTarget() {
  const project = await q(sb.from("projects").select("*").eq("slug", PROJECT_SLUG).maybeSingle());
  if (!project) throw new Error(`No project with slug "${PROJECT_SLUG}" on this database.`);

  const groups = await q(sb.from("design_groups").select("*").eq("project_id", project.id).order("sort"));
  const wanted = GROUP_OVERRIDE ?? fixture.raw.groupName ?? "";
  let matches = groups.filter((g) => norm(g.name) === norm(wanted));
  if (matches.length === 0) {
    matches = groups.filter((g) => norm(g.name).includes(norm(wanted)) || norm(wanted).includes(norm(g.name)));
  }
  if (matches.length !== 1) {
    throw new Error(
      `Group "${wanted}" matched ${matches.length} groups in "${PROJECT_SLUG}". ` +
        `Candidates: ${groups.map((g) => `"${g.name}"`).join(", ")}. Use --group to disambiguate.`
    );
  }
  const group = matches[0];

  const exercises = await q(
    sb.from("design_group_exercises").select("*").eq("group_id", group.id).order("sort")
  );
  // Matched on TYPE, not on the file's sort or title: the file's block order is incidental.
  const impl = exercises.filter((e) => e.type === "implications");
  if (impl.length !== 1) {
    throw new Error(
      `Expected one implications exercise on "${group.name}", found ${impl.length}: ` +
        exercises.map((e) => `${e.sort}:${e.type}`).join(", ")
    );
  }
  const exercise = impl[0];
  if (!exercise.session_code) throw new Error(`"${exercise.title}" has no board (session_code is null).`);

  const session = await q(sb.from("sessions").select("*").eq("code", exercise.session_code).maybeSingle());
  if (!session) throw new Error(`No session row for code ${exercise.session_code}.`);

  const cards = await q(sb.from("ripple_cards").select("*").eq("code", exercise.session_code).order("created_at"));

  // The team comes from the cards ALREADY on the board, not from ripple_teams[0]: a board can
  // carry a stray extra team row (dev's Session 3 has one called "Team 2" at join_order 1), and
  // picking the wrong one puts the new cards on a team the board does not draw.
  const teamIds = [...new Set(cards.map((c) => c.team_id))];
  let teamId;
  if (teamIds.length === 1) {
    teamId = teamIds[0];
  } else if (teamIds.length > 1) {
    throw new Error(`Board ${exercise.session_code} spans ${teamIds.length} teams (${teamIds.join(", ")}) — refusing to guess.`);
  } else {
    const teams = await q(sb.from("ripple_teams").select("*").eq("code", exercise.session_code).order("join_order"));
    if (teams.length !== 1) throw new Error(`Board ${exercise.session_code} is empty and has ${teams.length} teams — refusing to guess.`);
    teamId = teams[0].id;
  }

  return { project, group, exercise, session, cards, teamId };
}

// Depth of every card on the target board, walked from its roots — the script-side mirror of
// depthByCard (lib/ripples-types.ts:421). A card missing from this map is unreachable: on the
// board, drawn by no view. Hanging a new card off one would hide the whole new subtree.
function boardDepths(cards) {
  const children = new Map();
  for (const c of cards) {
    if (!c.parent_card_id) continue;
    if (!children.has(c.parent_card_id)) children.set(c.parent_card_id, []);
    children.get(c.parent_card_id).push(c);
  }
  const depth = new Map();
  let level = cards.filter((c) => !c.parent_card_id && c.card_order !== "STICKY");
  for (let d = 0; d <= MAX_TREE_DEPTH && level.length > 0; d++) {
    const next = [];
    for (const c of level) {
      if (depth.has(c.id)) continue;
      depth.set(c.id, d);
      next.push(...(children.get(c.id) ?? []));
    }
    level = next;
  }
  return depth;
}

// ---------------------------------------------------------------- resolution
function resolveParents(fixture, target) {
  const byTargetId = new Map(target.cards.map((c) => [c.id, c]));
  const byTargetText = new Map();
  for (const c of target.cards) {
    const k = norm(c.text);
    if (!byTargetText.has(k)) byTargetText.set(k, []);
    byTargetText.get(k).push(c);
  }
  const newIds = new Set(fixture.newCards.map((c) => c.id));

  const out = new Map();
  for (const c of fixture.newCards) {
    // 1. the parent is another card this run is importing — same (deterministic) id on the target
    if (newIds.has(c.parentId)) {
      out.set(c.id, { how: "new", parentId: c.parentId });
      continue;
    }
    // 2. the parent is already on the target board, by id
    if (byTargetId.has(c.parentId)) {
      out.set(c.id, { how: "id", parentId: c.parentId });
      continue;
    }
    // 3. fall back to the parent's text, but only when it is unambiguous
    if (!IDS_ONLY) {
      const fixtureParent = fixture.byId.get(c.parentId);
      const hits = fixtureParent ? (byTargetText.get(norm(fixtureParent.text)) ?? []) : [];
      if (hits.length === 1) {
        out.set(c.id, { how: "text", parentId: hits[0].id, matched: hits[0].text });
        continue;
      }
      out.set(c.id, { how: "unresolved", n: hits.length });
      continue;
    }
    out.set(c.id, { how: "unresolved", n: 0 });
  }
  return out;
}

// Planned depth for each new card: one past its parent's, wherever that parent lives. Iterated
// to a fixed point because a new card's parent may itself be new (27 of 55 in the first file).
function plannedDepths(fixture, parents, depthsOnBoard) {
  const depth = new Map();
  for (let pass = 0; pass < TREE_ORDERS.length + 1; pass++) {
    let moved = false;
    for (const c of fixture.newCards) {
      if (depth.has(c.id)) continue;
      const p = parents.get(c.id);
      if (!p || p.how === "unresolved") continue;
      const parentDepth = p.how === "new" ? depth.get(p.parentId) : depthsOnBoard.get(p.parentId);
      if (parentDepth === undefined) continue;
      depth.set(c.id, parentDepth + 1);
      moved = true;
    }
    if (!moved) break;
  }
  return depth;
}

function validate(fixture, target, parents, depthsOnBoard, planned) {
  const byTargetId = new Map(target.cards.map((c) => [c.id, c]));
  const onBoard = new Set(target.cards.map((c) => c.id));
  const problems = [];
  const warnings = [];
  const toInsert = [];
  const already = [];

  for (const c of fixture.newCards) {
    const where = `${c.id.slice(0, 8)} "${short(c.text, 44)}"`;
    if (onBoard.has(c.id)) {
      already.push(c);
      continue;
    }
    const p = parents.get(c.id);
    if (!p || p.how === "unresolved") {
      problems.push(`${where}: parent resolved to ${p?.n ?? 0} cards on the board.`);
      continue;
    }

    // Checks against the parent row AS IT IS ON THE TARGET, mirroring the refusals the live
    // add-a-card route makes (app/api/sessions/[code]/ripples/cards/route.ts:144-172).
    if (p.how !== "new") {
      const parent = byTargetId.get(p.parentId);
      if (!parent) {
        problems.push(`${where}: parent ${p.parentId.slice(0, 8)} vanished between read and check.`);
        continue;
      }
      if (parent.card_order === "STICKY") {
        problems.push(`${where}: parent is a brainstorm sticky, which never takes children.`);
        continue;
      }
      if (parent.greyed || parent.parked) {
        problems.push(`${where}: parent is ${parent.greyed ? "greyed out" : "parked"}.`);
        continue;
      }
      const walked = depthsOnBoard.get(parent.id);
      if (walked === undefined) {
        problems.push(`${where}: parent is unreachable from a root — a child of it would be invisible.`);
        continue;
      }
      if (DEPTH_OF.get(parent.card_order) !== walked) {
        problems.push(
          `${where}: parent's stored order ${parent.card_order} disagrees with its walked depth ${walked}.`
        );
        continue;
      }
    }

    const depth = planned.get(c.id);
    if (depth === undefined) {
      problems.push(`${where}: could not work out its depth.`);
      continue;
    }
    if (depth > MAX_TREE_DEPTH) {
      problems.push(`${where}: depth ${depth} is past the cap of ${MAX_TREE_DEPTH}.`);
      continue;
    }
    const order = TREE_ORDERS[depth];
    if (order !== c.order) {
      warnings.push(`${where}: file says ${c.order}, target depth says ${order} — using ${order}.`);
    }
    toInsert.push({ card: c, parentId: p.parentId, how: p.how, depth, order });
  }

  return { problems, warnings, toInsert, already };
}

// How many of the file's PRE-EXISTING cards can be found on this board. The file names no
// session code, so this is the only available "am I pointed at the right board" fingerprint.
function priorMatch(fixture, target) {
  const byTargetId = new Map(target.cards.map((c) => [c.id, c]));
  const byTargetText = new Map();
  for (const c of target.cards) {
    const k = norm(c.text);
    byTargetText.set(k, (byTargetText.get(k) ?? 0) + 1);
  }
  let byId = 0;
  let byText = 0;
  let missing = 0;
  for (const c of fixture.priorCards) {
    if (byTargetId.has(c.id)) byId++;
    else if (byTargetText.get(norm(c.text)) === 1) byText++;
    else missing++;
  }
  const total = fixture.priorCards.length || 1;
  return { byId, byText, missing, total: fixture.priorCards.length, ratio: (byId + byText) / total };
}

// ---------------------------------------------------------------- report
function report(fixture, target, parents, checks, fingerprint) {
  console.log(`\nTARGET  ${isProd ? "PROD" : "dev"} ${URL.replace(/^https?:\/\//, "").replace(/\/.*$/, "")}`);
  console.log(`        project "${target.project.name}" (${PROJECT_SLUG})`);
  console.log(`        group   "${target.group.name}" ${target.group.id}`);
  console.log(`        board   ${target.exercise.session_code} · "${target.exercise.title}"`);
  console.log(`        session ${target.session.id} · team ${target.teamId} · ${target.cards.length} cards`);
  const fileTeam = fixture.newCards[0]?.teamId;
  console.log(
    `        ignoring the file's team ${fileTeam ? fileTeam.slice(0, 8) : "?"}… and exercise ` +
      `${(fixture.block.exerciseId ?? "?").slice(0, 8)}… — resolved on target above`
  );

  console.log(
    `\nFINGERPRINT  ${fingerprint.byId + fingerprint.byText}/${fingerprint.total} of the file's ` +
      `pre-existing cards are on this board (${fingerprint.byId} by id, ${fingerprint.byText} by text, ` +
      `${fingerprint.missing} missing) → ${fingerprint.ratio.toFixed(2)} (need ≥ ${MIN_PRIOR_MATCH.toFixed(2)})`
  );

  const tally = { id: 0, new: 0, text: 0, unresolved: 0 };
  for (const p of parents.values()) tally[p.how]++;
  console.log(
    `\nPARENTS  by id ${tally.id} · by new card ${tally.new} · by text ${tally.text} · unresolved ${tally.unresolved}`
  );
  for (const [id, p] of parents) {
    if (p.how === "text") {
      console.log(`  text match: ${id.slice(0, 8)} → "${short(p.matched, 60)}"`);
    }
  }

  const waves = new Map();
  for (const row of checks.toInsert) {
    if (!waves.has(row.order)) waves.set(row.order, 0);
    waves.set(row.order, waves.get(row.order) + 1);
  }
  const wavePlan = [...waves.entries()]
    .sort((a, b) => DEPTH_OF.get(a[0]) - DEPTH_OF.get(b[0]))
    .map(([o, n], i) => `wave ${i + 1} ${o} ×${n}`)
    .join(" · ");
  console.log(
    `\nMAP  ${checks.toInsert.length} to insert, ${checks.already.length} already present` +
      (wavePlan ? `\n     ${wavePlan}` : "")
  );

  for (const w of [...fixture.warnings, ...checks.warnings]) console.log(`  ! ${w}`);
  for (const p of [...fixture.problems, ...checks.problems]) console.log(`  ✗ ${p}`);

  const problems = [...fixture.problems, ...checks.problems];
  if (fingerprint.ratio < MIN_PRIOR_MATCH) {
    problems.push(
      `Only ${fingerprint.ratio.toFixed(2)} of the file's pre-existing cards are on this board — ` +
        `this may be the wrong database or the wrong group. Lower --min-prior-match if you mean it.`
    );
    console.log(`  ✗ ${problems[problems.length - 1]}`);
  }
  console.log(`\nVALIDATION  ${problems.length === 0 ? "ok" : `${problems.length} problem(s)`}`);
  return problems;
}

// Every imported card carries the marker note, whatever the file said. The file's own
// descriptions happen to start with it, but "happens to" is not a contract: without the note
// the card is indistinguishable from the group's own work in the admin views.
function facilitatorNote(description) {
  const d = (description ?? "").trim();
  if (!d) return `${FACILITATOR_NOTE}.`;
  if (d.startsWith(FACILITATOR_NOTE)) return d;
  return `${FACILITATOR_NOTE}. ${d}`;
}

// ---------------------------------------------------------------- write
async function importMap(target, checks) {
  // Waves by depth, so a parent always exists before its children. Within a wave, the file's own
  // creation order, because siblings share a wave and every view orders siblings by created_at.
  const byDepth = new Map();
  for (const row of checks.toInsert) {
    if (!byDepth.has(row.depth)) byDepth.set(row.depth, []);
    byDepth.get(row.depth).push(row);
  }
  let total = 0;
  for (const depth of [...byDepth.keys()].sort((a, b) => a - b)) {
    const wave = byDepth.get(depth).sort((a, b) => (a.card.createdTime ?? "").localeCompare(b.card.createdTime ?? ""));
    const rows = wave.map(({ card, parentId, order }) => ({
      // Built field by field, never spread from the file: `isFacilitator` is not a column and
      // PostgREST rejects an unknown key outright.
      id: card.id,
      session_id: target.session.id,
      code: target.exercise.session_code.toUpperCase(),
      team_id: target.teamId,
      author_player_id: null, // facilitator-written, like the admin seeder's key changes
      card_order: order,
      parent_card_id: parentId,
      text: (card.text ?? "").trim(),
      description: facilitatorNote(card.description),
      card_kind: null,
      section: null,
      source_card_id: null, // a chain card, not seeded across from another week
      source_label: null,
      twin_key: null,
      lens_id: null,
      sort: 0, // the Session 2 tree orders by created_at; sort is for stickies and themes
      plausibility: null,
      impact: null,
      created_at: nextStamp(),
    }));
    // ON CONFLICT DO NOTHING, so .select() returns only what was actually inserted — the same
    // way seedFirstCards derives its `added` count (lib/ripples.ts:786).
    const written = await q(
      sb.from("ripple_cards").upsert(rows, { onConflict: "id", ignoreDuplicates: true }).select("id")
    );
    total += written.length;
    console.log(`  ${TREE_ORDERS[depth]}: +${written.length} (${rows.length - written.length} already there)`);
  }
  console.log(`\nmap: +${total} card(s) on ${target.exercise.session_code}`);
  return total;
}

// ---------------------------------------------------------------- go
const fixture = readFixture();
console.log(
  `${command} → ${isProd ? "PROD" : "dev"} · project "${PROJECT_SLUG}" · ${FILE}\n` +
    `file: ${fixture.cards.length} cards on "${fixture.block.title}" = ` +
    `${fixture.priorCards.length} pre-existing + ${fixture.newCards.length} to import`
);

const target = await readTarget();
const depthsOnBoard = boardDepths(target.cards);
const parents = resolveParents(fixture, target);
const planned = plannedDepths(fixture, parents, depthsOnBoard);
const checks = validate(fixture, target, parents, depthsOnBoard, planned);
const fingerprint = priorMatch(fixture, target);
const problems = report(fixture, target, parents, checks, fingerprint);

if (command === "plan") {
  console.log("\nplan only — nothing written.");
  process.exit(problems.length === 0 ? 0 : 1);
}
if (problems.length > 0) {
  console.error("\nRefusing to write: fix the problems above, or re-run `plan` to see them again.");
  process.exit(1);
}
if (checks.toInsert.length === 0) {
  console.log("\nnothing to do — every card is already on the board.");
  process.exit(0);
}
await importMap(target, checks);
console.log("done");
