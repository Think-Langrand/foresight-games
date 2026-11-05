# Project-wide handoff deck

> **Status: plan, approved. The data layer is built; no deck exists yet.**
> The inputs named in "0 · The data" are in the repo and the script that produced them is
> `scripts/build-deck-reference.mjs`. Everything from "2 · `lib/project-deck.ts`" onward is
> still to write.

## Context

Four design groups have now run a four-session foresight program on the `public-health`
project. Each group already has its own 10-slide HTML handoff deck at
`/project/[title]/design-groups/[groupId]/summary`, built for one group reading its own work.

What does not exist is a deck for the **whole project**: one artifact a steering committee can
read front to back that opens with what the four groups found *together*, then carries each
group's work, then holds the source material (all scenarios, all drivers) as reference.

Tom's decisions, already made:

| Question | Answer |
|---|---|
| Where it lives | **Both** — a live route in the app *and* a standalone exported file |
| Audience | **Steering committee / client** — readers who know nothing about the sessions |
| Data source | **Production** |
| Scope | Aggregate + the four handoffs + **Sessions 1–3 per group** + scenarios + drivers |

It must also convert to PowerPoint later. That requirement shapes the architecture now, not
later: if the HTML is built with content baked into markup, the PPTX is a rewrite.

---

## The one decision that matters

**Build a data payload first, then render it three ways.** Content never lives in markup.

```
ProjectExport (JSON)  ──▶  buildProjectDeck()  ──▶  ProjectDeck (pure data)
                                                         │
                                 ┌───────────────────────┼───────────────────────┐
                                 ▼                       ▼                       ▼
                         live Next route          standalone .html          .pptx
                       (always current)         (portable snapshot)    (langrand.js)
```

`ProjectDeck` is the contract. All three renderers consume it and none of them derive content.

---

## What already exists — reuse, do not rebuild

| Need | Use | Notes |
|---|---|---|
| Walk every group × week, fully shaped | `buildProjectExport` — `lib/cohort-export.ts` | server-only. Exposed at `GET /api/admin/projects/[id]/export`. Already aligns weeks across groups via `getProgramActivity` (`lib/design-activity.ts:65`) |
| Fold one group's whole program | `buildGroupSummary(weeks, group)` — `lib/group-summary.ts:308` | **pure, not server-only, unit-tested.** Feed it `payload.groups[i].weeks.map(w => w.answers).filter(Boolean)` |
| Deck chrome / stepper | `HandoffDeck` — `components/design-groups/HandoffDeck.tsx` | content-agnostic already: `DeckSlide { id, label, node }` |
| Charts | `SummaryMatrix`, `ClusterMatrix`, `StakesBalance` | prop-driven, group-agnostic |
| Ranking | `rankValue`, `compareByRank` — `lib/ripples-scoring.ts:90,109` | pure |
| Week 4 selectors | `lib/commitments-shape.ts` | pure |
| Colour for cross-group marks | `lib/analysis/cohort-palette.ts` | pure. Brand accents fail contrast as data marks — this exists for that reason |
| Drivers | the 20 in `data/deck-reference.snapshot.json`, themed | render like `app/drivers/page.tsx:33-62` |
| Scenario narrative | `getScenario(ref)` — `lib/foresight/client.ts:161`; render with `ScenarioReader` | framework-neutral, renders in a static deck |
| Self-contained HTML emitter pattern | `docs/explorer/build.mjs` + `template.html` | the repo's existing precedent: inject JSON into a placeholder, write one file |
| PPTX in house style | `anthropic-skills:langrand-colead-deck` → `scripts/langrand.js` | pptxgenjs, same off-white/black/blue/lime, 20"×11.25" |

**Parked slides waiting for exactly this deck.** `components/design-groups/GroupSummary.tsx:53-60`
sets `SHOW_WORLD_READING = false` with the comment that it *"is going into a separate deck"*.
`GroupSummary.worldReading` is already shaped and populated — Session 1's read of the world,
"written in September and shown nowhere until now." Use it.

---

## Build

### 0 · The data — all of it is already in the repo

Nothing here is left for the building agent to fetch. Both inputs exist:

