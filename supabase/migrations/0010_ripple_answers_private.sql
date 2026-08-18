-- 0010 — Move reflection answers off the world-readable ripple_players table.
--
-- ripple_players carries a `public read ... using (true)` RLS policy (required so
-- Supabase realtime can deliver participant changes to anon clients). That makes
-- every column — including the freeform reflection `answers` — readable by anyone
-- holding the public anon key. Relocate the answers to a service-role-only table
-- with no public policy and outside the realtime publication. `submitted_at` stays
-- on ripple_players (non-sensitive; it drives the live "who has submitted" UI).

create table if not exists public.ripple_player_answers (
  player_id  uuid primary key references public.ripple_players(id) on delete cascade,
  code       text not null,
  answers    jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create index if not exists ripple_player_answers_code_idx on public.ripple_player_answers(code);

-- Carry across anything already captured.
insert into public.ripple_player_answers (player_id, code, answers, updated_at)
  select id, code, answers, coalesce(submitted_at, now())
  from public.ripple_players
  where answers is not null and answers <> '{}'::jsonb
  on conflict (player_id) do nothing;

-- RLS on, but NO public policy: only the service role (which bypasses RLS) can
-- read/write. Deliberately NOT added to the supabase_realtime publication.
alter table public.ripple_player_answers enable row level security;

-- Drop the now-relocated, publicly-readable column.
alter table public.ripple_players drop column if exists answers;
