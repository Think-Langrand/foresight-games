# Cohort implication clustering — a facilitator playground

**Status:** design, approved in conversation 2026-10-15. Not yet implemented.

## Purpose

A project-level admin page that pools the Session 2 implications of *every* design
group in a project and proposes how the whole cohort's material could be themed.

It answers three questions a facilitator currently cannot ask:

1. **What are the cohort-wide themes?** The 4–6 themes that hold across every room,
   named well enough to present back in a plenary.
2. **Where did groups converge, and where did one group stand alone?** With
   provenance, so the claim is "groups 1, 3 and 6 all landed here" rather than a
   vague impression.
3. **What does it read like in prose?** A paragraph per group plus one overall, to
   paste into a report or deck.

It is explicitly a **playground**. The point of this round is to run it on real
material, compare methods and prompts, and learn which outputs are worth keeping —
on `dev`, before anything is promoted to `main`.

## Non-goals (this round)

- **No persistence.** Runs live in the browser for the length of a session. No
  table, no migration, nothing to apply to the two Supabase projects.
- **No writing to group boards.** Nothing here touches a Session 3 board.
- **No editing of results.** Both persistence and editing are wanted *eventually*
  (see Future seams); neither is built now.
- **No comparison of groups' own Session 3 themes.** The pool is raw Session 2
  implications. Decided deliberately: convergence detection wants the raw
  sentences, because two rooms writing nearly the same implication *is* the
  finding, and comparing group-made themes would hide any implication that never
  got clustered.

## Scale

4–6 groups, roughly 150–250 implications. For reference, measured on a real
43-implication single-group board: embedding all 43 took 1.4s; the single LLM
grouping call took 25s without criteria and 41s with them.

The app deploys on **Render** as a long-running Node server (`npm run start`), so
the `maxDuration` exports in the sibling routes are Vercel hints and are inert
here. A multi-minute request will not be severed by a function timeout. The real
risk is a browser that looks hung, which the UI handles with elapsed-time
feedback. Actual latency at 250 items must be measured on dev.

## What already exists, and is reused unchanged

| Thing | Where | Role here |
|---|---|---|
| `implicationSeedCandidates` | `lib/synthesis-shape.ts` | The candidate filter. Excludes roots, stickies and challenged-out cards. Reused so the pool is exactly what could land on a Session 3 board. |
| `clusterByEmbedding` | `lib/analysis/implication-cluster.ts` | The embedding method, whole. Already handles secondary memberships, cohesion, outliers and notes. |
| `clusterByLlm` | same | The LLM method. Needs one additive optional arg (below). |
| `embedImplications` | same | Used again, standalone, for near-duplicate pairs. |
| `reconcileLlmGroups` | `lib/analysis/implication-cluster-shape.ts` | Keeps the guarantee that `themes ∪ ungrouped` covers the whole pool. |
| `clusterVectors`, `centerVectors`, `cosineSimilarity` | `lib/analysis/cluster.ts` | Pair similarity. |
| `mapPool` | `lib/analysis/suggest.ts` | Bounded concurrency for the label and narrative calls. |
| `GROUPING_PRESETS` | `lib/analysis/implication-cluster-shape.ts` | Threshold presets, reused verbatim. |
| `download`, CSV helpers | `components/admin/exportUtils.ts` | Export. |

`ripple_cards.id` is a UUID primary key (migration 0007), so pooling across boards
cannot collide on ids.

`CohortItem extends ImplicationItem`, so the pooled array passes into both existing
clusterers with **no change to any shared interface**. The board rail
(`SuggestThemesRail`) and the per-group route are untouched.

## 1. Pooling

`listDesignGroups(projectId)` → for each group `listExercises(groupId)`, filtered
to `getExerciseType(e.type)?.render === "implications"` → `listBoardCards(sessionCode)`
in parallel → `implicationSeedCandidates(cards)` → each item tagged with `groupId`.

