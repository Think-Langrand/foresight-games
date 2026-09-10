-- 0015 — Manual "closed" availability gate for design-group exercises.
--
-- `locked` (0012) makes a week read-only but still openable/viewable (participants
-- review the finalized answers). It does NOT hide a week. Admins also need to keep a
-- week UNAVAILABLE — before it opens, or re-closed after — independent of the lock and
-- of the opens_at schedule. `closed` is that manual, reversible flag: closed = members
-- can't open it at all (admins can still preview); does not touch the session phase.
--
-- Gate precedence (lib/exercise-types.ts exerciseStatus): placeholder → closed →
-- scheduled → locked → open.
alter table public.design_group_exercises
  add column if not exists closed boolean not null default false; -- admin close; members can't open
