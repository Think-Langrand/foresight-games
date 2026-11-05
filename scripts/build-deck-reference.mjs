// Snapshot the project deck's REFERENCE MATERIAL from production: the scenarios the
// groups worked in, the drivers behind them, and every image, pulled into the repo so
// the deck renders the same thing everywhere.
//
//   FORESIGHT_API_URL=https://<prod-carmelita>/api/v1/foresight \
//   FORESIGHT_API_KEY="$PROD_FORESIGHT_KEY" \
//   TARGET_SUPABASE_URL=https://<prod-ref>.supabase.co \
//   TARGET_SUPABASE_SERVICE_ROLE_KEY="$PRODKEY" \
//     node scripts/build-deck-reference.mjs
//
// WHY A SNAPSHOT AND NOT A LIVE READ. Three reasons, and the third is the one that bites.
// (1) Scenarios and drivers are published reference material; they do not change while a
// workshop runs, and a deck is a point-in-time artefact. (2) The deck has three renderers
// — a live route, a standalone HTML file and a .pptx — and one file is the only way they
// cannot disagree. (3) Local Carmelita and local Supabase hold DIFFERENT, wrong content:
// without this, the deployed route would be right while a locally-run static build was
// quietly wrong, which is the kind of bug nobody finds until a committee is reading it.
//
// IMAGES ARE DOWNLOADED, NOT LINKED. Foresight image URLs are signed and short-TTL.
// lib/handoff.ts says it plainly: a copied URL is "a 403 waiting to happen". A snapshot
// that keeps them works on the day it is made and breaks later, in production, silently.
//
// DRY BY DEFAULT against the file it would replace: it refuses to write a snapshot that
// is thinner than the one already there unless you pass --force. A half-fetched snapshot
// overwriting a complete one is the failure mode this script exists to avoid.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const OUT = join(root, "data", "deck-reference.snapshot.json");
const IMG_DIR = join(root, "public", "deck", "img");
const IMG_PUBLIC = "/deck/img";

const argv = process.argv.slice(2);
const force = argv.includes("--force");
// IMAGES ARE OPT-IN. 64 JPEGs is ~33 MB, gitignored and reproducible, and only the STATIC
// renderers need them: a presigned URL is dead in an hour (X-Amz-Expires=3600), so a
// standalone HTML file or a .pptx must embed its own copies. The live route re-resolves
// from Carmelita on each request and wants the platform URL, not a local path.
const withImages = argv.includes("--images");
const projectRef = (argv[argv.indexOf("--ref") + 1] || "").startsWith("--")
  ? null
  : argv.includes("--ref")
    ? argv[argv.indexOf("--ref") + 1]
    : null;

// --- env -------------------------------------------------------------------------------
// Same loader shape as scripts/stamp-week4-prompts.mjs: inline vars win, .env files fill in.
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

const API_PATH = "/api/v1/foresight";
const rawBase = (process.env.FORESIGHT_API_URL ?? process.env.FORESIGHT_URL ?? "")
  .trim()
  .replace(/\/+$/, "");
const BASE = rawBase ? (rawBase.includes(API_PATH) ? rawBase : `${rawBase}${API_PATH}`) : null;
const KEY = process.env.FORESIGHT_API_KEY;
const REF = projectRef ?? process.env.FORESIGHT_PROJECT_REF ?? "nnphi";

const SB_URL = process.env.TARGET_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY =
  process.env.TARGET_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

function die(msg) {
  console.error(`\n${msg}\n`);
  process.exit(1);
}

if (!BASE || !KEY) {
  die(
    "Missing Carmelita config.\n" +
      "  FORESIGHT_API_URL=https://<prod-carmelita>/api/v1/foresight\n" +
      "  FORESIGHT_API_KEY=<prod key>"
  );
}
if (!SB_URL || !SB_KEY) {
  die(
    "Missing Supabase config.\n" +
      "  TARGET_SUPABASE_URL=https://<prod-ref>.supabase.co\n" +
      "  TARGET_SUPABASE_SERVICE_ROLE_KEY=<prod service role key>"
  );
}