**Week selection.** Groups built from one template share the same exercise `sort`,
so the selector picks one week across the cohort: the distinct `(sort, title)`
implications weeks found, defaulting to whichever appears in the most groups. A
per-group override row appears only for a group holding more than one implications
week. *(Assumption to confirm — see Open questions.)*

**Every group is reported, in one of three states.** Never silently omitted:

- `ok` — has candidates (with the count)
- `empty` — the board exists but holds no candidates
- `missing` — no implications week at the selected sort

This matters because "Group 4 never raised this theme" is one of the findings, and
it must be impossible to confuse with "Group 4 wasn't in the run." It is the same
principle `reconcileLlmGroups` already enforces for implications.

**Guard:** fewer than 2 pooled items, or no group in `ok` state, returns 400 with a
message naming which groups were empty or missing — the per-group route's
"fewer than two implications to cluster" error, widened to the cohort.

## 2. Methods

Both are first-class and comparable side by side.

### `embedding` (default for the pooled run)

`clusterByEmbedding(items, { minSimilarity, criteria })`, unchanged. Embedding is
one request per 96 items (3 requests at 250), clusters agglomeratively on centered
vectors, then one LLM call per multi-member cluster to name it, at concurrency 3.

**Groupings are deterministic** — same items and threshold give the same clusters,
the same membership and the same cohesion numbers. **Labels are not**: they are
model output at default temperature and reword between runs. So re-running to add
the narrative yields identical theme *membership* with possibly different theme
*names*. Stated in the UI rather than left to be discovered. If it becomes
irritating, that is the signal to persist runs.

Default threshold is the `balanced` preset (0.1), matching the per-group panel.

### `llm`

`clusterByLlm(items, criteria, opts)`. The criteria steer the **grouping** here and
only the **names** in the embedding method — the difference most likely to mislead
a facilitator, and the existing panel's copy already says so. Reuse that wording.

`clusterByLlm` gains one optional third argument, defaulting to exactly today's
behavior so the existing route and board rail are unaffected:

```ts
opts?: {
  framing?: "group" | "cohort";   // default "group" — today's prompt verbatim
  context?: "blind" | "full";     // default "blind"
  promptOverride?: string;        // replaces the system prompt entirely
}
```

- `framing: "cohort"` swaps the system prompt's "A group mapped out the
  implications" for cohort phrasing. The current text is simply wrong for a pooled
  run.
- `promptOverride` lets the facilitator edit the actual system prompt in the page
  and re-run. This is the playground's main lever.
- `context` is the blind/full axis below.

Expect this method to be slow at 250 items and to leave more in `ungrouped` as the
model's attention thins. That is visible, not hidden: the reconcile guarantee holds.
Criteria cap raised to 4000 characters (the per-group route caps at 2000), because
here it is a prompt rather than a line.

### The blind / full context axis (LLM method only)

**Already in the digest today, in both modes:** the implication text and its key
change (`id: text [from key change: ...]`). The key change is included
deliberately — it is real grouping context and the thing facilitators most want to
cut *across*, which they can only ask for if the model can see it. "Blind" never
meant blind to the key change.

- **`blind` (default).** No group identity. If the model then gathers implications
  from five rooms into one theme, the convergence is a genuine finding, because it
  could not have aimed for it. Provenance stays *derived evidence*, computed from
  `memberIds` after the fact.
- **`full`.** Adds group identity per implication, each group's scenario title, and
  the project name. The model can then be asked for themes several groups
  independently raised — at the cost that "4 of 6 groups converged" becomes partly
  its artifact rather than your finding.

Defined as a named set, not a boolean, so widening what `full` carries later is one
line. **Inert in embedding mode** — `embedImplications` embeds the text alone (so
siblings do not collapse back toward the Session 2 structure) and there is no
prompt to enrich. The UI greys the control out rather than implying it did
something.

## 3. Provenance and the grid

Derived in the route from `themes[].memberIds` against the id→group map. Never from
the model, in either method.

The centerpiece is a **themes × groups grid**: rows are themes, columns are groups,
cells are member counts. One object serves all three purposes — a row lit across
every column is the plenary theme, a row lit in one column is the outlier, and a
dark cell says that group never went there.

