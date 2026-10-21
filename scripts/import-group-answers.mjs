// Replay a design group's answer export onto one week's board.
//
//   node scripts/import-group-answers.mjs plan   [opts]
//   node scripts/import-group-answers.mjs import [opts] [--prod]
//
// WHY THIS EXISTS. Dev's boards drift from prod: the groups run a session on prod, and dev
// still holds whatever it was last seeded with plus whatever we typed into it while testing.
// `db:dump:groups` + `db:seed:groups` can only move a whole project and REPLACES the groups,
// which throws away the program and the boards. This takes the admin viewer's own per-group
// "Export JSON" files and replays ONE WEEK of them onto the matching boards in place, so dev
// carries the real work without rebuilding anything around it.
//
// REPLACES THAT WEEK, KEEPS EVERYTHING ELSE. For each group it deletes the target board's
// cards, its canvas positions and its players, then inserts the file's cards. The group row,
// the program, the session codes and every other week are untouched. Re-running is therefore
// idempotent in effect: the board ends up as the file describes it either way.
//
// WHICH WEEK. `--week` is the exercise `sort` (0-based), default 2 — Session 3 synthesis, the
// week that actually drifts. Weeks 0 and 1 in dev already match the exports card for card, so
// the default leaves them alone. Week 0 cannot be imported by this script at all: a worksheet
// export carries only shaped answers (`questions[].answers`), which have no player id, so a
// re-import would silently drop every week-1 author. Use --week 1 or 2.
//
// HOW CARD IDS RESOLVE. Export ids are prod ids, and `parent_card_id` inside the imported week
// is self-consistent, so parents are written from the file directly. `source_card_id` points
// OUT of the week, at the previous week's cards, and that is where environments diverge:
// groups 2, 3 and 4 kept their prod ids in dev, Group 1's were re-minted by an earlier seed.
// So each source is resolved id-first and, failing that, by matching (text, card_order) against
// the previous week's board — which is sound here because the two sides are the identical
// multiset of 152/77/53/70 cards. Duplicate texts are paired off one-for-one in board order, so
// the unique(code, source_card_id) index from migration 0018 still holds. A source that
// resolves to nothing is reported and written as null rather than failing the import.
//
// CREDENTIALS. TARGET_SUPABASE_URL + TARGET_SUPABASE_SERVICE_ROLE_KEY when set, else
// NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (.env / .env.local). Writing to the prod
// ref additionally requires --prod, so a shell pointed at prod cannot write by accident.

import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join, isAbsolute, resolve } from "node:path";
import { homedir } from "node:os";
import { createClient } from "@supabase/supabase-js";

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
      if (process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}
loadEnv();

const argv = process.argv.slice(2);
const command = argv[0] ?? "";
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, fallback) => {
  const joined = argv.find((a) => a.startsWith(`--${name}=`));
  if (joined) return joined.slice(name.length + 3);
  const i = argv.indexOf(`--${name}`);
  return i > -1 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};

if (!["plan", "import"].includes(command)) {
  console.error("Usage: import-group-answers.mjs plan|import [--dir <path>] [--file <path>] [--week 2] [--project public-health] [--prod]");
  process.exit(1);
}

const WEEK = Number(opt("week", "2"));
if (!Number.isInteger(WEEK) || WEEK < 1 || WEEK > 3) {
  console.error(`--week must be 1, 2 or 3. Week 0 is refused: a worksheet export has no player ids, so importing it would drop every author.`);
  process.exit(1);
}
const PROJECT = opt("project", "public-health");

const URL = process.env.TARGET_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.TARGET_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error("Missing Supabase URL / service role key. Set them in .env.local.");
  process.exit(1);
}
const isProd = URL.includes(PROD_REF);
if (isProd && !flag("prod")) {
  console.error("Target is PROD. Re-run with --prod if that is really what you want.");
  process.exit(1);
}
if (isProd && command === "import") {
  console.error("Refusing to import into PROD: this replaces a week of live participant work.");
  process.exit(1);
}
const sb = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

async function q(builder) {
  const { data, error } = await builder;
  if (error) throw error;
  return data;
}

function expand(p) {
  return isAbsolute(p) ? p : p.startsWith("~") ? join(homedir(), p.slice(1)) : resolve(root, p);
}

