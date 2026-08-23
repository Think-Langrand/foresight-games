-- 0012 — Design group exercises (a multi-week program) + sectioned sticky cards.
--
-- A design group runs a PROGRAM of exercises (weeks) over ~two months, each a
-- different worksheet. Each exercise is backed by its own shared-board Ripples
-- session (config.sharedTeam), so it inherits realtime, the optimistic overlay,
-- shared-team auto-join, and phase-based locking (BUILD editable / HARVEST locked).
-- Weeks unlock on a schedule (opens_at) and an admin can lock a week (locked).
--
-- Read/written server-side through lib/design-group-exercises.ts (service_role
-- bypasses RLS); like design_groups it gets NO public policy and is NOT in the
-- realtime publication (the board's ripple_* tables carry realtime).

create table if not exists public.design_group_exercises (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid not null references public.design_groups(id) on delete cascade,
  sort          int  not null default 0,                 -- week number / display order
  title         text not null,
  type          text not null default 'placeholder',     -- exercise-type id (lib/exercise-types.ts)
  session_code  text,                                     -- backing shared board; null for non-board types
  locked        boolean not null default false,           -- admin lock (independent of schedule)
  opens_at      timestamptz,                              -- scheduled unlock; null = open now
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists design_group_exercises_group_idx
  on public.design_group_exercises (group_id, sort);

-- RLS on, no policy: anon denied, service_role bypasses. Matches design_groups.
alter table public.design_group_exercises enable row level security;

-- Sticky cards gain a section key so one board can host several named areas
-- (a worksheet of brainstorm + question areas). null = the implications board's
-- single default brainstorm. ripple_cards is already in the realtime publication,
-- so sections propagate with no extra config.
alter table public.ripple_cards add column if not exists section text;

-- The board + lock now live on each exercise, not the group. These group columns
-- are retired (design_groups is empty, so this drops no data).
alter table public.design_groups drop column if exists session_code;
alter table public.design_groups drop column if exists status;
