# Cross-group board — design

**Date:** 2026-11-09
**Status:** awaiting Tom's approval; not yet planned, nothing built

## Intent

One admin page that shows **one field at a time across every design group in a project**, so a
facilitator can read what all four groups said about the same thing without opening four tabs.

### Why now

The only cross-group surface today is
`/admin/projects/[slug]/design-groups/[groupId]/answers`, which shows **one group** with a tab per
week. Comparing four groups on "what are their bold moves" means four page loads and holding the
answers in your head. The group switcher in `AdminGroupAnswers` exists precisely because people
keep wanting to do this, and it only makes the four-tab dance faster.

Tom's framing, in his words: *"I want to be able to just see all of their top risks, their bold
moves, their aspirations, etc on one page together."* The job is **reading**, not analysis. He is
preparing to say something about the four groups and needs the raw answers next to each other.

## Goals

- One page, four (or N) groups as columns, **one field at a time** selected from a chip row.
- Every field a group actually answered is reachable, including the Session 1 worksheet questions.
- The **uncertainty grid**: the one view where all columns line up row-for-row.
- **CSV export** for the field on screen, and for every field at once.
- Reached by a link from the admin project dashboard.
- Works for any project: three groups or six, a different program, a half-finished week.

## Non-goals

- **No editing.** Read-only, like the existing answers viewer and export route.
- **No analysis, clustering, scoring or AI synthesis.** `/admin/projects/[slug]/cohort-analysis`
  already owns that. This page shows what the groups wrote, verbatim.
- **No Week 4 timeline / lanes.** Confirmed with Tom: the groups never ran that step. Do not build
  a milestone view and do not "fix" `lanes` as part of this work.
- **Not member-facing.** Groups must not see each other's boards through this.
- No new tables, columns or migrations. Every byte this page renders already exists.

## Anti-goals — what would make this a failure even if it ships

1. **Silently dropping answers.** This repo has a hard-won culture about this: see the orphan
   contract in `lib/commitments-shape.ts` and the comment in `lib/group-answers.ts` about a
   missing `render` case leaving a board "full of work" reported as empty. A field that renders
   zero cards must be because the group wrote nothing, never because the shaper did not look. If a
   field cannot be resolved for a group, say so on screen in that cell.
2. **Looking finished while a field is missing.** A chip whose count is 0 for every group is a
   signal worth seeing, not a chip to hide. Show the zeros. *This is about chips, and does not
   conflict with the uncertainty grid dropping rows nobody resolved — a chip is a thing the
   program asked the groups to do, so its emptiness is information; an unresolved uncertainty row
   is just a row with nothing in it.*
3. **Only working for Public Health.** Nothing may hardcode four groups, this program's week
   order, or these section keys.
4. **Going blank when the foresight platform is down.** The uncertainty grid degrades; the rest of
   the page does not care.

## Decisions already made

These were settled with Tom against mockups built from the real Oct 30 Public Health export. They
are decisions, not suggestions.

### Layout

Chip row across the top picks **one field**. Below it, the groups as equal-width columns filling
the screen, in the project's group order (Group 1 always leftmost), each headed by the group's
name and its own colour, with a per-group count. Answers are cards in the group's colour.

Tom chose this over a "field-first" variant where every field is a horizontal band on one long
scroll. He wants the screen to be about one question.

### Risks and opportunities are flat, with a theme tag

In the data, each risk and opportunity hangs off one of that group's **themes**, and the themes
differ per group. Tom chose a **flat list per group with a small theme tag on each card** over
nesting under theme headings. The tag is for tracing, not structure. There is no "group by theme"
toggle — he picked one option, not both.

The same tagging applies anywhere a card has a meaningful parent: outcomes tag their priority,
responses tag their outcome, implications tag their theme.

### The chip row

Primary chips, in this order:

1. **Uncertainties** *(my call to lead with it — Tom called it "almost the biggest one", so it
   goes first; move it if he disagrees on sight)*
2. Our vision
3. Bold moves
4. The three priorities
5. Risks
6. Opportunities
7. Outcomes
8. Responses
9. Themes
10. Hopes & fears

Behind a "more" overflow: Implications — Session 3's clustered copies (146 cards for Group 1
alone), **Session 2's own implication map** (see below), Our 6 key changes, First reactions, and
the dozen other Session 1 worksheet questions.

Tom reviewed this list and added Uncertainties; he raised no objection to the rest.

