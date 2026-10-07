-- 0025 — One answer per question, enforced by the database.
--
-- Week 3 writes several card kinds that are by design ONE per parent: a theme's four
-- exploration answers (benefit, cost, experience, mechanism), a hope or fear's "who does
-- this concern" (concerns), and the retired steps' per-theme answers older boards still
-- carry. The board, the admin panel, the CSV and the summary all read "the first card of
-- that kind" — so when two members answered the same question at the same moment, both
-- rows were written and the second was silently never shown anywhere.
--
-- The routes refuse a second answer with a 409 and the client refreshes to show the one
-- that landed; this index makes that hold whatever the timing. The many-per-parent kinds
-- (risk, opportunity, tension, assumption, hope, fear) and themes are deliberately NOT
-- listed. Partial on parent_card_id: the retired role step's board-level roots are not
-- written any more and are read first-wins.
do $$
declare
  dupes int;
begin
  select count(*) into dupes from (
    select code, parent_card_id, card_kind
    from public.ripple_cards
    where parent_card_id is not null
      and card_kind in ('benefit','cost','experience','mechanism','concerns','condition',
                        'alternative','test','assumed_role','question','reading',
                        'desired_role','investigate')
    group by 1, 2, 3
    having count(*) > 1
  ) d;
  if dupes > 0 then
    raise exception '0025: % question(s) hold two answers; keep one of each before adding the unique index. Find them with: select code, parent_card_id, card_kind, count(*) from ripple_cards where parent_card_id is not null and card_kind in (''benefit'',''cost'',''experience'',''mechanism'',''concerns'',''condition'',''alternative'',''test'',''assumed_role'',''question'',''reading'',''desired_role'',''investigate'') group by 1,2,3 having count(*) > 1;', dupes;
  end if;
end $$;

create unique index if not exists ripple_cards_one_answer_per_question_idx
  on public.ripple_cards (code, parent_card_id, card_kind)
  where parent_card_id is not null
    and card_kind in ('benefit','cost','experience','mechanism','concerns','condition',
                      'alternative','test','assumed_role','question','reading',
                      'desired_role','investigate');

comment on index public.ripple_cards_one_answer_per_question_idx is
  'A question on a theme, hope or fear has one answer card: the singleton card kinds cannot repeat under one parent. Routes translate the 23505 to a 409.';