Column headers carry the **scenario title** as well as the group name, collapsing
to names alone when the whole cohort shares one scenario. Groups can hold different
scenarios (`DesignGroup.scenarioRef` / `scenarioTitle` are per group), and
convergence across groups exploring *different futures* is a materially stronger
finding than convergence within one.

The grid is computed client-side from `themes[].byGroup` × `groups`. No matrix on
the wire.

## 4. Near-duplicate pairs

New `lib/analysis/cohort-pairs.ts`: embed the pool, center, compute pairwise cosine,
keep the top pairs **whose two items come from different groups**, above a floor.
This is the "two rooms said nearly the same sentence" view.

Starting constants, to be tuned on dev once there is real output to judge: at most
50 pairs, floor 0.25 cosine **on centered vectors** — above the `tight` preset's
0.18, since a near-duplicate should be a stronger claim than a co-cluster. Both
live as named constants in the module, not as UI, until there is evidence they need
to move.

Deliberately a **separate, self-contained step** with its own `embedImplications`
call rather than piggybacking on the clustering. It costs ~2s and fractions of a
cent, and it means the pair view works under the **LLM method too**, where no
embedding otherwise happens. The O(n²) matrix is 62k comparisons at 250 items.

## 5. Narrative

Behind a `narrative: true` flag on the same route — off while tuning thresholds and
prompts, on once a grouping looks right.

- **Per group:** one call over that group's implications. 4–6 calls at concurrency 3.
- **Overall:** one call over the run's own theme labels, summaries and group tallies.

One route rather than two, decided after a correction in conversation: a separate
narrative endpoint over ephemeral runs would either have to be *told* the themes
(trusting model output from the request, breaking the rule every sibling route
follows) or re-cluster and end up describing **different themes than the grid on
screen**. One route keeps all material read from the DB and keeps the prose about
the themes actually displayed.

## 6. Wire shape

New `lib/analysis/cohort-cluster-shape.ts` — client-safe, no server imports,
mirroring `implication-cluster-shape.ts`.

```ts
export type GroupState = "ok" | "empty" | "missing";
export type ContextMode = "blind" | "full";

export interface CohortItem extends ImplicationItem { groupId: string }

export interface CohortTheme extends SuggestedTheme {
  byGroup: { groupId: string; count: number }[];
  groupCount: number;
}

export interface CohortGroupInfo {
  id: string; name: string; color: string | null;
  scenarioTitle: string | null; itemCount: number; state: GroupState;
}

export interface CohortNarrative {
  perGroup: { groupId: string; text: string }[];
  overall: string;
}

export interface CohortClusterResponse {
  method: ClusterMethod;
  criteria: string | null;
  promptOverride: string | null;
  context: ContextMode;
  minSimilarity: number | null;
  week: { sort: number; title: string };
  groups: CohortGroupInfo[];
  themes: CohortTheme[];
  ungrouped: string[];
  nearDuplicates: { aId: string; bId: string; similarity: number }[];
  narrative: CohortNarrative | null;
  items: CohortItem[];          // self-contained export
  model: string;
  generatedAt: string;
  elapsedMs: number;
  notes: string[];
}
```

`items` carries `groupId` at runtime already, because the pooled `CohortItem[]` is
what gets passed to the clusterers; the cohort layer re-types it.

Themes are shaped so that a theme's `label` and `summary` are what a Session 3
theme card consumes — see Future seams.

## 7. Route

`POST /api/admin/projects/[id]/implications/cluster`

```ts
{
  weekSort: number;                        // the cohort-wide week
  overrides?: Record<string, string>;      // groupId → exerciseId, for a group that
                                           // holds more than one implications week
  groupIds?: string[];                     // omitted = every group in the project
  method: ClusterMethod;                   // "embedding" | "llm"
  context?: ContextMode;                   // default "blind"; ignored when embedding
  criteria?: string;                       // <= 4000 chars
  promptOverride?: string;                 // LLM method only
  minSimilarity?: number;                  // embedding only; default balanced (0.1)
  narrative?: boolean;                     // default false
}
```

