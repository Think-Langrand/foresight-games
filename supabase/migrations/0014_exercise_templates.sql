-- 0014 — Exercise templates: a global, admin-authored library of reusable exercises.
--
-- Every design group runs the same PROGRAM of exercises (weeks) — only the scenario
-- differs. Until now a new exercise (a Q/A set, a brainstorm) had to be re-authored in
-- every group; the only reuse was copying from the code registry or a sibling week. This
-- table persists a named, editable exercise ({type, sections}) an admin builds once and
-- stamps into any group. Applying a template SNAPSHOTS its sections onto the new
-- design_group_exercises row (section keys are permanent answer-card buckets), so editing
-- a template never disturbs a group that already ran it.
--
-- Read/written server-side through lib/exercise-templates.ts (service_role bypasses RLS);
-- like design_group_exercises it gets NO public policy and is NOT in the realtime
-- publication.

create table if not exists public.exercise_templates (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique,                          -- stable id for seeded built-ins; null for user-created
  name        text not null,
  description text not null default '',
  type        text not null default 'worksheet',    -- exercise-type id (lib/exercise-types.ts)
  sections    jsonb not null default '[]'::jsonb,    -- WorksheetSection[]; same shape as design_group_exercises.sections
  sort        int  not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists exercise_templates_sort_idx
  on public.exercise_templates (sort, created_at);

-- RLS on, no policy: anon denied, service_role bypasses. Matches design_group_exercises.
alter table public.exercise_templates enable row level security;
