-- 0002 — Card-game content, moved off Airtable into Supabase.
--
-- The "Scenario Uncertainties" deck (13 uncertainties x 4 outcome cards = 52)
-- becomes two relational tables. The nested Explore/workshop model (formerly
-- assembled from six Airtable tables) is stored as a single JSONB document.
--
-- Seed both with scripts/seed-supabase.mjs (reads data/*.seed.json).

-- ---------------------------------------------------------------------------
-- uncertainties — the 13 scenario dimensions (also the deck's card groups)
-- ---------------------------------------------------------------------------
create table if not exists public.uncertainties (
  slug              text primary key,
  number            integer not null default 0,
  domain            text not null default '',
  title             text not null default '',
  question          text not null default '',
  source_driver_ids text[] not null default '{}',
  created_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- card_outcomes — the 52 outcome cards (4 per uncertainty)
-- ---------------------------------------------------------------------------
create table if not exists public.card_outcomes (
  code             text primary key,          -- "C01".."C52"
  uncertainty_slug text not null references public.uncertainties(slug) on delete cascade,
  role             text not null default 'Core',  -- Core | Edge | Wildcard
  title            text not null default '',
  description      text not null default '',
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now()
);
create index if not exists card_outcomes_uncertainty_slug_idx
  on public.card_outcomes(uncertainty_slug);

-- ---------------------------------------------------------------------------
-- content — JSONB document store (currently: key='model', the nested Explore model)
-- ---------------------------------------------------------------------------
create table if not exists public.content (
  key        text primary key,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RLS. Deck tables are static reference data -> public read. `content` is read
-- server-side only (service_role bypasses RLS), so it gets no public policy.
-- ---------------------------------------------------------------------------
alter table public.uncertainties enable row level security;
alter table public.card_outcomes enable row level security;
alter table public.content       enable row level security;

drop policy if exists "public read uncertainties" on public.uncertainties;
drop policy if exists "public read card_outcomes" on public.card_outcomes;

create policy "public read uncertainties" on public.uncertainties for select to public using (true);
create policy "public read card_outcomes" on public.card_outcomes for select to public using (true);