### Session 2's implication map gets its own chip

Tom's call. Session 3's themes contain *clustered copies* of implications, so without this chip
anything a group wrote in Session 2 and never clustered is unreachable from this page — and the
groups wrote 152 / 77 / 53 / 70 cards there. The `implications` render kind therefore belongs in
the field table:

| Chip | Week kind | Source in the shaped answers | Tag |
|---|---|---|---|
| Session 2 · implication map | implications | `cards` — the whole tree | parent card's text |
| Session 2 · brainstorm | implications | `brainstorm` — the freeform pad | no |
| Session 2 · sandbox | implications | `questions` (the sandbox section) | no |

Render the tree **flat, in tree-walk order, each card tagged with its parent's text** — the same
flat-plus-tag decision as risks and opportunities, applied to a deeper structure. Do not nest, and
do not draw a wheel; the wheel already exists on the group's own page and this page is for reading
across groups. This is the densest chip on the board, which is why it sits in the overflow rather
than the primary row.

Material still not reachable through any chip — `parked`, `orphans`, `stranded`, `strayOutcomes`,
`looseResponses`, and the legacy theme-level hope/fear `chain` — gets the anti-goal-1 treatment: a
small on-screen note, per group, saying that cards exist there and where to see them. Not a chip,
never a silent omission.

### Where each field comes from

Read through the existing `shapeExerciseAnswers` (`lib/group-answers.ts`) — do **not** re-read
boards or re-derive shapes. `includeRemoved: true`, as the admin viewer does.

| Chip | Week kind | Source in the shaped answers | Theme/parent tag |
|---|---|---|---|
| Uncertainties | — (scenario, not a week) | `Scenario.linkedUncertainties` for the group's `scenarioRef` | n/a — own grid |
| Our vision | commitments | `questions` where label is "Our vision" → `answers` | no |
| Bold moves | commitments | **`directions[].move`**, with `directions[].fields[]` on expand | no |
| The three priorities | commitments | `prioritySlots[].pick`, showing `status` | no |
| Risks | synthesis | `themes[].risks[]` | theme text |
| Opportunities | synthesis | `themes[].opportunities[]` | theme text |
| Outcomes | commitments | `prioritySlots[].outcomes[].outcome` | priority pick text |
| Responses | commitments | `responses[]` | parent outcome, via `prioritySlots[].outcomes[].responses` |
| Themes | synthesis | `themes[].text` | no |
| Hopes & fears | synthesis | `hopesFears[]`, carrying hope/fear | no |
| Implications | synthesis | `themes[].implications[]` | theme text |
| Worksheet questions | worksheet | `questions[].answers` by section key | no |

**Bold moves come from `directions`, not from `boldMoves`.** This matters and cost us a wrong
answer during design. `boldMoves` is derived as `looseResponses.filter(shortlisted)`
(`lib/commitments-shape.ts:426`), a legacy-only path: these boards have zero loose responses, so
that field is structurally always empty. The moves the groups actually wrote — 3 / 2 / 1 / 1
across the four Public Health groups — are the tree-root cards collected as `directions`. A
builder who trusts the obvious field name will ship an empty column and it will look like the
groups did no work.

### Field identity travels by week index, not exercise id

Exercise ids differ per group — each group owns its own rows — so a chip cannot be addressed by
exercise id. Address a field by **(week index, section/field key)**, the same reason
`AdminGroupAnswers` deep-links with `?week=<n>` instead of `?exercise=<id>`. Build the chip
registry from the **union** of the groups' weeks so a divergent program (the export carries a
`programDivergent` flag) still produces one chip row, with the groups that lack a week rendering
an explicit "no such week for this group" rather than an empty column.

### The uncertainty grid

Each group has exactly one scenario, and a scenario resolves the project's uncertainties, so this
maps 1:1 onto the columns. Render it as a real grid — one row per uncertainty (`title` plus the
`question` as a subline), one column per group, cell = `resolution`. Rows where two or more groups
share a resolution get a left-edge marker, because that agreement is the thing worth seeing.
Unresolved cells read "not resolved" and are never blank.

**Rows are the uncertainties at least one scenario actually resolved — roughly 9 of the 13, not
all 13.** Tom's call, revised 2026-11-09 after seeing the live data: he first asked for the full
catalogue, then, shown that four rows carry no position from any group and a fifth of the cells are
empty strings, said *"lets leave out the unresolved pieces. i just want them so i can look at all
of this stuff, and export it piece by piece."* The grid is a **reading surface, not a completeness
audit** — dead rows are noise.