| File | What | Size |
|---|---|---|
| `data/all-groups-public-health-2026-10-30.json` | All 4 groups × 4 sessions, fully shaped | 1.5 MB |
| `data/deck-reference.snapshot.json` | The 4 scenarios, the 20 drivers, all themed | 304 KB |
| `public/deck/img/` | 64 scenario images, JPEG — **gitignored**, rebuilt with `--images` | 33 MB |

**Group work** came from `/admin/projects/public-health` → **"All groups · JSON"**
(`app/admin/projects/[slug]/page.tsx:177`). Re-press and replace the file to refresh.

**Reference material** came from `scripts/build-deck-reference.mjs`, run against production:

```bash
PRODKEY=$(sed -n 's/^# *SUPABASE_SERVICE_ROLE_KEY=//p' .env.local | head -1)
FORESIGHT_API_URL=https://carmelita-backend.onrender.com/api/v1/foresight \
TARGET_SUPABASE_URL=https://ratkqnumupciffxnsbhk.supabase.co \
TARGET_SUPABASE_SERVICE_ROLE_KEY="$PRODKEY" \
  node scripts/build-deck-reference.mjs --ref c867309a-e935-4f72-b3b5-f2997fabc43e
```

`FORESIGHT_API_KEY` is already correct in `.env.local` and is the same for local and production.
The `--ref` is mandatory: production identifies the project by UUID, and the code's
`DEFAULT_PROJECT_REF` of `"nnphi"` 404s.

**Why a snapshot rather than live reads.** Scenarios and drivers are published reference material
that does not change while a workshop runs, and a deck is a point-in-time artefact. One committed
file is also the only way the live route, the standalone HTML and the PPTX cannot disagree — and
it removes the trap where a deployed route reads prod while a locally-run static build quietly
reads dev. It solves the signed-image expiry at the same time.

The script guards both failure modes it is likely to hit: it **refuses to run against local
Carmelita or dev Supabase** (both credential pairs silently fall back to `.env.local`, which
points at dev), and it **refuses to overwrite a fuller snapshot with a thinner one** unless
passed `--force`.

Both data files contain participant writing and client reference material. Whether they are
committed or kept local is Tom's call; `public/deck/img/` is gitignored and rebuilt on demand.

### What the export actually contains — read this before designing chapter 2

Sessions 1–3 are complete for all four groups. **Session 4 is not**, and the deck must be built
around that rather than discovering it late:

| Group | Bold moves | Confirmed priorities | Outcomes | Response ideas |
|---|---|---|---|---|
| 1 · The Public Works | 3 | **3** | 8 | 47 |
| 2 · The Known and Unknown | 2 | 0 | 7 | 21 |
| 3 · The Living Floor | 1 | 0 | 3 | 10 |
| 4 · The Moving Public | 1 | 0 | 21 | 12 |

Three consequences:

1. **There are seven bold moves, not twelve.** Any slide or copy promising "all twelve" is wrong.
   The aggregate must handle a group with one.
2. **Only Group 1 confirmed its priorities — but every group still has a defensible three.**
   `prioritySlots` already fills unconfirmed slots from the ranking, so the three slots each
   group shows *are* its top three by `plausibility × impact`. Verified against every scored
   pick; no group has a tie at the cut line:

   | Group | The three | 4th | Clean cut? |
   |---|---|---|---|
   | 2 | 25, 25, 25 | 20 | yes |
   | 3 | 25, 25, 20 | 15 | yes |
   | 4 | 25, 20, 20 | 16 | yes |

   Use them as that group's three. **Do not recompute** — read `prioritySlots`, which is the one
   selector every surface goes through.

   What changes is the *wording*, and it matters to a committee. For Groups 2–4 these are the
   scores' top three, not a choice the room ratified: say "highest-ranked by the group's own
   scoring". For Group 1 say "chosen" — they confirmed.

   Group 1 is the instructive opposite: **four** of their picks scored 25, and confirmation is
   what broke the tie. *"Communities with less influence are at risk"* scored identically to all
   three of their priorities and did not make the cut. Worth a line in their chapter, and the
   reason `status` must be carried rather than flattened away.
3. **The cross-group strength is in Sessions 1–3**, where all four groups are complete and
   genuinely comparable. Chapter 2 should lead with risks, opportunities, themes, hopes and fears,
   and treat the Session 4 material as the thinner, uneven layer it is.

