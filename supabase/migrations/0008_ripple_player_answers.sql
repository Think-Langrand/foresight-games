-- 0008 — Implication-mapping: per-player reflection answers + submit marker.
--
-- After the three rounds of implications, each player answers the reflection
-- questions (config.questions) and submits. Answers are stored per player as a
-- jsonb map { "<questionIndex>": "<answer>" }; submitted_at marks completion.
-- Additive + nullable; the realtime publication is per-table so the new columns
-- appear in change payloads automatically.

alter table public.ripple_players
  add column if not exists answers      jsonb not null default '{}'::jsonb,
  add column if not exists submitted_at timestamptz;
