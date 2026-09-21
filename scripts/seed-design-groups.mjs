// Replay data/design-groups.seed.json onto a DEV database: design groups, their shared
// program of weeks, a shared board per board-backed week, and every answer card.
//
//   node scripts/seed-design-groups.mjs
//
// REPLACES the project's design groups: every existing group in the fixture's project is
// deleted along with its boards (sessions cascade to teams, players and cards), then the
// fixture's groups are rebuilt. The project row is created if missing. Refuses to run
// against prod. Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (.env.local).
//
// Boards are written the same way lib/design-group-exercises.provisionExerciseBoard does
// (a sharedTeam Ripples session in phase BUILD + one team), using the scenario snapshot
// stored in the fixture rather than fetching the scenario, so seeding works offline.

import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const FIXTURE = "data/design-groups.seed.json";
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
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}
loadEnv();

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Set them in .env.local.");
  process.exit(1);
}
if (URL.includes(PROD_REF)) {
  console.error("Refusing to seed design groups into PROD — this script replaces live data.");
  process.exit(1);
}
const sb = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

async function q(builder) {
  const { data, error } = await builder;
  if (error) throw error;
  return data;
}

// Same alphabet as lib/workshop.ts randomCode (no easily-confused chars).
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const randomCode = () =>
  Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join("");

async function createBoard({ projectId, title, prompt, config, color, phase }) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = randomCode();
    const { data: session, error } = await sb
      .from("sessions")
      .insert({
        code,
        title,
        scope: "Ripples",
        mode: "Divergent",
        prompt,
        status: "Open",
        project_id: projectId,
        phase,
        config,
      })
      .select("id, code")
      .single();
    if (error) {
      if (error.code === "23505") continue; // code taken — try another
      throw error;
    }
    const team = await q(
      sb
        .from("ripple_teams")
        .insert({ session_id: session.id, code, name: title || "Board", color: color || "#f5a524", join_order: 0 })
        .select("id")
        .single()
    );
    return { sessionId: session.id, code, teamId: team.id };
  }
  throw new Error("Could not allocate a unique session code.");
}

async function main() {
  const fixture = JSON.parse(readFileSync(join(root, FIXTURE), "utf8"));
  const { program } = fixture;

  // Project (create if this database doesn't have it yet).
  let [project] = await q(sb.from("projects").select("id").eq("slug", fixture.project.slug));
  if (!project) {
    project = await q(
      sb
        .from("projects")
        .insert({
          slug: fixture.project.slug,
          name: fixture.project.name,
          carmelita_project_ref: fixture.project.carmelitaProjectRef,
          home_config: fixture.project.homeConfig ?? {},
        })
        .select("id")
        .single()
    );
    console.log(`+ project ${fixture.project.slug}`);
  }

  // Wipe the project's existing design groups and their boards.
  const existing = await q(sb.from("design_groups").select("id, name").eq("project_id", project.id));
  if (existing.length) {
    const exercises = await q(
      sb.from("design_group_exercises").select("session_code").in("group_id", existing.map((g) => g.id))
    );
    const codes = exercises.map((e) => e.session_code).filter(Boolean);
    if (codes.length) await q(sb.from("sessions").delete().in("code", codes));
    await q(sb.from("design_groups").delete().eq("project_id", project.id)); // exercises cascade
    console.log(`- removed ${existing.length} group(s): ${existing.map((g) => g.name).join(", ")}`);
  }

  for (const g of fixture.groups) {
    const group = await q(
      sb
        .from("design_groups")
        .insert({
          project_id: project.id,
          name: g.name,
          sort: g.sort,
          color: g.color,
          scenario_ref: g.scenarioRef,
          scenario_set_id: g.scenarioSetId,
          scenario_title: g.scenarioTitle,
        })
        .select("id")
        .single()
    );

    const idMap = new Map(); // fixture card id → new card id
    let cardCount = 0;
    for (const [week, w] of program.entries()) {
      const board = w.board
        ? await createBoard({
            projectId: project.id,
            title: w.title,
            prompt: g.scenarioTitle || "",
            config: g.boardConfig,
            color: g.color,
            phase: w.locked ? "HARVEST" : "BUILD",
          })
        : null;
      await q(
        sb.from("design_group_exercises").insert({
          group_id: group.id,
          sort: week,
          title: w.title,
          type: w.type,
          session_code: board?.code ?? null,
          locked: w.locked,
          closed: w.closed,
          opens_at: w.opensAt,
          sections: w.sections,
        })
      );
      if (!board) continue;

      const cards = g.cards.filter((c) => c.week === week);
      if (cards.length === 0) continue;

      // One player per distinct author name on this board.
      const players = new Map();
      for (const name of new Set(cards.map((c) => c.author).filter(Boolean))) {
        const p = await q(
          sb
            .from("ripple_players")
            .insert({
              session_id: board.sessionId,
              code: board.code,
              team_id: board.teamId,
              participant_id: randomUUID(),
              display_name: name,
            })
            .select("id")
            .single()
        );
        players.set(name, p.id);
      }

      for (const c of cards) idMap.set(c.id, randomUUID());
      // Insert in waves so a card's parent always exists first: wave 0 is the
      // parentless cards, each later wave the children of everything already in.
      // Depth-agnostic, so the tree can be as deep as the fixture goes.
      const pending = [...cards];
      const inserted = new Set();
      while (pending.length) {
        const wave = pending.filter((c) => !c.parentId || inserted.has(c.parentId));
        if (!wave.length) {
          throw new Error(
            `Seed cards have an unresolvable parent chain (cycle or dangling parentId): ${pending
              .map((c) => c.id)
              .join(", ")}`
          );
        }
        const rows = wave
          .map((c) => ({
            id: idMap.get(c.id),
            session_id: board.sessionId,
            code: board.code,
            team_id: board.teamId,
            author_player_id: c.author ? players.get(c.author) : null,
            card_order: c.order,
            parent_card_id: c.parentId ? idMap.get(c.parentId) ?? null : null,
            section: c.section,
            text: c.text,
            sort: c.sort ?? 0,
            source_card_id: c.sourceCardId ? idMap.get(c.sourceCardId) ?? null : null,
            source_label: c.sourceLabel,
            created_at: c.createdAt,
          }));
        if (rows.length) await q(sb.from("ripple_cards").insert(rows));
        for (const c of wave) {
          inserted.add(c.id);
          pending.splice(pending.indexOf(c), 1);
        }
      }
      cardCount += cards.length;
    }
    console.log(`+ ${g.name}: ${program.length} weeks, ${cardCount} cards`);
  }
  console.log("✓ design groups seeded");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
