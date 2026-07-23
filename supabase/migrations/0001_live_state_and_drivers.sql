-- 0001 — Live workshop state + slide drivers.
--
-- Documents the schema already deployed to the Supabase project
-- (ratkqnumupciffxnsbhk). Written idempotently so it is a no-op on the
-- existing project and reproduces the schema cleanly on a fresh one.
--
-- Design: all writes go through the server using the service_role key (which
-- bypasses RLS). The browser only ever SELECTs (for realtime), so every table
-- gets a public read policy and no public write policy.

-- ---------------------------------------------------------------------------
-- sessions — one workshop run (Single / Full / Cards)
-- ---------------------------------------------------------------------------
create table if not exists public.sessions (
  id             uuid primary key default gen_random_uuid(),
  code           text unique,
  title          text not null default '',
  scope          text not null default 'Single',
  pacing         text,
  uncertainty_id text,
  driver_id      text,
  mode           text not null default 'Divergent',
  prompt         text not null default '',
  status         text not null default 'Open',
  facilitator    text not null default '',
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- teams — one team within a Cards session
-- ---------------------------------------------------------------------------
create table if not exists public.teams (
  id                       uuid primary key default gen_random_uuid(),
  session_id               uuid not null references public.sessions(id) on delete cascade,
  code                     text not null,
  name                     text not null default '',
  color                    text not null default '',
  seed_uncertainty_id      text not null default '',
  seed_card_id             text not null default '',
  hand_ids                 text[] not null default '{}',
  kept_ids                 text[] not null default '{}',
  wildcard_id              text,
  convergence              text not null default '',
  world_title              text not null default '',
  world_description        text not null default '',
  primary_condition        text not null default '',
  defining_characteristics text not null default '',
  central_tension          text not null default '',
  new_normal               text not null default '',
  broken_assumption        text not null default '',
  status                   text not null default 'Drafting',
  created_at               timestamptz not null default now()
);
create index if not exists teams_session_id_idx on public.teams(session_id);
create index if not exists teams_code_idx on public.teams(code);

-- ---------------------------------------------------------------------------
-- submissions — participant text contributions (Single / Full)
-- ---------------------------------------------------------------------------
create table if not exists public.submissions (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references public.sessions(id) on delete cascade,
  code           text not null,
  uncertainty_id text,
  text           text not null default '',
  author         text not null default '',
  lean           text,
  participant_id text not null default '',
  created_at     timestamptz not null default now()
);
create index if not exists submissions_session_id_idx on public.submissions(session_id);
create index if not exists submissions_code_idx on public.submissions(code);

-- ---------------------------------------------------------------------------
-- responses — upvotes / reactions / poll answers
-- ---------------------------------------------------------------------------
create table if not exists public.responses (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references public.sessions(id) on delete cascade,
  code           text not null,
  uncertainty_id text,
  participant_id text not null default '',
  kind           text not null,
  submission_id  uuid references public.submissions(id) on delete cascade,
  poll_key       text not null default '',
  value          text not null default '',
  value_number   numeric,
  created_at     timestamptz not null default now()
);
create index if not exists responses_session_id_idx on public.responses(session_id);
create index if not exists responses_submission_id_idx on public.responses(submission_id);

-- ---------------------------------------------------------------------------
-- drivers — the 14 curated slide drivers (flat; feeds the Cards present view)
-- ---------------------------------------------------------------------------
create table if not exists public.drivers (
  id         uuid primary key default gen_random_uuid(),
  slug       text unique,
  number     integer not null default 0,
  name       text unique,
  theme      text not null default '',
  headline   text not null default '',
  body       text not null default '',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RLS + public read policies (writes are server-only via service_role)
-- ---------------------------------------------------------------------------
alter table public.sessions    enable row level security;
alter table public.teams       enable row level security;
alter table public.submissions enable row level security;
alter table public.responses   enable row level security;
alter table public.drivers     enable row level security;

drop policy if exists "public read sessions"    on public.sessions;
drop policy if exists "public read teams"        on public.teams;
drop policy if exists "public read submissions"  on public.submissions;
drop policy if exists "public read responses"    on public.responses;
drop policy if exists "public read drivers"      on public.drivers;

create policy "public read sessions"    on public.sessions    for select to public using (true);
create policy "public read teams"        on public.teams       for select to public using (true);
create policy "public read submissions"  on public.submissions for select to public using (true);
create policy "public read responses"    on public.responses   for select to public using (true);
create policy "public read drivers"      on public.drivers     for select to public using (true);

-- ---------------------------------------------------------------------------
-- Realtime — publish the live tables (the browser subscribes to changes)
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
  foreach t in array array['sessions', 'teams', 'submissions', 'responses'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
