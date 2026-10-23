-- 0029 — "We are done with this week", said by the GROUP rather than by an admin.
--
-- Session 4 ends with a review step and a Submit control, and nothing on a shared board
-- could record that before this. The two existing flags are both ADMIN acts and neither
-- means what submit means:
--
--   locked  an admin moved the backing session to HARVEST. The board stops taking writes.
--   closed  an admin hid the week from members entirely.
--
-- Submit is the opposite shape: the GROUP says it has finished, and the board STAYS
-- EDITABLE. A group that spots a typo in its own handoff an hour later must be able to fix
-- it without asking anyone to unlock anything, so submit deliberately gates nothing. It is
-- a signal to the facilitator, not a lock, and it is undoable from the same control.
--
-- The solo path already has a submit (ripple_submissions, written by submitAnswers in
-- lib/ripples.ts) and it is the wrong table twice over: it is keyed by ripple_players.id,
-- so it records that ONE PERSON submitted, and a shared board's submit is a statement
-- about the whole week. Hence two columns on the week itself.
--
-- submitted_by is TEXT, not a reference to ripple_players, on purpose. It holds the display
-- name of whoever pressed the button, captured at that moment. An FK would be tidier and
-- would also lose the record: an admin board reset deletes the player rows, and "submitted
-- 30 Oct by (nobody)" is worse than no attribution at all. Nothing joins on this column; it
-- is shown to a facilitator and written to the CSV.
--
-- Idempotent; apply to BOTH dev (xpcmeskbqdapzmqcfnas) and prod (ratkqnumupciffxnsbhk).

alter table public.design_group_exercises
  add column if not exists submitted_at timestamptz,
  add column if not exists submitted_by text;

comment on column public.design_group_exercises.submitted_at is
  'When the GROUP pressed Submit on its review step. Null = not submitted. Deliberately does not lock the board: see locked/closed for the admin acts that do.';

comment on column public.design_group_exercises.submitted_by is
  'Display name of whoever pressed Submit, captured at that moment. Text and not an FK so the record survives an admin board reset deleting the player row.';
