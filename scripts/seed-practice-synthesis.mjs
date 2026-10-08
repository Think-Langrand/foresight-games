// Seed — and tear down — the Week 3 (synthesis) demo data for the practice project.
//
//   node scripts/seed-practice-synthesis.mjs plan
//   node scripts/seed-practice-synthesis.mjs seed            [--prod]
//   node scripts/seed-practice-synthesis.mjs reset --yes     [--prod]
//
// WHY THIS EXISTS. The four real Public Health Session 3 boards hold a seeded tray and
// nothing else, because DG3 has not run yet — correct, but no themes, hopes or fears to
// show anyone. The practice project ("Future of Transportation") carries two groups so a
// co-lead workshop has both halves:
//
//   Example Group   a WORKED board — themes, four answers each, risks, opportunities,
//                   board-level hopes and fears, some fears flipped. Use it to SHOW.
//   Practice Group  the same Sessions 1 and 2, and a Session 3 holding only the tray.
//                   Use it to have co-leads DO the exercise.
//
// Content lives in data/practice-synthesis.seed.json, so the words can be edited without
// touching the mechanics here.
//
// SEEDING IS ADDITIVE AND IDEMPOTENT. `seed` never deletes or rewrites an existing card:
// each phase checks for what it would write and skips what is already there, so re-running
// it is safe. To rebuild from scratch, `reset` first.
//
// RESETTING DELETES. It is guarded three ways: it refuses any project outside
// DESTRUCTIVE_PROJECTS, it refuses without --yes, and it only ever drops the Session 3
// board plus the whole of the play group — never Sessions 1 and 2 of a group it did not
// create, and never a card on a board it is not dropping outright.
//
// CREDENTIALS. TARGET_SUPABASE_URL + TARGET_SUPABASE_SERVICE_ROLE_KEY when set, else
// NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (.env / .env.local). Writing to the
// prod ref additionally requires --prod, so a shell pointed at prod cannot seed by accident.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const FIXTURE = "data/practice-synthesis.seed.json";
const PROD_REF = "ratkqnumupciffxnsbhk";

// Only these projects may be reset. The guard that matters: it makes `reset` against the
// live Public Health project impossible, whatever else is mistyped.
const DESTRUCTIVE_PROJECTS = new Set(["practice"]);

const DEMO_GROUP = "Example Group"; // pre-existing; only its Session 3 is ever touched
const PLAY_GROUP = "Practice Group"; // created and dropped wholesale by this script
const SESSION3_TITLE = "Session 3 · Themes, Hopes & Fears";
const WEEK = { ASSESS: 0, MAP: 1, SYNTHESIS: 2 };

// Cards left behind by earlier testing. They stay on the Week 2 map (deleting a
// participant's card is not this script's business) but are not carried into a Week 3 tray,
// where they would be noise on a demo board.
const NOT_FOR_THE_TRAY = new Set([
  "test",
  "another implication here",
  "and here",
  "the nodes pop up automatically",
]);

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

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
const PROJECT_SLUG = opt("project", "practice");

const COMMANDS = ["plan", "seed", "reset"];
if (!COMMANDS.includes(command)) {
  console.error(`Usage: node scripts/seed-practice-synthesis.mjs <${COMMANDS.join("|")}> [--project slug] [--prod] [--yes]`);
  process.exit(1);
}

const URL = process.env.TARGET_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.TARGET_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error("Missing Supabase env (TARGET_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL + a service-role key).");
  process.exit(1);
}
const isProd = URL.includes(PROD_REF);
if (isProd && !flag("prod")) {
  console.error("That URL is the PROD project. Re-run with --prod if you mean it.");
  process.exit(1);
}
if (command === "reset") {
  if (!DESTRUCTIVE_PROJECTS.has(PROJECT_SLUG)) {
    console.error(`Refusing to reset "${PROJECT_SLUG}". Only these may be reset: ${[...DESTRUCTIVE_PROJECTS].join(", ")}.`);
    process.exit(1);
  }
  if (!flag("yes")) {
    console.error(`reset DELETES the ${SESSION3_TITLE} board on "${DEMO_GROUP}" and the whole of "${PLAY_GROUP}". Re-run with --yes.`);
    process.exit(1);
  }
}
console.log(`${command} → ${isProd ? "PROD" : "dev"} · project "${PROJECT_SLUG}"`);

