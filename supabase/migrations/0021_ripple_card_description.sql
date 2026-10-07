-- 0021 — An optional longer note on a card, beside its text.
--
-- Week 3 themes carry a name (ripple_cards.text) and, optionally, a sentence or two saying
-- what the group means by it — the kind of thing that decides whether a borderline
-- implication belongs in this theme or the next one. That does not belong in `text`: the
-- name is what every compact view shows, and a paragraph would wreck the cluster columns,
-- the chain nodes and the answer sheet alike.
--
-- Generic rather than theme-specific on purpose. Nothing else sets it yet, and every
-- existing row stays null.
--
-- No CHECK and no length limit in the database: lib/ripples-types.ts holds the bound
-- (CARD_DESCRIPTION_MAX), the same way CARD_TEXT_MAX is enforced in the route rather than
-- the schema.

alter table public.ripple_cards
  add column if not exists description text;