### 2 · `lib/project-deck.ts` — the new pure module

The only genuinely new logic. Mirror `lib/group-summary.ts`: pure, no I/O, unit-tested.

```ts
export function buildProjectDeck(input: {
  project: { slug: string; name: string };
  groups: { summary: GroupSummary; scenarioRef: string; scenarioTitle: string }[];
  scenarios: Scenario[];
  sets: ScenarioSet[];
  drivers: DriverLite[];
}): ProjectDeck
```

The aggregate section is what does not exist anywhere yet:

- **Every bold move there is** — seven, unevenly spread (3/2/1/1), from `GroupSummary.directions`.
  Note: `directions` is act 3.2's bold moves. `boldMoves` is the *parked* backcast concept
  (`MAX_BOLD_MOVES` vs `MAX_DIRECTIONS`, `lib/commitments-shape.ts:211-212`) — do not use it.
  Do not pad a group to three, and do not imply a group with one did less thinking: Group 3's
  single move sits on ten response ideas.
- **Top risks and opportunities across groups** — pool every `GroupSummary.placements`, rank by
  `rankValue` (plausibility × impact) with `compareByRank`, tag each with its group and `kind`.
  This is the strongest aggregate slide, because Sessions 1–3 are complete everywhere.
- **Every priority with its scores**, four groups side by side — **carrying `status`**. Only
  Group 1's are confirmed; the rest are score-ranked suggestions and must be labelled as such.
- **Convergence by hand, not by model.** Where the same concern appears in 2+ groups, say so.
  Do *not* wire in `runCohortAnalysis` for v1: it is a live OpenAI call, is never persisted, and
  its pool has no Session 4 source (`POOL_SOURCES` in `lib/analysis/cohort-pool-shape.ts:26` stops
  at hopes/fears). Adding one is a separate piece of work.

### 3 · Live route

`app/project/[title]/deck/page.tsx`, plus `app/h/[slug]/page.tsx` for the public reader —
mirroring how `summary/page.tsx` and `h/[slug]/[groupId]/page.tsx` already share one loader so
they cannot drift. Add `lib/project-handoff.ts` (server-only) as that shared loader.

Generalize three props on `HandoffDeck`: `groupName`/`projectSlug`/`groupId` become
`{ title, backHref }`. ~10 lines, and the per-group decks pass the same values.

**Chaptering is required, not optional.** With Sessions 1–3 per group this deck is ~90–110
slides. `HandoffDeck`'s footer renders one dot per slide
(`components/design-groups/HandoffDeck.tsx:116-130`) — 100 dots is unusable. Extend `DeckSlide`
with `chapter: string` and render chapter segments with a slide count, not a flat dot row.

Slide bodies: extract `Slide`, `Chip`, `WithFigure`, `Blocks`, `PriorityList`, `DirectionCard`,
`StakeColumn`, `StakeList`, `KeyChangeRow`, `ScoreChips` out of the 1000-line function body in
`GroupSummary.tsx:720-1692` into `components/design-groups/deck/`. Both decks then import them.
Per-group copy is second-person singular ("Your group weighed…") — the project deck needs
third-person ("Group 2 weighed…"), so these primitives must take their voice as a prop.

### 4 · Standalone HTML

`scripts/build-deck-html.mjs`, following `docs/explorer/build.mjs`: inject the payload into a
template placeholder, write one self-contained file.

It cannot serialize the React tree — `next/font`, `next/link`, Tailwind's build step and the
interactive `ImplicationsMap` all resist it. Render from `ProjectDeck` with its own small
template instead. Inline the compiled CSS, self-host the two Google fonts, and drop the map slide
(or replace it with a static image).

### 5 · PowerPoint

`scripts/build-deck-pptx.mjs` consuming the **same** `ProjectDeck`, using
`langrand.js`'s `cover`, `divider`, `content`, `card`, `cardRow`, `numberedList`, `table`,
`plate`, `closing`. The skill's own QA loop (`validate.py`, soffice → PDF → images, look at every
slide) applies.

One caveat for whoever does this: that skill is written for *facilitator guides* with a
SAY/ASK/WATCH FOR tag system. This is a findings deck. Use its layout primitives and palette;
ignore the tag vocabulary and `references/voice.md`'s second-person instruction voice.

