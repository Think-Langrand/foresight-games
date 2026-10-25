// Put the four public-health design groups back on their real four-week program.
//
//   node scripts/reset-dev-program.mjs plan
//   node scripts/reset-dev-program.mjs apply [--force]
//
// WHY THIS EXISTS. Dev holds the groups' real work — every card on weeks 1-3 matches the
// admin viewer's Oct-19 prod exports, card for card — but the PROGRAM around it was taken
// apart by testing: every week retitled "ZZ TEST · …" and retyped `synthesis`, two extra
// weeks bolted on per group, the real Session 4 parked at sort 5, and a fifth "ZZ TEST
// GROUP (delete me)" in the project. Five weeks claiming render=synthesis is not cosmetic:
// Week 4's reference rail picks its material with `kind === "synthesis"` and the handoff
// finds Week 4 with `render === "commitments"`, so neither can work until the types are
// right. This repairs the registry so dev reads as "four groups going into week 4".
//
// IT DOES NOT TOUCH A REAL CARD. Like reconcileGroupsToProgram (lib/design-program.ts) it
// never writes session_code, so each board and its cards stay bolted to the same
// design_group_exercises row through the retitle and the retype. The only boards it clears
// are Week 4's (scratch) and the two stray test weeks' (deleted outright). Weeks 0-2 are
// guarded by their expected card counts and the run aborts before any write if one differs.
//
// SECTIONS. Week 1's 17 questions are admin-authored and have no code template, so they are
// read from data/design-groups.seed.json — verified key-for-key against the Oct-19 exports,
// and it additionally carries the `step` labels the answers export drops. Weeks 2 and 3 store
// `[]` on purpose so resolveEffectiveSections falls back to lib/exercise-types.ts and they
// stay in lockstep with the code. Week 4's four sections are duplicated below because
// scripts/ cannot import lib/ (37 of those modules open with `import "server-only"` — see
// import-facilitator-implications.mjs, which carries the same note).
//
// CREDENTIALS. NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (.env / .env.local).
// Refuses to run against the prod ref at all: this is a dev-shaped repair and the live
// cohort's program is not something a script should rewrite.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const PROD_REF = "ratkqnumupciffxnsbhk";
const FIXTURE = "data/design-groups.seed.json";
const PROJECT = "public-health";

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
      if (process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}
loadEnv();

const argv = process.argv.slice(2);
const command = argv[0] ?? "";
const force = argv.includes("--force");
if (!["plan", "apply"].includes(command)) {
  console.error("Usage: reset-dev-program.mjs plan|apply [--force]");
  process.exit(1);
}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Set them in .env.local.");
  process.exit(1);
}
if (URL.includes(PROD_REF)) {
  console.error("Target is PROD. This script rewrites a program and will not run there.");
  process.exit(1);
}
const sb = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

async function q(builder) {
  const { data, error } = await builder;
  if (error) throw error;
  return data;
}

// lib/exercise-types.ts COMMITMENTS_SECTIONS. The keys are the permanent answer-card
// buckets (w4-role is matched by identity by the handoff deck), so they are copied
// verbatim; the labels and help text are the display side and may drift from the code
// without consequence here, because a stamped exercise owns its own snapshot.
const COMMITMENTS_SECTIONS = [
  {
    key: "w4-summary",
    kind: "question",
    step: "Key changes",
    label: "How has the field of public health changed the most in this world?",
    help: "Describe how the whole field works in this world. Write it so someone who missed every session could follow you.",
  },
  {
    key: "w4-assumptions",
    kind: "question",
    step: "Key changes",
    label: "Which of today's assumptions about public health stop being true in this scenario?",
    help: "Look for what nobody argues about today, because everyone takes it for granted. In this world it no longer holds.",
  },
  {
    key: "w4-role",
    kind: "question",
    step: "Bold moves",
    label: "What is the aspirational role for public health in this world?",
    help: "Write what the field is reaching for, not what you expect it to settle for. Put it in the present tense, as though this world has already arrived. The moves below are how you get there.",
  },
  {
    key: "w4-bold-moves",
    kind: "question",
    step: "Bold moves",
    label: "What are the boldest moves public health could make in this world to reach that role?",
    help: "Write three, one per answer. Name who acts and what they do, concretely enough that you could picture it happening.",
  },
];