const sb = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const fixture = JSON.parse(readFileSync(join(root, FIXTURE), "utf8"));

async function q(builder) {
  const { data, error } = await builder;
  if (error) throw error;
  return data;
}

const norm = (s) => (s ?? "").replace(/\s+/g, " ").trim().toLowerCase();

async function freshCode() {
  for (let i = 0; i < 25; i++) {
    let c = "";
    for (let n = 0; n < 4; n++) c += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    if (!(await q(sb.from("sessions").select("code").eq("code", c).maybeSingle()))) return c;
  }
  throw new Error("Could not mint a free session code");
}

// created_at is staggered so the boards, which order by creation time within a `sort`, keep
// the order the fixture gives.
let stamp = Date.now();
const nextStamp = () => new Date((stamp += 2)).toISOString();

// ---------------------------------------------------------------- reading
async function readWorld() {
  const project = await q(sb.from("projects").select("*").eq("slug", PROJECT_SLUG).maybeSingle());
  if (!project) throw new Error(`No project with slug "${PROJECT_SLUG}" on this database.`);
  const groups = await q(sb.from("design_groups").select("*").eq("project_id", project.id).order("sort"));
  const out = { project, groups: [] };
  for (const group of groups) {
    const exercises = await q(
      sb.from("design_group_exercises").select("*").eq("group_id", group.id).order("sort")
    );
    const boards = {};
    for (const ex of exercises) {
      if (!ex.session_code) continue;
      const session = await q(sb.from("sessions").select("*").eq("code", ex.session_code).maybeSingle());
      if (!session) continue;
      const teams = await q(sb.from("ripple_teams").select("*").eq("session_id", session.id).order("join_order"));
      const cards = await q(sb.from("ripple_cards").select("*").eq("code", ex.session_code));
      boards[ex.sort] = { session, team: teams[0] ?? null, cards };
    }
    out.groups.push({ group, exercises, boards });
  }
  return out;
}

function group(world, name, { required = true } = {}) {
  const entry = world.groups.find((g) => g.group.name === name);
  if (!entry && required) throw new Error(`No design group named "${name}" in the ${PROJECT_SLUG} project.`);
  return entry ?? null;
}

// ---------------------------------------------------------------- writing cards
const addCards = async (rows) => (rows.length === 0 ? [] : await q(sb.from("ripple_cards").insert(rows).select("*")));

function card({ session, team, order, parentId, text, kind = null, description = null, sourceCardId = null, sourceLabel = null, twinKey = null, section = null, sort = 0 }) {
  return {
    session_id: session.id,
    code: session.code,
    team_id: team.id,
    author_player_id: null, // seeded, like the admin seeder's key changes — no author
    card_order: order,
    parent_card_id: parentId,
    text,
    card_kind: kind,
    description,
    source_card_id: sourceCardId,
    source_label: sourceLabel,
    twin_key: twinKey,
    section,
    sort,
    created_at: nextStamp(),
  };
}

// The shared-board config lib/design-group-exercises.buildSharedBoardConfig writes, with
// the scenario snapshot lifted from the week that already holds it. Taking it from Week 2
// rather than re-fetching means this script needs no platform credentials and works offline.
function synthesisConfig(mapSession) {
  const prior = mapSession.config ?? {};
  return {
    scenarioRef: prior.scenarioRef ?? "",
    projectRef: prior.projectRef ?? null,
    scenarioTitle: prior.scenarioTitle ?? "",
    premise: prior.premise ?? "",
    resolutions: Array.isArray(prior.resolutions) ? prior.resolutions : [],
    questions: Array.isArray(prior.questions) ? prior.questions : [],
    ripple1Seconds: 300,
    chainSeconds: 600,
    wagerSeconds: 180,
    chipsPerPlayer: 3,
    challengeEnabled: false,
    lensDeckEnabled: false,
    solo: false,
    sharedTeam: true,
    // Explicit, not inherited: see the note in buildSharedBoardConfig.
    scoringEnabled: true,
    summary: null, // left unset so a facilitator can generate "Where we've got to" live
  };
}

