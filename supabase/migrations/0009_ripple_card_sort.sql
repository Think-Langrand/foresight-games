-- 0009 — Implication mapping: a sort key for draggable brainstorm stickies.
--
-- Brainstorm notes are STICKY-order ripple_cards (independent of the tree). `sort`
-- orders them within the wrap-flow and is updated on drag-reorder. Tree cards keep
-- the default 0 and order by created_at. Additive; realtime picks up the column.

alter table public.ripple_cards
  add column if not exists sort double precision not null default 0;