// THE GUARD THAT ACTUALLY CATCHES PEOPLE. Both credential pairs fall back to .env.local,
// and .env.local points at DEV. So forgetting either inline var is silent: the script runs
// happily, fetches the wrong scenarios and the wrong drivers, and writes a snapshot that is
// valid, complete-looking and wrong. scripts/stamp-week4-prompts.mjs learned this the hard
// way; same lesson here, enforced rather than warned about.
const DEV_REF = "xpcmeskbqdapzmqcfnas";
const isLocalForesight = /localhost|127\.0\.0\.1/.test(BASE);
const isDevSupabase = SB_URL.includes(DEV_REF);

console.log(`\ncarmelita  ${BASE}`);
console.log(`supabase   ${SB_URL.replace(/^https:\/\//, "")}`);
console.log(`project    ${REF}\n`);

if ((isLocalForesight || isDevSupabase) && !argv.includes("--allow-local")) {
  die(
    "This is reference material for a production deck, and the target is not production.\n\n" +
      (isLocalForesight ? `  carmelita is LOCAL: ${BASE}\n` : "") +
      (isDevSupabase ? `  supabase is DEV:     ${SB_URL.replace(/^https:\/\//, "")}\n` : "") +
      "\nBoth pairs fall back to .env.local, which points at dev, so a missing inline var\n" +
      "looks exactly like success. Set them for this one command:\n\n" +
      "  FORESIGHT_API_URL=https://<prod-carmelita>/api/v1/foresight \\\n" +
      '  FORESIGHT_API_KEY="$PROD_FORESIGHT_KEY" \\\n' +
      "  TARGET_SUPABASE_URL=https://ratkqnumupciffxnsbhk.supabase.co \\\n" +
      '  TARGET_SUPABASE_SERVICE_ROLE_KEY="$PRODKEY" \\\n' +
      "    node scripts/build-deck-reference.mjs\n\n" +
      "The prod service role key is already in .env.local, commented out under the\n" +
      "ratkqnumupciffxnsbhk block. Lift it without pasting it:\n\n" +
      "  PRODKEY=$(sed -n 's/^# *SUPABASE_SERVICE_ROLE_KEY=//p' .env.local | head -1)\n\n" +
      "Pass --allow-local only to test the script's plumbing against dev."
  );
}

