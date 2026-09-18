-- 0017 — Seeded implication cards remember where they came from.
--
-- An admin can seed a design group's implications map (Session 2) with answers from
-- the group's earlier weeks (e.g. Session 1's "Our 6 key changes"): each chosen answer
-- is copied onto the board as a FIRST card. The copy records its source so the same
-- answer can't be seeded twice and the map can tag it ("from Session 1").
--   source_card_id — the answer card it was copied from. Set null (not cascade) so
--                    deleting the original answer never removes the seeded card.
--   source_label   — display label for the tag (the source week's title).
--
-- Idempotent; apply to BOTH dev (xpcmeskbqdapzmqcfnas) and prod (ratkqnumupciffxnsbhk).

alter table public.ripple_cards
  add column if not exists source_card_id uuid references public.ripple_cards(id) on delete set null,
  add column if not exists source_label   text;

create index if not exists ripple_cards_source_card_idx on public.ripple_cards(source_card_id);
