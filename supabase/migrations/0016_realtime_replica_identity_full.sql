-- 0016 — Realtime DELETE propagation fix (REPLICA IDENTITY FULL).
--
-- Live tables are subscribed from the browser with the realtime filter
-- code=eq.{CODE} (components/workshop/hooks.ts). Postgres logical replication
-- only emits the columns in a table's REPLICA IDENTITY in the OLD record on
-- DELETE; the default (primary key = id) omits `code`, so the code=eq filter
-- drops every DELETE event server-side. INSERT/UPDATE carry the full NEW row
-- with code and propagate fine. REPLICA IDENTITY FULL makes the OLD record on
-- DELETE carry all columns (incl. code) so the filter matches and deletes
-- broadcast to other tabs.
--
-- Idempotent; apply to BOTH dev (xpcmeskbqdapzmqcfnas) and prod (ratkqnumupciffxnsbhk).

do $$
declare
  t text;
begin
  foreach t in array array[
    'sessions', 'teams', 'submissions', 'responses',
    'ripple_teams', 'ripple_players', 'ripple_cards', 'ripple_chips', 'ripple_card_votes'
  ] loop
    execute format('alter table public.%I replica identity full', t);
  end loop;
end $$;
