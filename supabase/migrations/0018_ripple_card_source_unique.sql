-- 0018 — One seeded copy per source answer per board.
--
-- 0017 lets an admin seed a board's key changes from earlier-week answers, skipping
-- sources already seeded. That skip was a read-then-insert, so two concurrent seed
-- requests could both insert the same source. This constraint makes it atomic: the seed
-- insert ignores conflicts on (code, source_card_id). Ordinary cards have a null
-- source_card_id, and NULLs are distinct, so they are unaffected.
--
-- Idempotent; apply to BOTH dev (xpcmeskbqdapzmqcfnas) and prod (ratkqnumupciffxnsbhk).

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ripple_cards_code_source_card_key') then
    alter table public.ripple_cards
      add constraint ripple_cards_code_source_card_key unique (code, source_card_id);
  end if;
end $$;