async function provisionBoard({ exercise, groupRow, title, config }) {
  const code = await freshCode();
  const [session] = await q(
    sb
      .from("sessions")
      .insert({
        code,
        title,
        scope: "Ripples",
        pacing: null,
        uncertainty_id: null,
        driver_id: null,
        mode: "Divergent",
        prompt: groupRow.scenario_title ?? "",
        status: "Open",
        facilitator: "",
        project_id: groupRow.project_id,
        phase: "BUILD",
        config,
      })
      .select("*")
  );
  const [team] = await q(
    sb
      .from("ripple_teams")
      .insert({ session_id: session.id, code, name: title, color: groupRow.color, join_order: 0 })
      .select("*")
  );
  await q(
    sb.from("design_group_exercises").update({ session_code: code, updated_at: new Date().toISOString() }).eq("id", exercise.id)
  );
  exercise.session_code = code;
  return { session, team, cards: [] };
}

// ---------------------------------------------------------------- seed phases
async function seedImplications(entry) {
  const map = entry.boards[WEEK.MAP];
  if (!map) throw new Error(`${entry.group.name} has no Session 2 board.`);
  const { session, team, cards } = map;
  const have = new Set(cards.map((c) => norm(c.text)));
  const roots = new Map(cards.filter((c) => c.card_order === "FIRST").map((c) => [norm(c.text), c]));
  let added = 0;

  for (const [keyChange, items] of Object.entries(fixture.implications)) {
    const rootCard = roots.get(norm(keyChange));
    if (!rootCard) {
      console.log(`    ! no key change "${keyChange}" on the map — its implications skipped`);
      continue;
    }
    for (const item of items) {
      let parent = cards.find((c) => norm(c.text) === norm(item.text));
      if (!parent) {
        [parent] = await addCards([card({ session, team, order: "SECOND", parentId: rootCard.id, text: item.text })]);
        cards.push(parent);
        have.add(norm(item.text));
        added++;
      }
      for (const childText of item.children ?? []) {
        if (have.has(norm(childText))) continue;
        const [child] = await addCards([card({ session, team, order: "TERMINAL", parentId: parent.id, text: childText })]);
        cards.push(child);
        have.add(norm(childText));
        added++;
      }
    }
  }
  console.log(`    Session 2 (${session.code}): +${added} implications`);
}

async function ensureSynthesisWeek(entry) {
  const ex = entry.exercises.find((e) => e.sort === WEEK.SYNTHESIS);
  if (!ex) throw new Error(`${entry.group.name} has no week at sort ${WEEK.SYNTHESIS}.`);
  const map = entry.boards[WEEK.MAP];
  if (!map) throw new Error(`${entry.group.name} has no Session 2 board to take the scenario from.`);

  if (ex.type !== "synthesis" || ex.locked || ex.closed) {
    await q(
      sb
        .from("design_group_exercises")
        .update({ type: "synthesis", title: SESSION3_TITLE, sections: [], locked: false, closed: false, updated_at: new Date().toISOString() })
        .eq("id", ex.id)
    );
    Object.assign(ex, { type: "synthesis", title: SESSION3_TITLE, locked: false, closed: false });
    console.log(`    Session 3 → synthesis, open`);
  }
  if (!ex.session_code) {
    entry.boards[WEEK.SYNTHESIS] = await provisionBoard({
      exercise: ex,
      groupRow: entry.group,
      title: SESSION3_TITLE,
      config: synthesisConfig(map.session),
    });
    console.log(`    Session 3 board: ${ex.session_code}`);
  }
}

