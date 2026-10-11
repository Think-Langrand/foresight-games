-- 0028 — Where things sit on the Session 3 clustering CANVAS.
--
-- Migrations 0001–0027 store no coordinates at all: `sort` is a LIST position and every
-- Week 3 view lays itself out from the tree. The canvas is the first view where WHERE a
-- thing sits is data, and where position carries meaning — a card inside a theme's region
-- IS a member of that theme, written to the same ripple_cards.parent_card_id the theme
-- rail already writes (components/workshop/synthesis/ClusterBoard.tsx).
--
-- TWO TABLES, not one keyed by card id, because the two things are keyed differently and
-- only one of them can carry a foreign key:
--
--   ripple_canvas_cards.item_id is an implication's IDENTITY — coalesce(twin_key, id), the
--     same `implicationKey` the board indexes by (lib/synthesis-shape.ts). It has to be,
--     because one implication can be several rows (0023) and all of them are ONE circle on
--     the canvas; keying on a row id would give one implication three positions.
--     It is deliberately NOT a foreign key, for exactly 0023's reason: a twin_key may name
--     a row that has since been deleted (0026 hands the Week 2 link to a surviving sibling
--     and leaves twin_key pointing at the dead original), so an FK would either reject the
--     insert or cascade away a position whose implication is still very much on the board.
--     It is only ever compared for equality. Rows for implications that no longer exist are
--     harmless — a board holds ~150 — and are swept on an admin board reset.
--
--     Corollary, and load-bearing: twin_key is now IMMUTABLE once set. Clearing it would
--     change implicationKey and orphan the saved position. Safe today — setCardTwinKey
--     (lib/ripples.ts) is called once, on the original, with the original's own id.
--
--   ripple_canvas_regions.theme_id is a real theme row, never twinned, so it CAN carry the
--     FK — and should: deleting a theme must take its region with it, or the next theme
--     created would inherit a box with someone else's name on it.
--
-- One table with a nullable w/h would mean no FK on either kind, w/h null on 95% of rows,
-- and a single realtime stream where a region move and a card move are indistinguishable
-- without reading card_kind.
--
-- COLUMNS ON ripple_cards was the other alternative, and is the one to avoid hardest:
-- every position write would broadcast on ripple_cards, and useRipplesView refetches the
-- WHOLE board on any ripple_cards change (components/workshop/hooks.ts) — a full board
-- refetch per drag-end, for every client in the room. Hence a separate pair of tables on
-- their own channel (live:{CODE}:canvas).
--
-- `code` is the CANVAS board's code (the Session 3 board) on both tables, denormalized
-- purely so the browser's realtime filter code=eq.{CODE} matches. Same shape as 0010.
--
-- Idempotent; apply to BOTH dev (xpcmeskbqdapzmqcfnas) and prod (ratkqnumupciffxnsbhk).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.ripple_canvas_cards (
  item_id    uuid primary key,  -- coalesce(twin_key, id); NOT a foreign key, see header
  code       text not null,
  x          double precision not null,
  y          double precision not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.ripple_players(id) on delete set null
);

create index if not exists ripple_canvas_cards_code_idx on public.ripple_canvas_cards(code);

create table if not exists public.ripple_canvas_regions (
  theme_id   uuid primary key references public.ripple_cards(id) on delete cascade,
  code       text not null,
  x          double precision not null,
  y          double precision not null,
  w          double precision not null check (w > 0),
  h          double precision not null check (h > 0),
  -- 'rect' | 'ellipse'. Text with a default and no CHECK, as card_order in 0007: a new
  -- shape ships as code, not as a migration. v1 writes 'rect' only.
  shape      text not null default 'rect',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.ripple_players(id) on delete set null
);

create index if not exists ripple_canvas_regions_code_idx on public.ripple_canvas_regions(code);

comment on column public.ripple_canvas_cards.item_id is
  'An implication''s identity — coalesce(twin_key, id). Not a foreign key: it may name a deleted original whose twins are still on the board. twin_key must therefore be treated as immutable once set; changing it would orphan this position.';

-- ---------------------------------------------------------------------------
-- RLS — public read, no write policy. The browser only ever SELECTs (realtime
-- needs read access); every write goes through the service role. Same as 0007.
--
-- Policies are created behind a pg_policies check rather than drop-and-create so this
-- file contains no DROP and can be applied through tooling that refuses destructive DDL.
-- ---------------------------------------------------------------------------
alter table public.ripple_canvas_cards   enable row level security;
alter table public.ripple_canvas_regions enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['ripple_canvas_cards', 'ripple_canvas_regions'] loop
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = t and policyname = 'public read ' || t
    ) then
      execute format(
        'create policy %I on public.%I for select to public using (true)',
        'public read ' || t, t
      );
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Realtime — publish both tables, and REPLICA IDENTITY FULL for 0016's reason:
-- logical replication omits `code` from the OLD record on DELETE under the default
-- (primary key) identity, so the code=eq filter discards every DELETE server-side.
-- Without this, a deleted theme's region lingers on every other screen until reload.
-- ---------------------------------------------------------------------------
alter table public.ripple_canvas_cards   replica identity full;
alter table public.ripple_canvas_regions replica identity full;

do $$
declare
  t text;
begin
  foreach t in array array['ripple_canvas_cards', 'ripple_canvas_regions'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