function loadFiles() {
  const explicit = argv.reduce((acc, a, i) => {
    if (a === "--file" && argv[i + 1]) acc.push(argv[i + 1]);
    if (a.startsWith("--file=")) acc.push(a.slice(7));
    return acc;
  }, []);
  if (explicit.length) return explicit.map(expand);
  const dir = expand(opt("dir", "~/Downloads"));
  const names = readdirSync(dir)
    .filter((n) => /^answers-group-.*\.json$/.test(n))
    .sort();
  if (!names.length) throw new Error(`No answers-group-*.json in ${dir}. Pass --file or --dir.`);

  // A download folder accumulates every export ever taken, and an older one carries an
  // older shape (Session 3 as a worksheet). Keep only the newest file per group: the dates
  // in these names are ISO, so the lexicographic max is the chronological one. Everything
  // dropped is printed, because silently picking a file is how you import last month's work.
  const newest = new Map();
  for (const n of names) {
    // From the FILENAME, which spells it "answers-group-3-..." — groupKey() reads the
    // group's display name ("Group 3 | ...") and will not match a hyphen.
    const k = n.match(/^answers-group-(\d+)/)?.[1] ?? n;
    const prior = newest.get(k);
    if (!prior || n > prior) newest.set(k, n);
  }
  const chosen = new Set(newest.values());
  const skipped = names.filter((n) => !chosen.has(n));
  if (skipped.length) {
    console.log(`Ignoring ${skipped.length} older export(s) in ${dir}:`);
    for (const s of skipped) console.log(`   - ${s}`);
    console.log();
  }
  return [...newest.values()].sort().map((n) => join(dir, n));
}

// "Group 2 | The Known and Unknown" -> "group 2". Dev and prod disagree on the rest of the
// name ("Group 3 | Living Floor" vs "Group 3 | The Living Floor"), so only the number counts.
const groupKey = (name) => {
  const m = String(name).match(/group\s*(\d+)/i);
  return m ? `group ${m[1]}` : String(name).trim().toLowerCase();
};

const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