// Week 2's implications become the Week 3 tray: FIRST roots carrying the Week 2 link, which
// is what lib/ripples.seedFirstCards writes and what the lineage panel reads.
async function seedTray(entry) {
  const map = entry.boards[WEEK.MAP];
  const board = entry.boards[WEEK.SYNTHESIS];
  if (!board) throw new Error(`${entry.group.name} has no Session 3 board — run the session3 phase first.`);
  const mapTitle = entry.exercises.find((e) => e.sort === WEEK.MAP)?.title ?? "Session 2";
  const rootIds = new Set(map.cards.filter((c) => c.parent_card_id === null).map((c) => c.id));
  const implications = map.cards
    .filter((c) => !rootIds.has(c.id) && c.card_order !== "STICKY" && (c.text ?? "").trim())
    .filter((c) => !NOT_FOR_THE_TRAY.has(norm(c.text)))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const seeded = new Set(board.cards.map((c) => c.source_card_id).filter(Boolean));
  const todo = implications.filter((c) => !seeded.has(c.id));
  const written = await addCards(
    todo.map((c) =>
      card({ session: board.session, team: board.team, order: "FIRST", parentId: null, text: c.text.trim(), sourceCardId: c.id, sourceLabel: mapTitle })
    )
  );
  board.cards.push(...written);
  console.log(`    tray on ${board.session.code}: +${written.length} (${implications.length - todo.length} already there)`);
}

// The worked board: themes, their implications, four answers each, the two walls, then the
// board's hopes and fears with their flips.
async function seedWorkedBoard(entry) {
  const board = entry.boards[WEEK.SYNTHESIS];
  if (!board) throw new Error(`${entry.group.name} has no Session 3 board.`);
  if (board.cards.some((c) => c.card_kind === "theme")) {
    console.log(`    already worked (themes present) — left alone`);
    return;
  }
  const { session, team } = board;
  const tray = new Map();
  for (const c of board.cards) if (c.card_kind === null && c.parent_card_id === null) tray.set(norm(c.text), c);

  const filed = new Map(); // norm(text) → the card now sitting under a theme
  const unmatched = [];

  for (const t of fixture.themes) {
    const [theme] = await addCards([
      card({ session, team, order: "FIRST", parentId: null, text: t.text, kind: "theme", description: t.description }),
    ]);

    for (const text of t.implications) {
      const key = norm(text);
      const trayCard = tray.get(key);
      if (!trayCard) {
        unmatched.push(text);
        continue;
      }
      const prior = filed.get(key);
      if (!prior) {
        // The first theme to take it: the tray card moves in, FIRST root → SECOND child.
        await q(sb.from("ripple_cards").update({ parent_card_id: theme.id, card_order: "SECOND" }).eq("id", trayCard.id));
        filed.set(key, trayCard);
      } else {
        // A second theme gets a COPY sharing a twin key, with a null source_card_id — what
        // the add-a-card route writes for "also in this theme" (0023). Clustering is not a
        // partition, and the walkthrough should show that.
        const twin = prior.twin_key ?? prior.id;
        if (!prior.twin_key) {
          await q(sb.from("ripple_cards").update({ twin_key: twin }).eq("id", prior.id));
          prior.twin_key = twin;
        }
        await addCards([card({ session, team, order: "SECOND", parentId: theme.id, text: prior.text, twinKey: twin })]);
      }
    }

    const rows = [];
    for (const kind of ["benefit", "cost", "experience", "mechanism"])
      for (const text of t[kind] ?? []) rows.push(card({ session, team, order: "SECOND", parentId: theme.id, text, kind }));
    for (const text of t.risks ?? []) rows.push(card({ session, team, order: "SECOND", parentId: theme.id, text, kind: "risk" }));
    for (const text of t.opportunities ?? [])
      rows.push(card({ session, team, order: "SECOND", parentId: theme.id, text, kind: "opportunity" }));
    await addCards(rows);
    console.log(`    theme: ${t.text}`);
  }

  for (const hf of fixture.hopesFears) {
    const [root] = await addCards([
      card({ session, team, order: "FIRST", parentId: null, text: hf.text, kind: hf.kind, description: hf.why }),
    ]);
    const children = [];
    if (hf.concerns)
      children.push(card({ session, team, order: "SECOND", parentId: root.id, text: hf.concerns, kind: "concerns" }));
    if (hf.flip)
      children.push(
        card({
          session,
          team,
          order: "SECOND",
          parentId: root.id,
          text: hf.flip.text,
          kind: hf.kind === "hope" ? "fear" : "hope",
          description: hf.flip.why,
        })
      );
    await addCards(children);
  }
  const flips = fixture.hopesFears.filter((h) => h.flip).length;
  console.log(`    ${fixture.hopesFears.length} hopes & fears, ${flips} flipped`);
  if (unmatched.length) {
    console.log(`    ! these theme implications matched nothing in the tray:`);
    for (const u of unmatched) console.log(`        ${u}`);
  }
}