---

## Deck outline

| Ch. | Section | Source |
|---|---|---|
| 1 | Opening — the program, the four scenarios, what came out of it | `ProjectDeck.overview` |
| 2 | **What the four groups found together** — every bold move there is (seven, spread 3/2/1/1); top risks and opportunities ranked across groups; priorities side by side; where groups converged | `ProjectDeck.aggregate` ← new |
| 3–6 | One chapter per group: scenario → Session 1 world reading → key changes & map → themes → risks/opportunities → hopes & fears → Session 4 handoff | `GroupSummary` per group, incl. parked `worldReading` |
| 7 | **The four scenarios in play** | Foresight API, `ScenarioReader` |
| 8 | All 20 drivers, by theme | `data/deck-reference.snapshot.json` |

Chapter 7 is the four scenarios the groups worked in — `the-public-works`, `known-here-2`,
`the-living-floor`, `the-moving-public`. Production holds exactly these four, in one set, so
there is nothing to filter out.

---

## What production actually holds — snapshot taken, warnings corrected

`data/deck-reference.snapshot.json` is **built** (2026-11-04), from
`https://carmelita-backend.onrender.com/api/v1/foresight` and prod Supabase, by
`scripts/build-deck-reference.mjs`. Several earlier warnings in this plan came from probing the
*local* Carmelita and were wrong about production. Corrected:

- ~~`the-living-floor` 404s~~ — **it exists on production**, titled "The Living Floor". All four
  refs resolved. Nothing to fix in `design_groups.scenario_ref`.
- ~~Two scenarios belong to no group~~ — production holds **exactly 4 scenarios in 1 set**, one
  per group. The 11-scenarios-across-4-sets picture was local-only. Chapter 7 is simply all four.
- ~~Two group scenario titles are stale~~ — prod titles **match** the DB snapshots exactly.
- ~~Two scenario vintages to handle~~ — all four prod scenarios are the `sections` vintage with
  **`body` empty**. The Markdown-body path is not needed for this deck.

What is true, and matters:

- **The project ref is a UUID, not `"nnphi"`.** Production Carmelita identifies the project as
  `c867309a-e935-4f72-b3b5-f2997fabc43e`, read from `projects.carmelita_project_ref` on prod
  Supabase. The code's `DEFAULT_PROJECT_REF` of `"nnphi"` 404s against production.
- **`sharedUncertainties` is empty** on the production set. The planned "why there are four
  worlds" frame slide has **no data behind it** — cut it, or write it by hand.
- **The scenarios are uneven.** Three carry 10–11 sections (`arrival`, `lived_moment`, `rules`,
  `regimes`, `dynamics`, `institutions`, `glossary`, `blind_spot`, `upside`,
  `strategic_implications`, some with `governing_settlement`). **The Living Floor has only two**
  (`rules`, `lived_moment`). Chapter 7 cannot assume a uniform scenario layout, and Group 3's
  scenario pages will be much thinner than the rest.
- **Drivers: Carmelita's 20 are the set, themed from the curated table.** The platform list is
  canonical. Two things the snapshot script handles that are easy to get wrong:
  - **Fetch each driver's DETAIL, not just the list.** The list endpoint omits `description`,
    the body paragraph the cards show; reading only the list makes every driver look like it
    has no prose. Same list-vs-detail split as scenarios.
  - **Themes come from the curated 14**, matched by name (with a documented rename bridge) and
    a `THEME_FALLBACK` map for the seven drivers the curated set never held. All 20 land in the
    original six themes; no seventh theme was invented. Both maps are in
    `scripts/build-deck-reference.mjs` and are meant to be edited.

- **Two drivers have no lead line**, `Funding Whiplash & the Austerity Cliff` and
  `The Outsourced Mind`. They have full bodies. **The renderer falls back to the body's first
  sentence**; the snapshot keeps `shortDescription: null` rather than fabricating one, so if a
  real lead line is written in Carmelita a re-run picks it up and the fallback stops firing.
  Do not "fix" this by writing text into the snapshot.

