-- 0024 — One copy of an implication per theme, enforced by the database.
--
-- 0023 let an implication sit in several themes as twin copies sharing a twin_key. The
-- "not twice in the same theme" rule was a read-before-insert in the add-card route and
-- nothing at all in the reparent route, so two people copying the same implication into
-- the same theme at the same moment, or one person dragging a copy into the theme that
-- already holds its twin, could leave two copies side by side. The routes still check
-- first so the message can be friendly; this makes the rule hold whatever the timing.
--
-- Partial: only twinned, clustered rows take part. A card with no twin_key is its own
-- group of one and can never collide; a tray card (parent null) is outside any theme.
--
-- Preflight: if the race has already left two copies side by side, say so by name rather
-- than fail on the index statement. Nothing is deleted here — which copy to keep is the
-- group's call, not the migration's. (Both the dev and prod databases had none when this
-- was applied on 2026-10-07.)
do $$
declare
  dupes int;
begin
  select count(*) into dupes from (
    select code, parent_card_id, twin_key
    from public.ripple_cards
    where twin_key is not null and parent_card_id is not null
    group by 1, 2, 3
    having count(*) > 1
  ) d;
  if dupes > 0 then
    raise exception '0024: % theme(s) hold two copies of one implication; remove one copy from each before adding the unique index. Find them with: select code, parent_card_id, twin_key, count(*) from ripple_cards where twin_key is not null and parent_card_id is not null group by 1,2,3 having count(*) > 1;', dupes;
  end if;
end $$;

create unique index if not exists ripple_cards_one_twin_per_theme_idx
  on public.ripple_cards (code, parent_card_id, twin_key)
  where twin_key is not null and parent_card_id is not null;

comment on index public.ripple_cards_one_twin_per_theme_idx is
  'An implication appears at most once in a theme: copies of one implication (twin_key) cannot share a parent. Routes translate the 23505 to a 409.';