// The play group: the demo group's Sessions 1 and 2 copied, and a Session 3 holding only the
// tray. Its weeks mirror the demo group's so the project's program stays in lockstep — the
// admin program editor treats every group's weeks as copies of one canonical program.
async function createPlayGroup(world) {
  if (group(world, PLAY_GROUP, { required: false })) {
    console.log(`    "${PLAY_GROUP}" already exists — left alone`);
    return;
  }
  const demo = group(world, DEMO_GROUP);
  const src = demo.group;
  const [groupRow] = await q(
    sb
      .from("design_groups")
      .insert({
        project_id: src.project_id,
        name: PLAY_GROUP,
        sort: Math.max(...world.groups.map((g) => g.group.sort)) + 1,
        color: "#1f6feb",
        scenario_ref: src.scenario_ref,
        scenario_set_id: src.scenario_set_id,
        scenario_title: src.scenario_title,
      })
      .select("*")
  );
  console.log(`    created "${groupRow.name}"`);

  const exercises = [];
  for (const ex of demo.exercises) {
    const synthesis = ex.sort === WEEK.SYNTHESIS;
    const [row] = await q(
      sb
        .from("design_group_exercises")
        .insert({
          group_id: groupRow.id,
          sort: ex.sort,
          title: synthesis ? SESSION3_TITLE : ex.title,
          type: synthesis ? "synthesis" : ex.type,
          sections: synthesis ? [] : ex.sections,
          opens_at: ex.opens_at,
          // Match the demo group week for week, or the program reads as out of lockstep.
          locked: synthesis ? false : ex.locked,
          closed: synthesis ? false : ex.closed,
        })
        .select("*")
    );
    exercises.push(row);
  }
  const entry = { group: groupRow, exercises, boards: {} };

  for (const sort of [WEEK.ASSESS, WEEK.MAP, WEEK.SYNTHESIS]) {
    const ex = exercises.find((e) => e.sort === sort);
    const srcBoard = demo.boards[sort];
    entry.boards[sort] = await provisionBoard({
      exercise: ex,
      groupRow,
      title: ex.title,
      config: sort === WEEK.SYNTHESIS ? synthesisConfig(demo.boards[WEEK.MAP].session) : { ...(srcBoard?.session.config ?? {}), summary: null },
    });
    console.log(`    week ${sort} board: ${ex.session_code}`);
  }

  // Session 1: the six key changes, as the worksheet's "Our 6 key changes" answers.
  const assess = entry.boards[WEEK.ASSESS];
  let stickySort = Date.now();
  const sixChanges = (demo.boards[WEEK.ASSESS]?.cards ?? [])
    .filter((c) => c.section === "six-changes")
    .sort((a, b) => a.sort - b.sort);
  assess.cards.push(
    ...(await addCards(
      sixChanges.map((c) =>
        card({ session: assess.session, team: assess.team, order: "STICKY", parentId: null, text: c.text, section: "six-changes", sort: (stickySort += 1000) })
      )
    ))
  );

  // Session 2: those six seeded as the map's roots, with the lineage the admin seeder
  // writes, then the fixture's implications under them.
  const map = entry.boards[WEEK.MAP];
  const assessTitle = exercises.find((e) => e.sort === WEEK.ASSESS).title;
  map.cards.push(
    ...(await addCards(
      assess.cards.map((c) =>
        card({ session: map.session, team: map.team, order: "FIRST", parentId: null, text: c.text, sourceCardId: c.id, sourceLabel: assessTitle })
      )
    ))
  );
  console.log(`    Session 1: ${assess.cards.length} key changes · Session 2: ${map.cards.length} roots`);
  await seedImplications(entry);
  await seedTray(entry);
  world.groups.push(entry);
}