// Week 1's questions, from the fixture rather than inlined — it is the only committed
// record of the 17 admin-authored sections, and the cards on every week-1 board are already
// tagged to these exact keys.
function week1Sections() {
  const fixture = JSON.parse(readFileSync(join(root, FIXTURE), "utf8"));
  const sections = fixture.program?.[0]?.sections;
  if (!Array.isArray(sections) || sections.length !== 17) {
    throw new Error(`${FIXTURE} program[0].sections should be the 17 Session 1 questions; got ${sections?.length}`);
  }
  return sections;
}

// The canonical program, all four weeks open. Titles are prod's (the Oct-19 exports), except
// Session 4's, which is lib/exercise-types.ts DEFAULT_PROGRAM.
function canonicalWeeks() {
  return [
    { sort: 0, type: "scenario-assessment", title: "Session 1 - Scenario Assessment", sections: week1Sections() },
    { sort: 1, type: "implications", title: "Session 2 · Implication Mapping", sections: [] },
    { sort: 2, type: "synthesis", title: "Session 3 · Opportunities, Risks & Challenges", sections: [] },
    { sort: 3, type: "commitments", title: "Session 4 · Commitments", sections: COMMITMENTS_SECTIONS },
  ];
}

// Prod's display text for the group rows. scenario_ref / scenario_set_id are deliberately
// NOT in here: the Foresight platform has since retitled these scenarios ("The Living Floor"
// → "The Useful Life", "The Known and Unknown" → "Known Here"), so re-assigning the scenario
// would overwrite these cached titles with the new names and move dev AWAY from what prod
// shows participants. The refs dev holds are valid and still resolve the handoff artwork.
const GROUP_IDENTITY = {
  1: { name: "Group 1 | The Public Works", scenarioTitle: "The Public Works" },
  2: { name: "Group 2 | The Known and Unknown", scenarioTitle: "The Known and Unknown" },
  3: { name: "Group 3 | The Living Floor", scenarioTitle: "The Living Floor" },
  4: { name: "Group 4 | The Moving Public", scenarioTitle: "The Moving Public" },
};

// The guard. Weeks 0-2 carry the groups' real work and this script has no business changing
// their card counts; a mismatch means dev is not the database this was written against, so
// stop before the first write rather than repair half a program.
const EXPECTED_CARDS = {
  1: [104, 152, 196],
  2: [60, 77, 102],
  3: [53, 53, 116],
  4: [53, 70, 103],
};

const groupNumber = (name) => {
  const m = String(name).match(/^group\s*(\d+)\b/i);
  return m ? Number(m[1]) : null;
};

async function cardCount(code) {
  if (!code) return 0;
  const { count, error } = await sb
    .from("ripple_cards")
    .select("id", { count: "exact", head: true })
    .eq("code", code);
  if (error) throw error;
  return count ?? 0;
}

// Clear a board the way import-group-answers.mjs does. ripple_canvas_cards is keyed on card
// identity and is deliberately NOT a foreign key (migration 0028), so it does not cascade and
// has to go first and explicitly; canvas regions cascade off their theme card.
async function wipeBoard(code) {
  await q(sb.from("ripple_canvas_cards").delete().eq("code", code));
  await q(sb.from("ripple_cards").delete().eq("code", code));
  await q(sb.from("ripple_players").delete().eq("code", code));
}

