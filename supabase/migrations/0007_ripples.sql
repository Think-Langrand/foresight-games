-- 0007 — RIPPLES (implications-mapping) game.
--
-- A second live game mode alongside the Cards scenario-kernel game. Players pick
-- an existing scenario, build causal chains of implications ("In this world… →
-- Because of that… → So by 2030…"), then bet chips on which implications matter.
--
-- Reuses the shared `sessions` table with a new scope 'Ripples' plus a real
-- facilitator-advanced phase machine (phase + phase_ends_at) and a per-session
-- config jsonb (timers, chips, toggles, and the snapshotted scenario premise +
-- resolutions). Four live tables carry the gameplay, plus a per-player challenge
-- votes table. Same design as 0001: all writes go through the server (service_role,
-- bypasses RLS); the browser only SELECTs for realtime, so every table gets a
-- public read policy, no write policy, and joins the supabase_realtime publication.
-- Every live table carries a `code` column — the realtime filter is code=eq.{CODE}.
--
-- Written idempotently so it is a no-op on the existing project
-- (ratkqnumupciffxnsbhk) and reproduces cleanly on a fresh one.

-- ---------------------------------------------------------------------------
-- sessions — phase machine + live timer + per-session config (additive, nullable)
-- ---------------------------------------------------------------------------
alter table public.sessions
  add column if not exists phase         text not null default 'LOBBY',
  add column if not exists phase_ends_at timestamptz,               -- null = untimed phase
  add column if not exists config        jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- ripple_teams — one board within a Ripples session (a team, or a solo pair)
-- ---------------------------------------------------------------------------
create table if not exists public.ripple_teams (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.sessions(id) on delete cascade,
  code        text not null,
  name        text not null default '',
  color       text not null default '',
  join_order  integer not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists ripple_teams_session_id_idx on public.ripple_teams(session_id);
create index if not exists ripple_teams_code_idx        on public.ripple_teams(code);

-- ---------------------------------------------------------------------------
-- ripple_players — one participant on a team (own device). participant_id is the
-- device uuid (fpw:pid) so a refresh / cleared localStorage rejoins the same row.
-- ---------------------------------------------------------------------------
create table if not exists public.ripple_players (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references public.sessions(id) on delete cascade,
  code           text not null,
  team_id        uuid not null references public.ripple_teams(id) on delete cascade,
  participant_id text not null default '',
  display_name   text not null default '',
  lens_id        text,                                 -- lens deck (deferred; provisioned)
  created_at     timestamptz not null default now()
);
create index if not exists ripple_players_session_id_idx on public.ripple_players(session_id);
create index if not exists ripple_players_code_idx        on public.ripple_players(code);
create index if not exists ripple_players_team_id_idx     on public.ripple_players(team_id);
-- one row per device per session → idempotent rejoin
create unique index if not exists ripple_players_code_pid_uidx
  on public.ripple_players(code, participant_id) where participant_id <> '';

-- ---------------------------------------------------------------------------
-- ripple_cards — one implication card. FIRST cards are chain roots; SECOND/TERMINAL
-- chain off a parent (self-ref). Deleting a card removes its subtree (cascade). A
-- card outlives its author (set null) so removing a player never drops the board.
-- ---------------------------------------------------------------------------
create table if not exists public.ripple_cards (
  id               uuid primary key default gen_random_uuid(),
  session_id       uuid not null references public.sessions(id) on delete cascade,
  code             text not null,
  team_id          uuid not null references public.ripple_teams(id) on delete cascade,
  author_player_id uuid references public.ripple_players(id) on delete set null,
  card_order       text not null,                      -- FIRST | SECOND | TERMINAL
  parent_card_id   uuid references public.ripple_cards(id) on delete cascade,
  text             text not null default '',
  lens_id          text,                               -- lens deck (deferred; provisioned)
  flagged          boolean not null default false,     -- challenged: surfaced for a vote
  greyed           boolean not null default false,     -- challenge upheld: visible, cannot anchor children
  created_at       timestamptz not null default now()
);
create index if not exists ripple_cards_session_id_idx on public.ripple_cards(session_id);
create index if not exists ripple_cards_code_idx        on public.ripple_cards(code);
create index if not exists ripple_cards_team_id_idx     on public.ripple_cards(team_id);
create index if not exists ripple_cards_parent_idx      on public.ripple_cards(parent_card_id);

-- ---------------------------------------------------------------------------
-- ripple_chips — a wager. unique(player_id, card_id) enforces "max 1 chip per
-- player per card"; the per-player budget (chipsPerPlayer) is enforced in the route.
-- ---------------------------------------------------------------------------
create table if not exists public.ripple_chips (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.sessions(id) on delete cascade,
  code        text not null,
  team_id     uuid not null references public.ripple_teams(id) on delete cascade,
  player_id   uuid not null references public.ripple_players(id) on delete cascade,
  card_id     uuid not null references public.ripple_cards(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique(player_id, card_id)
);
create index if not exists ripple_chips_session_id_idx on public.ripple_chips(session_id);
create index if not exists ripple_chips_code_idx        on public.ripple_chips(code);
create index if not exists ripple_chips_card_id_idx     on public.ripple_chips(card_id);
create index if not exists ripple_chips_player_id_idx   on public.ripple_chips(player_id);

-- ---------------------------------------------------------------------------
-- ripple_card_votes — CHALLENGE votes, one per (card, player) so a team-majority
-- can be counted without an array column silently losing votes under concurrency.
-- ---------------------------------------------------------------------------
create table if not exists public.ripple_card_votes (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.sessions(id) on delete cascade,
  code        text not null,
  card_id     uuid not null references public.ripple_cards(id) on delete cascade,
  player_id   uuid not null references public.ripple_players(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique(card_id, player_id)
);
create index if not exists ripple_card_votes_code_idx    on public.ripple_card_votes(code);
create index if not exists ripple_card_votes_card_id_idx on public.ripple_card_votes(card_id);

-- ---------------------------------------------------------------------------
-- RLS + public read policies (writes are server-only via service_role)
-- ---------------------------------------------------------------------------
alter table public.ripple_teams      enable row level security;
alter table public.ripple_players    enable row level security;
alter table public.ripple_cards      enable row level security;
alter table public.ripple_chips      enable row level security;
alter table public.ripple_card_votes enable row level security;

drop policy if exists "public read ripple_teams"      on public.ripple_teams;
drop policy if exists "public read ripple_players"    on public.ripple_players;
drop policy if exists "public read ripple_cards"      on public.ripple_cards;
drop policy if exists "public read ripple_chips"      on public.ripple_chips;
drop policy if exists "public read ripple_card_votes" on public.ripple_card_votes;

create policy "public read ripple_teams"      on public.ripple_teams      for select to public using (true);
create policy "public read ripple_players"    on public.ripple_players    for select to public using (true);
create policy "public read ripple_cards"      on public.ripple_cards      for select to public using (true);
create policy "public read ripple_chips"      on public.ripple_chips      for select to public using (true);
create policy "public read ripple_card_votes" on public.ripple_card_votes for select to public using (true);

-- ---------------------------------------------------------------------------
-- Realtime — publish the live tables (the browser subscribes to changes).
-- sessions is already published (0001), so phase/phase_ends_at/config changes
-- propagate automatically (per-table publication includes new columns).
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array['ripple_teams', 'ripple_players', 'ripple_cards', 'ripple_chips', 'ripple_card_votes'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
