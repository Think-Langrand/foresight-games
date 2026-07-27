-- 0004 — Facilitator judgement tags for the Analysis view.
--
-- Tone (hopeful | dark) and scenario family (free-text bucket, e.g. "Localized
-- trust") are qualitative calls a facilitator makes while reviewing submitted
-- kernels in the Analysis view (§5). Both are nullable — the analysis UI degrades
-- gracefully when they're absent — and are only ever written from that view,
-- never during play.
--
-- Written idempotently: a no-op on projects that already have the columns.

alter table public.teams
  add column if not exists tone text,
  add column if not exists family text;

-- Guard tone to the two known values (family stays free-text).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'teams_tone_check'
  ) then
    alter table public.teams
      add constraint teams_tone_check check (tone in ('hopeful', 'dark'));
  end if;
end $$;
