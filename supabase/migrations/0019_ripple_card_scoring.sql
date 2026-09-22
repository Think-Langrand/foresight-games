-- 0019 — Key changes carry ONE shared group ranking (plausibility × impact).
--
-- Session 2 (Implication Mapping) now opens with a RANK step: the group scores each of
-- its key changes 1–5 on PLAUSIBILITY and 1–5 on IMPACT, then maps the implications in
-- rank order. There is exactly ONE score per key change — a decision the group reaches
-- together, NOT an average of per-member votes — so the scores live as two columns on
-- the card itself rather than in a votes table.
--   plausibility — 1..5; null = not yet scored.
--   impact       — 1..5; null = not yet scored.
--
-- Only tree ROOTS (the key changes) are ever scored; the columns stay null on
-- implications, brainstorm stickies and worksheet answer cards. Nothing is stored for
-- the ranking itself — it is derived from the two axes (lib/ripples-scoring.ts), so a
-- re-score re-ranks every view with no second write.
--
-- No CHECK constraint on the range: ripple_cards deliberately carries none (see the
-- card_order note in 0007) so lib/ stays the single source of truth. The 1..5 range is
-- decided in lib/ripples-scoring.ts (coerceScore) and enforced by the PATCH route
-- (app/api/sessions/[code]/ripples/cards/[cardId], action "score").
--
-- No publication change needed: ripple_cards is already in supabase_realtime with
-- REPLICA IDENTITY FULL (0016), and a per-table publication includes new columns
-- automatically (0007), so a score broadcasts to every open board with no new wiring.
--
-- Idempotent; apply to BOTH dev (xpcmeskbqdapzmqcfnas) and prod (ratkqnumupciffxnsbhk).

alter table public.ripple_cards
  add column if not exists plausibility smallint,
  add column if not exists impact       smallint;
