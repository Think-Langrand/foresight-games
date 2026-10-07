-- 0022 — A card the group has picked out to explain to the committee (Session 3, step 4).
--
-- Week 3 ends by choosing the three risks and three opportunities most worth explaining.
-- That is a property of the card itself, so it lives on the card rather than in a copy.
--
-- Deliberately its own column rather than any of the three that already exist:
--   `flagged` — the CHALLENGE mechanic's (flagCard / voteCard). Same argument 0020 makes
--               for not reusing `greyed` for the parked tray.
--   `sort`    — already the card's position within its theme's risk or opportunity list.
--               The shortlist is a CROSS-theme selection; one column cannot carry both
--               orderings, and overloading it would wreck the list the group just ordered.
--   plausibility / impact — Week 2's 1-5 rank axes, gated on config.scoringEnabled and
--               refused on anything that is not a tree root.
--
-- No rank column yet. The shortlist displays in (theme order, list order), both of which
-- the group already controls by dragging in step 2. If 1-2-3 ranking is ever wanted it is
-- a clean additive `shortlist_rank smallint null`; do not pre-build it.
--
-- No index: a board is read whole (`select * from ripple_cards where code = ?`) and the
-- shortlist is computed client-side from the array already in hand.
--
-- Idempotent; apply to BOTH dev (xpcmeskbqdapzmqcfnas) and prod (ratkqnumupciffxnsbhk).

alter table public.ripple_cards
  add column if not exists shortlisted boolean not null default false;