async function main() {
  const files = loadFiles();
  console.log(`target   ${URL.replace(/^https:\/\//, "")}${isProd ? "  [PROD]" : ""}`);
  console.log(`project  ${PROJECT}`);
  console.log(`week     ${WEEK}`);
  console.log(`files    ${files.length}\n`);

  const [project] = await q(sb.from("projects").select("id").eq("slug", PROJECT));
  if (!project) throw new Error(`No project with slug ${PROJECT}.`);

  const groups = await q(sb.from("design_groups").select("id, name, sort").eq("project_id", project.id));
  const byKey = new Map(groups.map((g) => [groupKey(g.name), g]));

  const jobs = [];
  let problems = 0;

  for (const file of files) {
    const exp = JSON.parse(readFileSync(file, "utf8"));
    const group = byKey.get(groupKey(exp.groupName));
    if (!group) {
      console.error(`! ${exp.groupName}: no matching group in ${PROJECT}`);
      problems++;
      continue;
    }

    const exercises = await q(
      sb.from("design_group_exercises").select("id, sort, type, session_code").eq("group_id", group.id)
    );
    const target = exercises.find((e) => e.sort === WEEK);
    const prev = exercises.find((e) => e.sort === WEEK - 1);
    if (!target?.session_code) {
      console.error(`! ${exp.groupName}: week ${WEEK} has no board on this database`);
      problems++;
      continue;
    }

    const srcEx = exp.exercises?.[WEEK];
    const cards = srcEx?.cards ?? [];
    if (!cards.length) {
      console.error(`! ${exp.groupName}: file has no cards at week ${WEEK} (kind=${srcEx?.kind})`);
      problems++;
      continue;
    }

    // Previous week's board, for source_card_id. Index by id and by (text, order).
    const prevRows = prev?.session_code
      ? await q(
          sb
            .from("ripple_cards")
            .select("id, text, card_order, sort, created_at")
            .eq("code", prev.session_code)
            .order("created_at", { ascending: true })
            .limit(5000)
        )
      : [];
    const prevById = new Set(prevRows.map((r) => r.id));
    const prevByText = new Map();
    for (const r of prevRows) {
      const k = `${norm(r.text)} ${r.card_order}`;
      if (!prevByText.has(k)) prevByText.set(k, []);
      prevByText.get(k).push(r.id);
    }
    const prevExpCards = exp.exercises?.[WEEK - 1]?.cards ?? [];
    const expPrevById = new Map(prevExpCards.map((c) => [c.id, c]));

    // Resolve a source: by id when the previous board kept it, else pair off by (text, order).
    const consumed = new Map();
    const resolveSource = (sid) => {
      if (!sid) return { id: null, how: "none" };
      if (prevById.has(sid)) return { id: sid, how: "id" };
      const pc = expPrevById.get(sid);
      if (!pc) return { id: null, how: "missing-in-file" };
      const k = `${norm(pc.text)} ${pc.order}`;
      const pool = prevByText.get(k) ?? [];
      const used = consumed.get(k) ?? 0;
      if (used >= pool.length) return { id: null, how: "no-match" };
      consumed.set(k, used + 1);
      return { id: pool[used], how: "text" };
    };

    const existing = await q(
      sb.from("ripple_cards").select("id").eq("code", target.session_code).limit(5000)
    );

    const how = { id: 0, text: 0, "missing-in-file": 0, "no-match": 0, none: 0 };
    const rows = [];
    for (const [i, c] of cards.entries()) {
      const src = resolveSource(c.sourceCardId);
      how[src.how]++;
      rows.push({
        id: c.id,
        code: target.session_code,
        card_order: c.order,
        parent_card_id: c.parentId ?? null,
        text: c.text ?? "",
        lens_id: c.lensId ?? null,
        flagged: !!c.flagged,
        greyed: !!c.greyed,
        section: c.section ?? null,
        sort: typeof c.sort === "number" ? c.sort : i,
        source_card_id: src.id,
        source_label: c.sourceLabel ?? null,
        plausibility: c.plausibility ?? null,
        impact: c.impact ?? null,
        card_kind: c.cardKind ?? null,
        parked: !!c.parked,
        description: c.description ?? null,
        shortlisted: !!c.shortlisted,
        twin_key: c.twinKey ?? null,
        created_at: c.createdTime ?? c.createdAt ?? null,
        _author: c.authorPlayerId ?? null,
      });
    }

    const kinds = {};
    for (const r of rows) kinds[r.card_kind ?? "-"] = (kinds[r.card_kind ?? "-"] ?? 0) + 1;
    const authors = new Set(rows.map((r) => r._author).filter(Boolean));

    console.log(`${exp.groupName}  ->  ${group.name}`);
    console.log(`   board   ${target.session_code} (${target.type}), prev week ${prev?.session_code ?? "-"} with ${prevRows.length} cards`);
    console.log(`   cards   ${existing.length} on the board now  ->  ${rows.length} from the file`);
    console.log(`   kinds   ${JSON.stringify(kinds)}`);
    console.log(`   authors ${authors.size} distinct`);
    console.log(`   sources id=${how.id} text=${how.text} none=${how.none} unresolved=${how["missing-in-file"] + how["no-match"]}`);
    if (how["missing-in-file"] + how["no-match"] > 0) {
      console.log(`   !       ${how["missing-in-file"] + how["no-match"]} source links will be written as null`);
    }
    console.log();

    jobs.push({ group, target, rows, authors });
  }

  if (command === "plan") {
    console.log(problems ? `plan finished with ${problems} problem(s); nothing written.` : "plan only; nothing written.");
    return;
  }
  if (problems) {
    console.error("Refusing to import while any group has a problem above.");
    process.exit(1);
  }

  for (const job of jobs) {
    const code = job.target.session_code;
    const [session] = await q(sb.from("sessions").select("id").eq("code", code));
    if (!session) throw new Error(`No session for code ${code}`);

    // Canvas card positions are keyed on card identity and are NOT a foreign key
    // (migration 0028), so they do not cascade and have to go explicitly. Regions do
    // cascade off the theme card.
    await q(sb.from("ripple_canvas_cards").delete().eq("code", code));
    await q(sb.from("ripple_cards").delete().eq("code", code));
    await q(sb.from("ripple_players").delete().eq("code", code));

    const [team] = await q(sb.from("ripple_teams").select("id").eq("session_id", session.id).order("join_order"));
    if (!team) throw new Error(`No team on board ${code}`);

    const players = new Map();
    for (const a of job.authors) {
      const p = await q(
        sb
          .from("ripple_players")
          .insert({
            session_id: session.id,
            code,
            team_id: team.id,
            participant_id: randomUUID(),
            display_name: "You",
          })
          .select("id")
          .single()
      );
      players.set(a, p.id);
    }

    // Waves, so a card's parent is always already in. Depth-agnostic.
    const pending = [...job.rows];
    const inserted = new Set();
    let written = 0;
    while (pending.length) {
      const wave = pending.filter((r) => !r.parent_card_id || inserted.has(r.parent_card_id));
      if (!wave.length) {
        throw new Error(`Unresolvable parent chain on ${code}: ${pending.map((r) => r.id).join(", ")}`);
      }
      const payload = wave.map(({ _author, ...r }) => ({
        ...r,
        session_id: session.id,
        team_id: team.id,
        author_player_id: _author ? players.get(_author) ?? null : null,
      }));
      await q(sb.from("ripple_cards").insert(payload));
      for (const r of wave) {
        inserted.add(r.id);
        pending.splice(pending.indexOf(r), 1);
      }
      written += wave.length;
    }
    console.log(`+ ${job.group.name}: ${written} cards onto ${code}, ${players.size} players`);
  }
  console.log("\n✓ imported");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
