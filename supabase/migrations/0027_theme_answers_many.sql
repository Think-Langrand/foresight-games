-- 0027 — A theme's four questions each take several answers.
--
-- 0025 made every "question" card kind a singleton under its parent, because the board, the
-- admin panel, the CSV and the summary all read "the first card of that kind" and a second
-- row was silently never shown. For step 2's four questions that cure is now worse than the
-- disease: three people in a breakout have three readings of "who benefits, and how?", and
-- the rule made the second and third either a 409 or a fight over one textarea.
--
-- The readers now return every card of these kinds, in board order, so the four questions
-- accumulate answers exactly as Week 1's question sections do. The remaining nine kinds are
-- genuinely one-per-parent (a hope's "who does this concern", and the retired steps' answers
-- older boards still carry), so they keep the index — same name, narrower predicate, so the
-- routes' 23505-to-409 translation still means what it says.
drop index if exists public.ripple_cards_one_answer_per_question_idx;

create unique index if not exists ripple_cards_one_answer_per_question_idx
  on public.ripple_cards (code, parent_card_id, card_kind)
  where parent_card_id is not null
    and card_kind in ('concerns','condition','alternative','test','assumed_role','question',
                      'reading','desired_role','investigate');

comment on index public.ripple_cards_one_answer_per_question_idx is
  'The still-singleton question kinds cannot repeat under one parent: a hope or fear''s "concerns", part B''s condition/alternative/test, and the retired steps'' answers. Routes translate the 23505 to a 409. Step 2''s benefit/cost/experience/mechanism are deliberately absent — each of those takes several answers (0027).';