Guards, mirroring the sibling routes exactly: `supabaseConfigured()`,
`getSessionUser()`, `OPENAI_API_KEY` present, project exists.

**Read-only.** Nothing is written — not a card, not a config key. The per-group
cluster route carries the same promise and the same reasoning: a facilitator should
be able to run this as often as they like, on real group material, at no cost but
the API call.

All implication material is read from the DB, never taken from the request. The
client says which week and which groups; never what is on them.

## 8. The page

`/admin/projects/[slug]/implications`, linked from the project admin page beside
the existing "View analysis →" (which is the card-game kernel tool, a different
data model, deliberately not merged with this).

**Run history in client state** — an array of completed runs, no DB. Flip between
them, or put **two side by side** to compare embedding against LLM, or two prompts,
on the identical pool without paying for either again. Each run carries its method,
context mode, criteria, prompt, threshold, timing and item count, so a comparison is
legible rather than a guess about which settings produced what.

Per run: the grid as centerpiece; an expandable theme listing its members with a
group chip on each; the `ungrouped` list, shown and never hidden; the cross-group
near-duplicate pairs; the narrative when present; `notes`. Export JSON and CSV.

Controls: group filter (all, a subset, or one — so the page can also run a single
group), week selector, method, threshold preset, context toggle (greyed in
embedding mode), criteria/prompt textarea, narrative checkbox.

Above ~120 items the LLM method shows a warning that it will be slow and may leave
more implications ungrouped, recommending embedding. A warning, not a block — the
facilitator chooses.

## 9. Testing

Unit tests, following `implication-cluster-shape.test.ts`, on the pure shaping —
which is where the logic that can be wrong actually lives:

- Provenance derivation: `byGroup` tallies and `groupCount` from known membership,
  including an implication in two themes (which `clusterByEmbedding` can produce
  via secondary memberships) counted once per theme.
- Pooling states: `ok` / `empty` / `missing` for a cohort where one group has no
  implications week and another has an untouched board.
- Property test, extending the existing guarantee to the cohort: every id in any
  theme is a real pooled candidate, and `themes ∪ ungrouped` covers every pooled
  item — so no group's work can vanish from a cohort view.
- Near-duplicate pairs: only cross-group pairs returned, sorted descending, floor
  respected, no pair repeated in both orders.
- Grid derivation from `themes × groups`, including a group in `missing` state
  rendering distinctly from a group with a genuine zero.

Model calls are not unit-tested. The route is verified by running it on dev against
real group material, which is the point of the round.

## Open questions, to confirm at review

1. **Do groups within one project work different scenarios, in practice?** Designed
   for both. If they routinely differ, the scenario belongs in the grid header
   permanently and convergence-across-scenarios becomes the headline reading.
2. **Week selection:** is "one week across the cohort, defaulted to the most common
   `(sort, title)`" right, or do groups drift enough to need per-group selection as
   the norm rather than the exception?
3. **Label sampling.** `labelImplicationCluster` digests `members.slice(0, 10)`. A
   40-member cohort cluster is therefore named from a sample. The order is
   agglomerative rather than by group, so skew should be mild, but if labels start
   reading in one group's voice, interleaving members by group before the label
   call is the fix. Watch it on dev; do not build for it yet.

## Future seams (not built)

- **Persistence.** The response is a self-contained object. Persisting is a table
  plus a list page, not a rewrite. It is also what would make labels stable across
  revisits and let a run be linked to a co-lead.
- **Pushing themes to groups as starters.** `CohortTheme.label` / `.summary` are
  already shaped for a Session 3 theme card, and `SuggestThemesRail`'s "Use this"
  path already writes one for a single group. The cohort equivalent writes to
  several boards, which needs its own design — it is the first thing here that
  would not be read-only.
- **Editing results.** Depends on persistence landing first.
