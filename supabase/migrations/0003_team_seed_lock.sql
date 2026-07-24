-- 0003 — Admin-assigned seed outcomes.
--
-- Lets a facilitator pre-create teams on the projector screen and lock each
-- team's slot-1 outcome in advance (breakout-room setup). When `seed_locked`
-- is true, both `seed_uncertainty_id` and `seed_card_id` were set by the
-- facilitator and the participant view shows slot 1 as locked (no re-pick).
--
-- Written idempotently: a no-op on projects that already have the column.

alter table public.teams
  add column if not exists seed_locked boolean not null default false;
