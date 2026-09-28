-- 0020 — A ripple card's KIND and PARKED flag (Session 3, Synthesis).
--
-- Week 3 runs on one shared board whose tree holds three different things, all told
-- apart by card_kind alone:
--   null            — an implication. Seeded from Week 2 as a FIRST root (0017/0018),
--                     then re-parented under a theme (becoming SECOND) when clustered.
--   'theme'         — a participant-created cluster heading. Always a FIRST root.
--   'hope' / 'fear' — a chain card under a theme, alternating with its flip side
--                     (a fear spawns a hope, a hope spawns a fear), arbitrarily deep.
--
-- A theme therefore carries implication children AND hope/fear children at the SAME
-- depth; only this column tells them apart, which is why the hopes & fears step walks a
-- kind-filtered subgraph (chainDepth in lib/synthesis-shape.ts) rather than depthByCard.
--
-- Every pre-existing row keeps null, so nothing needs backfilling.
--
-- `parked` is Week 3's "set aside without deleting" tray. It is deliberately NOT the
-- existing `greyed` column: greyed is the CHALLENGE mechanic's output (0007), and
-- overloading it would let a challenge majority silently park a group's cards if that
-- mechanic were ever enabled on a design-group board. Two flags, two meanings.
--
-- No CHECK constraint on card_kind: ripple_cards deliberately carries none (see the
-- card_order note in 0007) so lib/ stays the single source of truth. The vocabulary is
-- CARD_KINDS in lib/ripples-types.ts, enforced by the POST/PATCH card routes.
--
-- No publication change needed: ripple_cards is already in supabase_realtime with
-- REPLICA IDENTITY FULL (0016), and a per-table publication picks up new columns
-- automatically, so a kind/parked change broadcasts with no new wiring.

alter table public.ripple_cards
  add column if not exists card_kind text;

alter table public.ripple_cards
  add column if not exists parked boolean not null default false;

-- Every Week 3 selector filters by code + kind.
create index if not exists ripple_cards_code_kind_idx
  on public.ripple_cards(code, card_kind);