Build the row set as: the catalogue from `/projects/{ref}/uncertainties` (`PublicUncertainty`,
ordered by `number`, keyed off `Project.carmelitaProjectRef`), **filtered to rows where at least
one scenario has a non-empty `resolution`.** Order and the `question` subline still come from the
catalogue, so rows read in the project's own sequence.

**An empty-string `resolution` counts as unresolved.** `resolution: ""` is a real state in live
data — The Living Floor currently has five uncertainties linked that way — and it is indistinguishable
from unresolved for this page's purposes. So two cell states, not three: resolved, or "not
resolved". A row exists because *someone* resolved it, so the groups that did not still need a
cell that says so; cells are never blank.

The title join stays load-bearing: a resolution whose title matches no catalogue row must **not**
be dropped. Append it as an extra row at the bottom, marked unmatched. A resolution the groups
published that this page silently swallows is anti-goal 1. (Verified 2026-11-09: zero unmatched in
live data today.)

**Source: live from the Carmelita platform**, through the existing `lib/foresight/client.ts`,
tolerating the platform being down the way `app/admin/projects/[slug]/page.tsx` already does with
`getScenarios`. *(My call.)* Live wins because a board page should show what the platform says
today, not what it said at capture time — not, as an earlier draft of this document claimed,
because the cached numbers are stale. **That claim was wrong and is worth knowing:**
`data/deck-reference.snapshot.json` was captured 2026-11-05 from prod Carmelita with
`missingScenarios: []`, and its resolution counts are 6 / 5 / 0 / 5 — with The Living Floor, the
**most recently updated** of the four scenarios (`updatedAt` 2026-10-23), carrying genuinely zero
resolutions. Going live will render that column empty too.

Tom initially wanted The Living Floor's resolutions published on Carmelita before this shipped,
then dropped that: the page ships against whatever the platform has. It must still handle the
empty case well, because that is the live state today and can recur for any scenario — a group
with no usable resolutions gets one column-level "no resolutions published for this scenario"
rather than the same "not resolved" repeated down every row. See "Live platform state" below.

When the platform is unreachable, the grid says so; the other chips are unaffected.

**Join key — title matching, deliberately.** `Scenario.linkedUncertainties[].uncertaintyId` is a
UUID; `PublicUncertainty.id` is the code/slug (`shape-of-the-public`) and carries no UUID field.
The only key the two payloads share is the human `title`, and marking the chosen option needs a
second string match of `resolution` against `PublicOutcome.title`. Both match in today's data.
*(My call:* match on title, and when a match fails say so in the cell per anti-goal 1, rather than
blocking this page on a Carmelita API change to return the code. A platform-side fix is the right
long-term answer and is **out of scope here** — do not sequence this work behind it.*)*

Tom also asked for the **unchosen outcome options** to be visible, not just the chosen resolution.
Each uncertainty carries its full option set (`PublicOutcome`: `code`, `role` of
Core/Edge/Wildcard, `title`, `description`) from `/projects/{ref}/uncertainties`, mirrored in
`data/uncertainties.seed.json`. A cell shows the chosen resolution; expanding a row shows all
options for that uncertainty with the chosen one per group marked. *(The chosen-resolution-only
cell with options on expand is my call — Tom asked for the options, not for a specific place to
put them, and four groups × four options inline would not fit.)*

### Exports

Tom: *"give me exports for all of these."* Two buttons:

- **This field** — the field on screen, every group, as CSV.
- **All fields** — every chip in one CSV.

Reuse `CROSS_GROUP_CSV_HEADER` from `lib/group-answers-csv.ts` (`Group, Week, Section, Kind,
Content, Author, Created`) so these sheets are shaped like the existing cross-group export rather
than inventing a second convention. Add the parent/theme tag as a column.

**"All fields" must go through `crossGroupCsvRows` / `exerciseCsvRows`, not a parallel row
builder.** *(My call.)* The dashboard already carries an "All groups · CSV" button built on that
path, and `exerciseCsvRows` has a `never` default branch written specifically after four card
kinds went missing from an export (see the header comment in `lib/group-answers-csv.ts`). A
chip-registry row builder would be a second "everything" CSV that disagrees with the first and
re-opens exactly that bug class. Extend the existing path with the tag column; "This field"
filters its output.

