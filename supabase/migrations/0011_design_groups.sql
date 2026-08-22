-- 0011 — Design groups.
--
-- A "design group" organizes a project's implication-mapping workshop: four (or so)
-- groups, each OWNING one scenario (assigned by an admin) and backed by ONE shared-
-- board Ripples session. Members self-select their group on the project's "Design
-- Groups" tab and land on the group's shared board, where they all edit the same
-- implication map live (config.sharedTeam — see lib/ripples-types.ts). The admin is
-- the one who finally finalizes each group's map into an output.
--
-- Read/written server-side through lib/design-groups.ts (service_role bypasses RLS);
-- like `projects` and `content` it gets NO public policy — the browser never reads
-- it directly, and it is NOT in the realtime publication (the board's ripple_* tables
-- carry realtime; the group registry does not need to).

create table if not exists public.design_groups (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  name            text not null,                         -- e.g. "Group A"
  sort            int  not null default 0,               -- display order on the tab
  color           text,                                  -- badge colour (TEAM_COLORS hex)
  scenario_ref    text,                                  -- Foresight scenario slug; null until assigned
  scenario_set_id text,                                  -- the set the scenario belongs to (navigation)
  scenario_title  text,                                  -- snapshot of the scenario title (display)
  session_code    text,                                  -- backing Ripples session; null until a scenario is assigned
  status          text not null default 'DRAFT',         -- DRAFT (no scenario) | OPEN (building) | FINALIZED
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists design_groups_project_idx on public.design_groups (project_id, sort);

-- RLS on, no policy: anon is denied, service_role bypasses. Matches `projects`.
alter table public.design_groups enable row level security;