// --- carmelita -------------------------------------------------------------------------
async function api(path) {
  const res = await fetch(`${BASE}${path}`, { headers: { "X-Foresight-Key": KEY } });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (body?.detail) detail = body.detail;
    } catch {
      /* non-JSON body */
    }
    const err = new Error(`Foresight ${res.status} on ${path}: ${detail}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// WHICH SCENARIOS. The four the groups actually worked in, read from the exported group
// data rather than hardcoded, so this cannot drift from the boards. Falls back to every
// scenario on the project if no export is present.
function assignedRefs() {
  const dataDir = join(root, "data");
  const exports = readdirSync(dataDir).filter(
    (f) => f.startsWith("all-groups-") && f.endsWith(".json")
  );
  if (exports.length === 0) return null;
  const newest = exports.sort().at(-1);
  const payload = JSON.parse(readFileSync(join(dataDir, newest), "utf8"));
  const refs = (payload.groups ?? [])
    .map((g) => ({ ref: g.scenarioRef, group: g.groupName }))
    .filter((r) => r.ref);
  console.log(`refs from ${newest}: ${refs.map((r) => r.ref).join(", ")}\n`);
  return refs;
}

// --- images ----------------------------------------------------------------------------
// EVERYTHING BECOMES A JPEG, and that is not a detail. The platform serves these as
// PNGs: 1600x1066 photographic images at ~3 MB each, 152 MB across the four scenarios.
// That is too much to commit, too much to serve, and far too much for a standalone HTML
// file. Re-encoded at quality 82 the same 64 images come to 28 MB with no visible loss at
// slide size. `sips` is macOS built-in, so there is no dependency to install; if it is
// missing the original is kept rather than failing the run.
async function downloadImage(url, name) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`image ${res.status}`);
  const type = res.headers.get("content-type") || "";
  const ext =
    extname(new URL(url).pathname) ||
    (type.includes("png") ? ".png" : type.includes("webp") ? ".webp" : ".jpg");
  const raw = join(IMG_DIR, `${name}${ext}`);
  writeFileSync(raw, Buffer.from(await res.arrayBuffer()));

  if (ext.toLowerCase() === ".jpg" || ext.toLowerCase() === ".jpeg") {
    return `${IMG_PUBLIC}/${name}${ext}`;
  }
  const jpg = join(IMG_DIR, `${name}.jpg`);
  const out = spawnSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "82", raw, "--out", jpg], {
    stdio: "ignore",
  });
  if (out.status === 0 && existsSync(jpg)) {
    rmSync(raw, { force: true });
    return `${IMG_PUBLIC}/${name}.jpg`;
  }
  return `${IMG_PUBLIC}/${name}${ext}`;
}

// Rewrites in place and returns how many it pulled down. Scenario images live on
// `images[].url`; a driver card carries a single `imageUrl`. Both are signed.
// THE SIGNED URL IS ALWAYS KEPT, on `originalUrl`, whether or not a copy was taken. It is
// the only way back to the real asset, and a snapshot that threw it away could never be
// re-localised without re-fetching every scenario.
async function localiseImages(scenario) {
  let n = 0;
  const imgs = Array.isArray(scenario.images) ? scenario.images : [];
  for (const [i, img] of imgs.entries()) {
    if (!img?.url) continue;
    img.originalUrl = img.url;
    if (!withImages) continue;
    try {
      img.url = await downloadImage(img.url, `scenario-${scenario.id}-${i}`);
      n += 1;
    } catch (e) {
      console.log(`      ! image ${i} failed (${e.message}) — left as a signed URL`);
    }
  }
  return n;
}

// --- main ------------------------------------------------------------------------------
async function main() {
  mkdirSync(IMG_DIR, { recursive: true });

  const wanted = assignedRefs();

  const sets = await api(`/projects/${encodeURIComponent(REF)}/scenario-sets`);
  const cards = await api(`/projects/${encodeURIComponent(REF)}/scenarios`);
  console.log(`sets       ${sets.length}`);
  console.log(`scenarios  ${cards.length} on the project\n`);

  const refs = wanted ?? cards.map((c) => ({ ref: c.id, group: null }));

  const scenarios = [];
  const missing = [];
  let images = 0;

  for (const { ref, group } of refs) {
    const label = group ? `${ref}  (${group})` : ref;
    try {
      const full = await api(
        `/projects/${encodeURIComponent(REF)}/scenarios/${encodeURIComponent(ref)}`
      );
      const n = await localiseImages(full);
      images += n;
      scenarios.push({ ...full, assignedTo: group ?? null });
      console.log(`   ok  ${label}  "${full.title}"  ${n} image(s)`);
    } catch (e) {
      missing.push({ ref, group, status: e.status ?? null, message: e.message });
      console.log(`   !!  ${label}  ${e.message}`);
    }
  }

  // The sets the kept scenarios belong to, for the shared-uncertainties frame slide.
  const keptSetIds = new Set(scenarios.map((s) => s.setId).filter(Boolean));
  const setDetail = [];
  for (const id of keptSetIds) {
    try {
      setDetail.push(await api(`/projects/${encodeURIComponent(REF)}/scenario-sets/${id}`));
    } catch (e) {
      console.log(`   !!  set ${id}: ${e.message}`);
    }
  }

  // DRIVERS: CARMELITA IS THE SET, THE CURATED TABLE IS THE DRESSING.
  //
  // The platform's 20 are the drivers the deck prints — Tom's call, and they are the live
  // set that stays current. But they arrive thin: no `theme`, no `headline`/`body`, and
  // only 3 of 20 carry an image. The curated Supabase 14 have exactly those fields, and
  // most of the 20 are the same driver under an older name ("The Epistemic Crisis" became
  // "The Evidence Question", "The Power of One" became "The Amplified Individual").
  //
  // So: fetch both, and let each Carmelita driver inherit theme/headline/body from the
  // curated row whose name matches once case and punctuation are ignored. As names are
  // brought into line on the platform, more of them resolve on their own and the manual
  // list below shrinks to nothing. Unmatched drivers are REPORTED, never silently themed.
  // TWO CALLS PER DRIVER, AND THE SECOND IS THE IMPORTANT ONE. The list endpoint returns
  // summaries: it carries `shortDescription` (the bold lead line) but NOT `description`,
  // the body paragraph the cards actually show. Reading only the list makes every driver
  // look like it has no prose, which is wrong and would have shipped a deck of bare names.
  // Same list-vs-detail split as scenarios.
  let apiDrivers = [];
  try {
    const list = await api(`/projects/${encodeURIComponent(REF)}/drivers`);
    for (const d of list) {
      try {
        apiDrivers.push(
          await api(`/projects/${encodeURIComponent(REF)}/drivers/${encodeURIComponent(d.id)}`)
        );
      } catch (e) {
        console.log(`   !!  driver "${d.name}" detail: ${e.message} — keeping the summary`);
        apiDrivers.push(d);
      }
    }
  } catch (e) {
    console.log(`\n   !!  carmelita drivers: ${e.message}`);
  }

  // The curated 14: themed, with headline and body. Not printed directly any more, but it
  // is where the Carmelita cards get their theme and prose from.
  const sb = createClient(SB_URL, SB_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: curated, error } = await sb
    .from("drivers")
    .select("slug, number, name, theme, headline, body")
    .order("number", { ascending: true });
  if (error) die(`Supabase drivers read failed: ${error.message}`);

  // Known renames, for drivers the platform has not caught up on yet. Delete a line the
  // moment its Carmelita name matches the curated one; this list is a bridge, not a map.
  const RENAMED = {
    "the epistemic crisis": "The Evidence Question",
    "funding whiplash the austerity cliff": "Funding in Flux",
    "the workforce cliff": "The Workforce Remade",
    "the fragmenting public": "The Plural Public",
    "the power of one": "The Amplified Individual (Power of One)",
    "the chronic metabolic reckoning": "The Chronic, Metabolic & Longevity Reckoning",
    "the decentralization of care": "The Shadow Healthcare System",
  };
  // THEMES FOR THE DRIVERS THE CURATED SET NEVER HELD. The six themes come from the
  // curated 14; these seven are new on the platform, so there is no row to inherit from.
  // Sorted by what each driver argues, into the existing six — no new theme invented, so
  // the deck's grouping stays the one the drivers deck already uses. Reviewable: each is a
  // judgement about content, not a lookup, and Tom should overrule any that read wrong.
  const THEME_FALLBACK = {
    // Federal retreat splitting public health into 50 diverging state systems: governmental
    // decentralization, the same axis as care decentralising away from hospitals.
    "the patchwork paradox": "Decentralization & Consumerization",
    // A threat multiplier landing downstream as disease, in its own words a "cross-cutting
    // demand" on the field.
    "climate as a health modifier": "The Shifting Burden of Disease",
    // Pandemic-scale threats, AMR and engineered biology: what the field has to treat.
    "the age of spillover": "The Shifting Burden of Disease",
    // A consumer wellness economy eclipsing population prevention. Consumerization, exactly.
    "wellness over prevention": "Decentralization & Consumerization",
    // AI eroding the capacity to reason independently about health.
    "the outsourced mind": "The Data & AI Inflection",
    // Non-evidence-based claims gaining equal footing in policy: a legitimacy question.
    "the fringe ascendant": "Trust, Legitimacy & Information",
    // Deregulation stripping the protections the field relies on, and who backfills them.
    "the lowered shield": "The Institutional Base",
  };

  const norm = (x) => (x || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const curatedByName = new Map(curated.map((d) => [norm(d.name), d]));

  const drivers = apiDrivers.map((d) => {
    const direct = curatedByName.get(norm(d.name));
    const viaRename = direct ? null : curatedByName.get(norm(RENAMED[norm(d.name)]));
    const c = direct ?? viaRename ?? null;
    return {
      id: d.id,
      name: d.name,
      shortDescription: d.shortDescription ?? null,
      description: d.description ?? null,
      imageUrl: d.imageUrl ?? null,
      tags: d.tags ?? [],
      sources: d.sources ?? [],
      // THEME ONLY. Carmelita carries its own prose — `shortDescription` is the bold lead
      // line and `description` the body — so inheriting the curated headline/body as well
      // would put two different texts on one driver and leave the renderer to pick. The
      // curated table is consulted for the one field Carmelita has no equivalent of.
      theme: c?.theme ?? THEME_FALLBACK[norm(d.name)] ?? null,
      matchedCurated: c ? c.name : null,
      matchedBy: direct ? "name" : viaRename ? "rename" : null,
    };
  });

  const unthemed = drivers.filter((d) => !d.theme);
  const noLead = drivers.filter((d) => !d.shortDescription);
  const noBody = drivers.filter((d) => !d.description);
  const themes = [...new Set(drivers.map((d) => d.theme).filter(Boolean))];

  console.log(`\ndrivers    ${drivers.length} from carmelita (the set the deck prints)`);
  console.log(`           ${drivers.length - unthemed.length} matched a curated row for theme/body`);
  console.log(`themes     ${themes.length}: ${themes.join(" · ")}`);
  if (unthemed.length) {
    console.log(
      `\n   ${unthemed.length} driver(s) with no theme — they group under "Other" unless` +
        ` renamed to match a curated row, or given a theme:`
    );
    for (const d of unthemed) console.log(`      ${d.name}`);
  }
  if (noLead.length) {
    console.log(`\n   ${noLead.length} driver(s) with no lead line (shortDescription):`);
    for (const d of noLead) console.log(`      ${d.name}`);
  }
  if (noBody.length) {
    console.log(`\n   ${noBody.length} driver(s) with no body (description):`);
    for (const d of noBody) console.log(`      ${d.name}`);
  }
  console.log(
    withImages
      ? `images     ${images} downloaded to public${IMG_PUBLIC}`
      : `images     not downloaded (pass --images for a static build; signed URLs expire in 1h)`
  );

  const snapshot = {
    _about:
      "Deck reference material snapshotted from PRODUCTION Carmelita + Supabase by " +
      "scripts/build-deck-reference.mjs. Images are local copies; the signed originals expire.",
    capturedAt: new Date().toISOString(),
    // Static renderers MUST refuse to build when this is false: the image URLs in the
    // snapshot are presigned and dead an hour after capture.
    imagesLocalised: withImages,
    source: { carmelita: BASE, supabase: SB_URL, projectRef: REF },
    scenarioSets: setDetail,
    scenarios,
    missingScenarios: missing,
    drivers,
    curatedDrivers: curated,
  };

  // THE GUARD. A thinner snapshot replacing a complete one is the quiet failure: it is
  // valid JSON, the deck renders, and a scenario is simply gone.
  if (existsSync(OUT) && !force) {
    const prev = JSON.parse(readFileSync(OUT, "utf8"));
    const lost =
      (prev.scenarios?.length ?? 0) > scenarios.length ||
      (prev.drivers?.length ?? 0) > curated.length;
    if (lost) {
      die(
        `Refusing to overwrite a fuller snapshot.\n` +
          `  on disk: ${prev.scenarios?.length ?? 0} scenarios, ${prev.drivers?.length ?? 0} drivers\n` +
          `  fetched: ${scenarios.length} scenarios, ${curated.length} drivers\n\n` +
          `Check the credentials and the project ref. Pass --force if the shrink is deliberate.`
      );
    }
  }

  writeFileSync(OUT, JSON.stringify(snapshot, null, 2));
  console.log(`\nwrote      data/deck-reference.snapshot.json`);

  if (missing.length) {
    console.log(
      `\n${missing.length} scenario(s) could not be fetched:\n` +
        missing.map((m) => `   ${m.ref}${m.group ? `  (${m.group})` : ""} — ${m.message}`).join("\n") +
        `\n\nA 404 means the ref on the board does not exist on this platform. Fix the ref in\n` +
        `design_groups.scenario_ref rather than papering over it in the deck.`
    );
  }
  console.log("");
}

main().catch((err) => {
  console.error(`\n${err.message ?? err}\n`);
  process.exit(1);
});
