-- 0026 — Deleting a Week 3 card, in one transaction.
--
-- Two checks the delete route used to make as separate requests, each racing the delete
-- it guarded:
--
--   1. A theme must not be deleted while an implication still hangs off it (the parent
--      FK cascades, 0007). Checked with a read, then deleted: an implication clustered
--      into the theme between the two went with it.
--   2. Of an implication's copies (0023) only one row carries the Week 2 link
--      (source_card_id). Deleting that row hands the link to a sibling first; the sibling
--      could be deleted by another request between being chosen and being written.
--
-- Here both happen inside one function call, so one transaction. The card row is locked
-- FOR UPDATE first: a concurrent insert or reparent of a child takes FOR KEY SHARE on the
-- parent through the FK, which conflicts with FOR UPDATE, so it waits until this commits
-- (and then fails its own FK check, since the parent is gone) rather than slipping in
-- between the count and the delete. The sibling that takes the link is locked too
-- (SKIP LOCKED: one being deleted by another request is simply not chosen).
--
-- Returns jsonb rather than raising, so the route can answer 409 with the count:
--   { "ok": true,  "gone": true }            — the card was already deleted
--   { "ok": false, "held": N }               — a theme still holding N implications
--   { "ok": true,  "movedSourceTo": <uuid> } — deleted; the link went to that sibling (or null)
create or replace function public.delete_ripple_card(p_code text, p_card_id uuid)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_card   public.ripple_cards%rowtype;
  v_held   int;
  v_sib    uuid;
begin
  select * into v_card
  from public.ripple_cards
  where code = upper(p_code) and id = p_card_id
  for update;
  if not found then
    return jsonb_build_object('ok', true, 'gone', true);
  end if;

  if v_card.card_kind = 'theme' then
    select count(*) into v_held
    from public.ripple_cards
    where code = v_card.code and parent_card_id = v_card.id and card_kind is null;
    if v_held > 0 then
      return jsonb_build_object('ok', false, 'held', v_held);
    end if;
  end if;

  if v_card.twin_key is not null and v_card.source_card_id is not null then
    select id into v_sib
    from public.ripple_cards
    where code = v_card.code and twin_key = v_card.twin_key and id <> v_card.id
    order by created_at
    for update skip locked
    limit 1;
    if v_sib is not null then
      update public.ripple_cards set source_card_id = null where id = v_card.id;
      update public.ripple_cards set source_card_id = v_card.source_card_id where id = v_sib;
    end if;
  end if;

  delete from public.ripple_cards where id = v_card.id;
  return jsonb_build_object('ok', true, 'movedSourceTo', v_sib);
end
$$;

comment on function public.delete_ripple_card(text, uuid) is
  'Delete one Week 3 card atomically: refuses a theme that still holds implications (returns ok=false, held=N) and hands a twin''s Week 2 link to a surviving sibling before deleting.';