- **Images are opt-in and gitignored.** Presigned URLs carry `X-Amz-Expires=3600` — one hour.
  That splits cleanly by renderer: the **live route** re-resolves from Carmelita per request
  and wants the platform URL, so it needs no local copies; the **standalone HTML and the PPTX**
  embed their own and cannot work without them. So `scripts/build-deck-reference.mjs` downloads
  only with `--images`, writes `imagesLocalised` into the snapshot, and always keeps the signed
  URL on `originalUrl`. **A static build must refuse to run when `imagesLocalised` is false** —
  otherwise it ships a deck whose art dies within the hour.

- **Images are converted to JPEG, and must stay that way.** The platform serves 1600×1066
  photographic PNGs at ~3 MB each — 64 images, **152 MB**. Re-encoded at quality 82 they are
  **28 MB** with no visible loss at slide size. The script now does this automatically via
  `sips`. Do not "fix" it back to PNG.

## Verification

1. `npx tsc --noEmit` and `npm test` clean. Add `lib/project-deck.test.ts` beside
   `lib/group-summary.test.ts` — the aggregate maths (ranking, convergence counts, all seven moves
   present) is pure and should be covered there.
2. **Reconcile against a known group.** Chapter 4's slides must match Group 2's existing handoff
   deck at `/project/public-health/design-groups/<id>/summary`. Any difference is a bug in the new
   shaping, not an improvement.
3. Counts must agree with the CSV: `crossGroupCsvRows(payload)` row counts per group/week vs what
   the deck claims. Same numbers, two paths.
4. Drive the live route in a browser: every chapter reachable, no empty slide rendered as a
   finding, no horizontal scroll at phone width.
5. Open the standalone file **with the dev server stopped and offline**. Every image must render
   (proving they were inlined, not signed URLs) and no network request should be attempted.
6. For the PPTX: soffice → PDF → images, then look at every slide for overflow and wrapped titles.

---

## The implication map — two renderings of one slide

Settled: **interactive on the web, static images everywhere else.**

- **Live route:** keep `ImplicationsMap` exactly as it is today. It is the reason `HandoffDeck`
  keeps every slide mounted rather than unmounting
  (`components/design-groups/HandoffDeck.tsx:11-14`), so the map holds its branch pick and zoom
  while a reader steps away and back. Do not disturb that.
- **Standalone HTML, PDF and PPTX:** one map will not survive as a single legible image at slide
  size. Break each group's map into **several images, one per root branch** (the Session 2 roots
  are the group's key changes, so this is a real structural split, not an arbitrary crop), each
  on its own slide with the branch named.
- Produce them in a new `scripts/build-map-images.mjs` by driving the live route with Playwright:
  load the map slide, select each branch in turn, screenshot the map container. Write to
  `public/deck/img/map-<groupId>-<branch>.png` and record the list in `ProjectDeck` so the static
  renderers can lay them out. Playwright is already available in this environment.

## Deferred — clustering and LLM summaries

Out of v1 by decision, to be revisited once the deck exists and it is clear which slides want it.

Expect the aggregate slides (convergence, "what the four groups agree on", per-chapter openers)
to be the ones that want either clustering or a drafted summary, with Tom editing the result.
Two things to keep true so that door stays open:

- Keep every aggregate slide's **text a field on `ProjectDeck`**, not a string in a component. A
  drafted or hand-edited summary then drops in as data, and the renderers never change.
- When clustering does come, the machinery is mostly there: the cohort stack already pools,
  clusters, dedupes and derives group provenance. The one missing piece is a Session 4 pool
  source — `POOL_SOURCES` (`lib/analysis/cohort-pool-shape.ts:26`) stops at hopes/fears and has
  no `directions`/`priorities`. Adding one plus a branch in `itemsFromBoard` is the whole job;
  nothing downstream changes, because it all consumes `CohortItem`.

## Open items

- **Two retired drivers are in the set.** `The Patchwork Paradox` and `Climate as a Health
  Modifier` are present because Carmelita lists them, but `data/drivers.seed.json`'s changeLog
  retired both — the second as "a baseline condition, not an uncertainty". If that is the
  platform being out of date rather than a deliberate re-addition, they should come out there.
- **Two drivers want a lead line** written in Carmelita; until then the renderer falls back to
  the body's first sentence.
