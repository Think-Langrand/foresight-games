-- 0013_exercise_sections.sql
--
-- Per-exercise, admin-editable worksheet QUESTIONS. Until now a worksheet's sections
-- (its questions / brainstorm areas) were hard-coded in lib/exercise-types.ts and shared
-- by every project. This moves them to the DB as a jsonb snapshot on each exercise, so an
-- admin can build a new "week" and edit its questions per project.
--
-- Shape: an array of WorksheetSection objects (see lib/exercise-types.ts) —
--   { key, kind: 'brainstorm'|'question', label, step?, group?, help?, board? }
-- The `key` is a permanent id also written onto ripple_cards.section (the answer link),
-- so keys are minted once and never renamed; deleting a question just drops it from the
-- array (its answer cards remain, unrendered).
--
-- Default '[]' means "not customized" → the renderer falls back to the code template
-- (getExerciseType(type).sections), so every pre-migration week keeps working unchanged.

alter table public.design_group_exercises
  add column if not exists sections jsonb not null default '[]'::jsonb;