The uncertainty grid cannot use that header — export it in its own shape: `Uncertainty, Question,`
then one column per group. *(My call; the alternative is forcing a grid into a long-format sheet
that nobody can read.)*

Follow `ProjectExportButtons` and `app/api/admin/projects/[id]/export/route.ts`: build the export
in a **route**, not in the page render, and re-fetch on every click — an export is a record of
what is on the boards now.

### Where it lives

- Page: `/admin/projects/[slug]/cross-group`.
- Link: the admin project dashboard's **"Design groups"** section
  (`app/admin/projects/[slug]/page.tsx:155`), beside Implications / Cohort analysis / Group
  activity / the export buttons. *(Corrected call.)* An earlier draft pointed at the
  `contentLink` row at line 131, but that row is headed "Content · Carmelita" and holds
  member-facing `/project/<slug>/…` links; a read-only admin board belongs with the other
  admin design-group surfaces.
- Admin gating comes free from `proxy.ts`, as with the sibling admin routes.
- Deep-link the selected field in the URL so a chip can be shared.

## Live platform state, checked 2026-11-09

Against prod Carmelita, project ref `c867309a-e935-4f72-b3b5-f2997fabc43e`. Recorded because it is
what the filtering decision above was made against — not as a prerequisite. **There is no
blocking content task: this page ships whatever the platform has.**

- Resolution counts: 6 / 5 / 5 / 5 across The Public Works / The Known and Unknown / The Living
  Floor / The Moving Public, against a 13-row catalogue.
- The Living Floor's five are all `resolution: ""` — linked in Lanscan, outcome not chosen — so it
  contributes no rows and shows "not resolved" throughout until someone picks the outcomes. Tom
  has seen this and is content to ship that way.
- Four catalogue rows carry no position from any group (AI infrastructure and access, Control of
  body data, How health truth is established, Individual and movement power). Under the filtering
  decision these rows simply do not render.
- Every resolution title matched a catalogue row exactly: zero unmatched. The title join holds in
  live data today.

Net effect: roughly 9 rows, with Group 3's column empty. If The Living Floor's outcomes get picked
later, the grid grows on its own with no code change.

## Constraints

- **Next.js 16.2.10, React 19.2.4.** Per `AGENTS.md`, read the relevant guide in
  `node_modules/next/dist/docs/` before writing code. This is not the Next.js in your training
  data.
- **Read cost.** The page needs one board read per (group × board-backed week) — 16 for Public
  Health. The export route's comment calls a dozen-odd reads "well inside any limit", and unlike
  the project dashboard this page is opened deliberately, so paying it on render with
  `force-dynamic` is acceptable. Note it grows linearly; if a project appears with many groups and
  weeks, the chip-at-a-time structure means a route-per-field is the escape hatch.
- **No migrations.** If this work seems to need one, something has been misunderstood.
- Shaping logic goes in a `lib/*-shape.ts` module with vitest coverage, matching every sibling
  (`group-answers-shape`, `cohort-export-shape`, `commitments-shape`, …). The page and the client
  component stay thin.
- `data/all-groups-public-health-2026-10-30.json` is a real four-group export and the obvious
  fixture for the shape tests.

## Further calls made during review

Settled by me so a builder does not have to guess; none of them change what gets built in a way
Tom would notice.

- **Counts may disagree with cohort analysis.** `lib/analysis/cohort-pool-shape.ts` already walks
  risks / opportunities / hopes / fears cross-group from raw cards, with deliberately wider walks,
  so the same project can show different numbers on the two pages. This page uses
  `shapeExerciseAnswers`, as above, and that divergence is **accepted**. Unifying the two paths is
  a separate piece of work and is not in scope.
- **What makes a chip primary, on any project:** structural fields of the four render kinds are
  primary; admin-authored worksheet sections go to overflow. Where a program has two weeks of the
  same kind and so yields two "Risks" chips, disambiguate the chip label by week title.

## Left to the builder

- Component decomposition, and whether the chip row is a client component with the columns
  server-rendered or the whole board is client-side off one payload.
- Truncation length and the expand affordance. Mockups assumed ~4 lines and click-to-expand.
- Chip overflow: a "more" menu, a second row, or horizontal scroll.
- Whether the per-field CSV is one route with a field parameter or one route returning everything
  that the client slices.
- Empty-state wording, within the anti-goal above: a zero must be legibly "they wrote nothing",
  not an unexplained blank.