async function main() {
  const weeks = canonicalWeeks();
  console.log(`target   ${URL.replace(/^https:\/\//, "")}`);
  console.log(`project  ${PROJECT}`);
  console.log(`mode     ${command}${force ? " --force" : ""}\n`);

  const [project] = await q(sb.from("projects").select("id, slug, name").eq("slug", PROJECT));
  if (!project) throw new Error(`No project with slug ${PROJECT}.`);

  const groups = await q(
    sb.from("design_groups").select("id, name, sort, color, scenario_title").eq("project_id", project.id).order("sort")
  );

  const keep = [];
  const drop = [];
  for (const g of groups) {
    const n = groupNumber(g.name);
    if (n && GROUP_IDENTITY[n]) keep.push({ ...g, n });
    else drop.push(g);
  }
  if (keep.length !== 4) {
    throw new Error(`Expected to find Groups 1-4; found ${keep.length} (${keep.map((g) => g.name).join(", ")}).`);
  }

  const jobs = [];
  let problems = 0;

  for (const g of keep.sort((a, b) => a.n - b.n)) {
    const exercises = await q(
      sb.from("design_group_exercises").select("*").eq("group_id", g.id).order("sort")
    );
    const identity = GROUP_IDENTITY[g.n];
    console.log(`Group ${g.n}  "${g.name}"`);
    if (g.name !== identity.name || g.scenario_title !== identity.scenarioTitle) {
      console.log(`   rename  "${g.name}" / "${g.scenario_title}"  ->  "${identity.name}" / "${identity.scenarioTitle}"`);
    }

    // Weeks 0-2 keep their rows and their boards; only the registry columns change.
    const updates = [];
    for (const week of weeks.slice(0, 3)) {
      const row = exercises.find((e) => e.sort === week.sort);
      if (!row) {
        console.error(`   !       no row at sort ${week.sort}`);
        problems++;
        continue;
      }
      const n = await cardCount(row.session_code);
      const want = EXPECTED_CARDS[g.n][week.sort];
      const ok = n === want;
      if (!ok) {
        console.error(`   !       sort ${week.sort} board ${row.session_code} has ${n} cards, expected ${want}`);
        if (!force) problems++;
      }
      console.log(
        `   week ${week.sort}  ${row.session_code}  ${n} cards${ok ? "" : ` (expected ${want})`}` +
          `\n             type   ${row.type} -> ${week.type}` +
          `\n             title  "${row.title}" -> "${week.title}"` +
          `\n             sects  ${(Array.isArray(row.sections) ? row.sections.length : 0)} -> ${week.sections.length}`
      );
      updates.push({ id: row.id, week });
    }

    // Week 4: the commitments row parked at sort 5 is already the right type with the right
    // sections and a board whose config carries this group's scenario snapshot. Renumbering
    // it beats provisioning a new board, which would need the Foresight platform up.
    const w4 = exercises.find((e) => e.type === "commitments");
    if (!w4) {
      console.error(`   !       no commitments row to promote to week 3`);
      problems++;
    } else {
      const n = await cardCount(w4.session_code);
      console.log(`   week 3  ${w4.session_code}  promote from sort ${w4.sort}, wipe ${n} scratch card(s)`);
    }

    // Everything else is a stray test week: registry row AND its backing session go.
    const strays = exercises.filter(
      (e) => e.sort > 2 && e.id !== w4?.id
    );
    for (const s of strays) {
      const n = await cardCount(s.session_code);
      console.log(`   delete  sort ${s.sort} ${s.session_code ?? "(no board)"} "${s.title}" (${n} cards)`);
    }
    const boardCodes = [...updates.map((u) => exercises.find((e) => e.id === u.id)?.session_code), w4?.session_code]
      .filter(Boolean);
    for (const code of boardCodes) {
      const teams = await q(sb.from("ripple_teams").select("id, name, join_order").eq("code", code).order("join_order"));
      if (teams[0] && code === w4?.session_code && teams[0].name !== weeks[3].title) {
        console.log(`   team    ${code} rename "${teams[0].name}" -> "${weeks[3].title}"`);
      }
      for (const t of teams.slice(1)) {
        const cards = await q(sb.from("ripple_cards").select("id").eq("team_id", t.id).limit(1));
        const players = await q(sb.from("ripple_players").select("id").eq("team_id", t.id).limit(1));
        console.log(
          cards.length || players.length
            ? `   team    ${code} extra team "${t.name}" holds work; will be left alone`
            : `   team    ${code} drop empty extra team "${t.name}"`
        );
      }
    }
    console.log();
    jobs.push({ group: g, identity, updates, w4, strays, boardCodes });
  }

  for (const g of drop) {
    const exercises = await q(sb.from("design_group_exercises").select("sort, session_code, title").eq("group_id", g.id));
    console.log(`Delete group  "${g.name}" (sort ${g.sort}) and its ${exercises.length} week(s): ${exercises.map((e) => e.session_code ?? "-").join(", ")}\n`);
  }

  if (command === "plan") {
    console.log(problems ? `plan finished with ${problems} problem(s); nothing written.` : "plan only; nothing written.");
    return;
  }
  if (problems) {
    console.error("Refusing to apply while any problem above stands. Re-read it, or pass --force if the card counts are knowingly different.");
    process.exit(1);
  }

  for (const job of jobs) {
    // Registry columns only — session_code is never in this patch, so the board and its
    // cards stay with the row.
    for (const { id, week } of job.updates) {
      await q(
        sb
          .from("design_group_exercises")
          .update({
            sort: week.sort,
            title: week.title,
            type: week.type,
            sections: week.sections,
            locked: false,
            closed: false,
            opens_at: null,
            submitted_at: null,
            submitted_by: null,
          })
          .eq("id", id)
      );
    }

    // The strays go before week 4 is renumbered, so nothing collides on sort 3.
    for (const s of job.strays) {
      await q(sb.from("design_group_exercises").delete().eq("id", s.id));
      if (s.session_code) {
        await q(sb.from("ripple_canvas_cards").delete().eq("code", s.session_code));
        await q(sb.from("sessions").delete().eq("code", s.session_code)); // cascades teams/players/cards
      }
    }

    const week4 = canonicalWeeks()[3];
    await q(
      sb
        .from("design_group_exercises")
        .update({
          sort: week4.sort,
          title: week4.title,
          type: week4.type,
          sections: week4.sections,
          locked: false,
          closed: false,
          opens_at: null,
          submitted_at: null,
          submitted_by: null,
        })
        .eq("id", job.w4.id)
    );

    const code = job.w4.session_code;
    if (code) {
      await wipeBoard(code);
      const [session] = await q(sb.from("sessions").select("id, config").eq("code", code));
      if (session) {
        // The three keys buildSharedBoardConfig sets explicitly. scoringEnabled matters:
        // Week 4's matrix step needs it and resolveConfig's absent-key fallback is not
        // something to lean on. execSummary is a handoff draft someone wrote while testing.
        const config = { ...(session.config ?? {}), solo: false, sharedTeam: true, scoringEnabled: true };
        delete config.execSummary;
        await q(
          sb.from("sessions").update({ config, phase: "BUILD", status: "Open", title: week4.title }).eq("id", session.id)
        );
        // The wipe cleared players, not teams, but an earlier reset may have taken the team
        // with it — and a board with no team cannot accept a card.
        const teams = await q(
          sb.from("ripple_teams").select("id, name").eq("session_id", session.id).order("join_order")
        );
        if (!teams.length) {
          await q(
            sb.from("ripple_teams").insert({
              session_id: session.id,
              code,
              name: week4.title,
              color: job.group.color ?? undefined,
              join_order: 0,
            })
          );
        } else if (teams[0].name !== week4.title) {
          // provisionExerciseBoard names the team after the exercise, and on a shared board
          // that name is what members read above the cards — so it carries the ZZ TEST title
          // until it is changed here.
          await q(sb.from("ripple_teams").update({ name: week4.title }).eq("id", teams[0].id));
        }
      }
    }

    // Stray empty teams. A shared board runs on exactly one team — getRippleTeams(code)[0] —
    // and a second one is a leftover from someone clicking "add team" while testing. Only
    // ever deleted when it holds no cards and no players, so this can never lose work.
    for (const code of job.boardCodes) {
      const teams = await q(
        sb.from("ripple_teams").select("id, name, join_order").eq("code", code).order("join_order")
      );
      for (const t of teams.slice(1)) {
        const cards = await q(sb.from("ripple_cards").select("id").eq("team_id", t.id).limit(1));
        const players = await q(sb.from("ripple_players").select("id").eq("team_id", t.id).limit(1));
        if (cards.length || players.length) {
          console.log(`  ! ${code} team "${t.name}" (join_order ${t.join_order}) holds work; left alone`);
          continue;
        }
        await q(sb.from("ripple_teams").delete().eq("id", t.id));
        console.log(`  - ${code}: removed empty team "${t.name}"`);
      }
    }

    if (job.group.name !== job.identity.name || job.group.scenario_title !== job.identity.scenarioTitle) {
      await q(
        sb
          .from("design_groups")
          .update({ name: job.identity.name, scenario_title: job.identity.scenarioTitle })
          .eq("id", job.group.id)
      );
    }
    console.log(`+ Group ${job.group.n}: 4 weeks, ${job.strays.length} stray week(s) removed`);
  }

  for (const g of drop) {
    const exercises = await q(sb.from("design_group_exercises").select("session_code").eq("group_id", g.id));
    for (const e of exercises) {
      if (!e.session_code) continue;
      await q(sb.from("ripple_canvas_cards").delete().eq("code", e.session_code));
      await q(sb.from("sessions").delete().eq("code", e.session_code));
    }
    await q(sb.from("design_groups").delete().eq("id", g.id)); // exercises cascade
    console.log(`- removed group "${g.name}"`);
  }

  console.log("\n✓ program reset");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