// ---------------------------------------------------------------- reset
// Drop a board outright: its cards, its players, its team, the session row, and the week's
// link to it. ripple_cards is deleted explicitly rather than relying on a cascade, so this
// behaves the same whatever the FK definitions do.
async function dropBoard(exercise) {
  if (!exercise.session_code) return false;
  const code = exercise.session_code;
  const session = await q(sb.from("sessions").select("id").eq("code", code).maybeSingle());
  await q(sb.from("ripple_cards").delete().eq("code", code));
  const teams = await q(sb.from("ripple_teams").select("id").eq("code", code));
  for (const t of teams) await q(sb.from("ripple_players").delete().eq("team_id", t.id));
  await q(sb.from("ripple_teams").delete().eq("code", code));
  if (session) await q(sb.from("sessions").delete().eq("id", session.id));
  await q(
    sb.from("design_group_exercises").update({ session_code: null, updated_at: new Date().toISOString() }).eq("id", exercise.id)
  );
  exercise.session_code = null;
  console.log(`    dropped board ${code}`);
  return true;
}

async function reset(world) {
  // The demo group keeps Sessions 1 and 2 — they hold cards this script did not write.
  // Only its Session 3, which is entirely seeded, goes.
  const demo = group(world, DEMO_GROUP, { required: false });
  if (demo) {
    const ex = demo.exercises.find((e) => e.sort === WEEK.SYNTHESIS);
    if (ex && (await dropBoard(ex))) {
      await q(
        sb
          .from("design_group_exercises")
          .update({ type: "placeholder", locked: true, closed: true, updated_at: new Date().toISOString() })
          .eq("id", ex.id)
      );
      console.log(`    "${DEMO_GROUP}" Session 3 → placeholder, closed`);
    } else {
      console.log(`    "${DEMO_GROUP}" Session 3 has no board — nothing to drop`);
    }
  }

  // The play group was created wholesale by this script, so it goes wholesale.
  const play = group(world, PLAY_GROUP, { required: false });
  if (!play) {
    console.log(`    "${PLAY_GROUP}" does not exist — nothing to drop`);
    return;
  }
  for (const ex of play.exercises) await dropBoard(ex);
  await q(sb.from("design_group_exercises").delete().eq("group_id", play.group.id));
  await q(sb.from("design_groups").delete().eq("id", play.group.id));
  console.log(`    dropped group "${PLAY_GROUP}"`);
}

// ---------------------------------------------------------------- plan
function plan(world) {
  console.log(`\n${world.project.name} (${world.project.slug})`);
  for (const entry of world.groups) {
    console.log(`\n  ${entry.group.name} — ${entry.group.scenario_title ?? "no scenario"}`);
    for (const ex of entry.exercises) {
      const board = entry.boards[ex.sort];
      const kinds = board
        ? Object.entries(
            board.cards.reduce((acc, c) => ({ ...acc, [c.card_kind ?? "implication"]: (acc[c.card_kind ?? "implication"] ?? 0) + 1 }), {})
          )
            .map(([k, v]) => `${k}:${v}`)
            .join(" ")
        : "";
      const state = [ex.locked && "locked", ex.closed && "closed"].filter(Boolean).join(" ");
      console.log(`    ${ex.sort}  ${ex.title.padEnd(36)} ${ex.type.padEnd(20)} ${(ex.session_code ?? "—").padEnd(6)} ${state.padEnd(14)} ${kinds}`);
    }
  }
}

// ---------------------------------------------------------------- main
const world = await readWorld();

if (command === "plan") {
  plan(world);
} else if (command === "reset") {
  console.log("\nreset");
  await reset(world);
  plan(await readWorld());
} else {
  const demo = group(world, DEMO_GROUP);
  console.log(`\n${DEMO_GROUP}`);
  await seedImplications(demo);
  await ensureSynthesisWeek(demo);
  await seedTray(demo);
  await seedWorkedBoard(demo);
  console.log(`\n${PLAY_GROUP}`);
  await createPlayGroup(world);
  plan(await readWorld());
}
console.log("\ndone");
