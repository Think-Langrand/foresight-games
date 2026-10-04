-- 0023 — One implication, present in several themes (Session 3, step 1).
--
-- Clustering is not a partition. "Ten-year plans lock in the preferences of whoever was in
-- the room in year one" is both a legitimacy theme and a planning theme, and a group that
-- has to pick one loses that reading on an arbitrary tie-break. So an implication can now
-- appear in more than one theme.
--
-- Shape: a copy is an ordinary card, parented to its theme like any other. Copies of the
-- same implication share a `twin_key`. Identity is `coalesce(twin_key, id)` — a card with
-- no twin_key is simply its own group of one, so nothing has to be backfilled.
--
-- WHY A GROUPING TOKEN AND NOT A FOREIGN KEY to the "original" card:
--   A self-referencing copy_of would make one row special, and deleting that row would
--   either take its siblings with it (cascade — deleting a theme silently empties another
--   one) or orphan them from each other (set null — two surviving copies end up with
--   nothing in common). A shared token has no privileged row: delete any card and the rest
--   still share the key. It is deliberately NOT a foreign key; it may well name a row that
--   has been deleted, and that is fine, because it is only ever compared for equality.
--
-- WHY 0018'S UNIQUE (code, source_card_id) IS UNTOUCHED:
--   A copy is written with source_card_id NULL, so it never enters that constraint — only
--   the seeded original carries the Week 2 link. That keeps admin seeding exactly as
--   atomic and idempotent as it is today. The alternative, narrowing 0018 to a partial
--   index, would have broken seeding outright: seedFirstCards upserts with
--   onConflict "code,source_card_id", and PostgREST cannot name a partial index's
--   predicate, so Postgres would reject the statement. The UI resolves a copy's "where
--   this came from" lineage by following its twin to the card that does hold the link.
--
-- Index on (code, twin_key): a board is read whole, but twins are looked up per card while
-- rendering, and this keeps that a scan of one small index rather than the whole board.
--
-- Idempotent; apply to BOTH dev (xpcmeskbqdapzmqcfnas) and prod (ratkqnumupciffxnsbhk).

alter table public.ripple_cards
  add column if not exists twin_key uuid;

create index if not exists ripple_cards_code_twin_key_idx
  on public.ripple_cards (code, twin_key)
  where twin_key is not null;

comment on column public.ripple_cards.twin_key is
  'Groups copies of one implication that sit in several themes. coalesce(twin_key, id) is the implication''s identity. Not a foreign key — it may name a deleted row.';
