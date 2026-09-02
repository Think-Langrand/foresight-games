# Exercise Templates — Design Spec

**Date:** 2026-09-02
**Status:** Draft for review
**Author:** brainstormed with Claude

## Problem

Every design group runs the same *program of exercises* (weeks/sessions) — only the
scenario differs. When an admin builds a new exercise (e.g. a Q/A set for Session 3),
there is no way to save it and reuse it: it must be re-authored in every group. The two
exercises we ship today (Scenario Assessment, Implication Mapping) are hardcoded in
`lib/exercise-types.ts`, and the "Add week from…" menu in `AdminDesignGroups` can only
copy from the code registry or from a *sibling week in the same group*
([AdminDesignGroups.tsx:416-464](../../../components/admin/AdminDesignGroups.tsx#L416-L464)).
Nothing is saved, named, or shared across groups and projects.

## Goal

A persisted, global **template library** an admin builds once and stamps into any design
group. Immediate objective: reach parity with the two exercises we already have, and use
the system to actually build out **Session 3 and Session 4** (today `placeholder` weeks)
once and reuse them across groups.

## Non-goals (explicitly deferred)

- **No new module types.** v1 only composes the exercise render types that already exist:
  the flexible `worksheet` (arbitrary question + brainstorm blocks) and the fixed
  `implications` / `placeholder`. Adding a genuinely new module (a card game, a new
  renderer) is a code change we handle when it comes up — not now.
- **No bulk "apply to all groups."** v1 applies a template into one group at a time via the
  existing per-group menu. Bulk apply is a clean later addition (see Future work).
- **No live linking.** Applying a template *snapshots* its blocks into the week (see
  Semantics). Templates are not referenced by id from a running exercise.
- **No new permission tier.** Templates sit behind the same admin gate every other
  `/api/admin/*` route uses (`getSessionUser()`). There is one admin tier today.

## Key insight

The apply mechanism already exists. `addExercise({ type, sections })` in
`AdminDesignGroups` POSTs to the exercise route, which snapshots `sections` onto a new
`design_group_exercises` row and provisions its board
([exercises/route.ts:72-92](../../../app/api/admin/projects/[id]/design-groups/[groupId]/exercises/route.ts#L72-L92)).
This feature persists the *source* of `{ type, sections }` as a named, editable, shared
library — the apply path barely changes.

## Data model

New table `exercise_templates` — a global library (not bound to a project).

```sql
create table if not exists public.exercise_templates (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique,                         -- stable id for seeded built-ins; null for user-created
  name        text not null,
  description text not null default '',
  type        text not null default 'worksheet',   -- exercise-type id (lib/exercise-types.ts)
  sections    jsonb not null default '[]'::jsonb,   -- WorksheetSection[]; same shape as design_group_exercises.sections
  sort        int  not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- RLS on, no policy: anon denied, service_role bypasses. Matches design_group_exercises.
alter table public.exercise_templates enable row level security;
```

Notes:
- `sections` reuses the exact `WorksheetSection[]` shape and is coerced through the existing
  `resolveSections()` on every read/write, so template data can never crash a worksheet.
- `slug` is unique but nullable (Postgres allows multiple NULLs), so built-in seeds get a
  stable slug (`scenario-assessment`, `implications`, `blank-worksheet`) for idempotent
  seeding, while user-created templates leave it null.
- Migration file: `supabase/migrations/0014_exercise_templates.sql`. Apply to **both** dev
  (`xpcmeskbqdapzmqcfnas`) and prod (`ratkqnumupciffxnsbhk`) databases.

## Components

### 1. Data layer — `lib/exercise-templates.ts`

Server-only, mirrors `lib/design-group-exercises.ts` (snake_case row + `fromRow` mapper,
`supabaseAdmin()` wrapped in `withRetry`, `resolveSections` on read/write).

```
interface ExerciseTemplate {
  id: string; slug: string | null; name: string; description: string;
  type: string; sections: WorksheetSection[]; sort: number; createdTime: string;
}

listTemplates(): Promise<ExerciseTemplate[]>            // ordered by sort, created_at
getTemplate(id): Promise<ExerciseTemplate | null>
createTemplate({ name, description?, type?, sections?, sort? }): Promise<ExerciseTemplate>
updateTemplate(id, patch): Promise<void>                // name/description/type/sections/sort
deleteTemplate(id): Promise<void>
ensureDefaultTemplates(): Promise<void>                 // idempotent seed by slug (see Seeding)
```

### 2. API routes (admin-gated, `getSessionUser()`)

- `app/api/admin/templates/route.ts`
  - `GET` → `ensureDefaultTemplates()` then `listTemplates()` → `{ templates }`
  - `POST` → validate name; `createTemplate(...)` → `{ template }`
- `app/api/admin/templates/[id]/route.ts`
  - `PATCH` → `updateTemplate(id, patch)` → `{ ok: true }`
  - `DELETE` → `deleteTemplate(id)` → `{ ok: true }`

Validation mirrors the exercise route: reject empty `name`; coerce `sections` via
`resolveSections`; unknown `type` is allowed to pass (the renderer already tolerates it).

### 3. Admin UI — the library

- `app/admin/templates/page.tsx` — server component. Guards on `getSessionUser()`, calls
  `ensureDefaultTemplates()`, loads templates, renders the client component.
- `components/admin/AdminTemplates.tsx` — client component:
  - Lists templates (name, type, block count, description).
  - Create a template (name + type; `worksheet` shows the block editor).
  - Edit name / description / type / blocks. **Blocks reuse
    [`ExerciseQuestionEditor`](../../../components/admin/ExerciseQuestionEditor.tsx)** — the
    same editor the group weeks use, so authoring is identical.
  - Delete (with `ConfirmModal`).
  - Non-`worksheet` types (`implications`, `placeholder`) hide the block editor, matching
    how the group table gates "Edit Qs" to worksheet types
    ([AdminDesignGroups.tsx:369](../../../components/admin/AdminDesignGroups.tsx#L369)).
- Add a nav link to the templates page from the admin dashboard (`app/admin/page.tsx`).

### 4. Group integration — apply & capture (`AdminDesignGroups.tsx`)

- **Apply from template.** The "Add week from…" menu lazily fetches
  `GET /api/admin/templates` when opened and lists each template as a button. Picking one
  calls the existing `addExercise({ type: tpl.type, sections: tpl.sections })` with the
  week title defaulting to the template `name`. The current code-registry "Copy: X"
  buttons are dropped (those defaults are now seeded templates); "Blank worksheet" and
  "Placeholder" stay. Sibling-week copy can stay or be removed — see Open decision.
- **Save this week as a template.** A per-week action captures `effectiveSections(ex)` +
  `ex.type` into the library: prompts for a name, then `POST /api/admin/templates`. This
  lets an admin build Session 3 live in one group, tune it, then save and reuse it.

## Seeding — `ensureDefaultTemplates()`

Idempotent, keyed by `slug`. On call, for each built-in below, insert it only if no row
with that slug exists (so admin edits to a seeded template are never overwritten):

| slug                  | name                 | type          | sections                                          |
|-----------------------|----------------------|---------------|---------------------------------------------------|
| `scenario-assessment` | Scenario Assessment  | `worksheet`   | `getExerciseType("scenario-assessment")?.sections`|
| `implications`        | Implication Mapping  | `implications`| `[]`                                              |
| `blank-worksheet`     | Blank Worksheet      | `worksheet`   | `[]`                                              |

Sourced from the existing code registry in `lib/exercise-types.ts` via the exported
`getExerciseType()` accessor (the `SCENARIO_ASSESSMENT_SECTIONS` const itself is not
exported), so the seed has a single source of truth and no giant JSON blob is duplicated in
SQL. Scenario Assessment is
seeded as an editable `worksheet` carrying its section array (giving parity **and**
editability), rather than the code-fixed `scenario-assessment` type.

## Semantics & decisions

- **Snapshot, not link.** Applying copies `sections` into the week. Section `key`s are
  permanent ids that answer cards (`ripple_cards.section`) bind to; a later template edit
  that renamed/removed a block must never orphan a live group's answers. This matches the
  existing snapshot-on-create model.
- **Global library.** No `project_id`. One library serves every group in every project —
  the whole point is cross-project reuse. A nullable `project_id` can be added later for
  project-scoped templates without migrating existing rows.
- **Board provisioning is unchanged.** Applying a board-backed template into a group with a
  scenario provisions its board immediately, exactly as adding a week does today.

## Testing

- `lib/exercise-templates` — unit tests for `fromRow` mapping and `resolveSections`
  coercion of bad/partial `sections` (mirror `lib/exercise-types.test.ts` patterns).
- `ensureDefaultTemplates` — idempotency: two calls insert the seeds once; a hand-edited
  seed is not overwritten on re-seed.
- API routes — auth rejection (401 without session), empty-name rejection (400), create /
  update / delete round-trip.
- Manual/e2e: build a template on `/admin/templates`, apply it to a group as Session 3,
  confirm the board provisions and the worksheet renders its blocks; edit the template and
  confirm the already-applied week is unaffected (snapshot).

## Rollout

1. Migration `0014_exercise_templates.sql` applied to dev **and** prod DBs.
2. Ship data layer + API + admin library page + group wiring together.
3. First run seeds the three built-ins; admin builds Sessions 3 & 4 and applies them.

## Future work (not now)

- Bulk "apply to all groups in a project" (auto-provision each board, partial-failure
  handling) — the direct kill for the "add to each group" pain, deferred by choice.
- Project-scoped templates via nullable `project_id`.
- New module types (card game, additional renderers) as they arise — each its own code
  change + `EXERCISE_TYPES` entry.

## Open decision (minor, resolve in implementation)

- Keep or drop the existing "Copy: {sibling week}" button in the Add-week menu. Leaning
  drop, since "Save this week as a template" now covers reusing a tuned week durably.
