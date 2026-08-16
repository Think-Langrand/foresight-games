-- 0006 — Per-project sessions & teams.
--
-- Additive + nullable: existing rows stay NULL = the global Supabase deck (current
-- behavior, fully backward compatible). A set project_id resolves the deck from
-- that project's Carmelita data instead (see lib/cards.ts getDeckForProjectId).
--
-- on delete set null so removing a project never orphans/deletes worlds — they
-- revert to the global deck rather than disappearing.

alter table public.sessions
  add column if not exists project_id uuid references public.projects(id) on delete set null;
alter table public.teams
  add column if not exists project_id uuid references public.projects(id) on delete set null;

create index if not exists sessions_project_id_idx on public.sessions(project_id);
create index if not exists teams_project_id_idx     on public.teams(project_id);

-- RLS: no change. Both tables already have `for select using (true)` and no write
-- policy (writes are service_role). The new column inherits that, and the realtime
-- publication is per-table so the column appears in change payloads automatically.
