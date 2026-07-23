# Future of Public Health — Foresight Workshop

An interactive foresight model **and** a live participatory workshop tool for NNPHI's
"Future of Public Health" work (horizon ~2035). Built with Next.js (App Router) and backed
by Supabase (live workshop state + game content).

Two experiences:

- **Explore** (`/explore`) — browse the 22 drivers, their uncertainties, the outcomes each
  can resolve into, alignment, and loop impacts on the systems maps. Includes a neutral-framing
  toggle and top-ranked filter.
- **Workshop** (`/workshop`) — open any uncertainty as a live session. Participants join on
  their phones by a short code and either **diverge** (write their own ways it could play out,
  then upvote the sharpest) or **converge** (react to the pre-authored outcomes: how plausible,
  how good or bad). Everything writes to Supabase and shows live on a projection screen.

## Architecture

```
app/
  page.tsx                     # landing / entry hub
  explore/                     # Explore view (server loads model -> ExploreClient)
  workshop/                    # workshop landing, new-session setup, session pages
    s/[code]/                  # participant view
    s/[code]/present/          # facilitator / projection view
  api/sessions/…               # create session, get live results, add submissions/responses
components/                     # Mark, Poles, OutcomeBlock, explore/, workshop/
lib/
  types.ts                     # foresight model types
  ui.ts                        # client-safe color maps
  supabase.ts                  # server-only client (service_role; bypasses RLS)
  supabase-browser.ts          # browser client (anon key; realtime only)
  cards.ts                     # deck + shared uncertainties (Supabase, seed fallback)
  drivers.ts                   # slide drivers (Supabase, seed fallback)
  model.ts                     # nested Explore model + derived scenarios (Supabase, seed fallback)
  workshop.ts                  # server-only: sessions, submissions, responses, aggregation
  workshop-types.ts            # client-safe workshop domain types
  airtable.ts                  # legacy Airtable REST client — no longer used at runtime
supabase/migrations/           # schema (live state, drivers, deck, content) — reproducible
scripts/seed-supabase.mjs      # seed the content tables from data/*.seed.json
data/*.seed.json               # bundled snapshots, used if the database is unavailable
docs/                          # ORIGINAL project: model.json source, strategic standard, maps
```

**Data source.** All content and live state is in Supabase (project `ratkqnumupciffxnsbhk`):

- **sessions / teams / submissions / responses** — live workshop state. Writes go through the
  server (service_role key); the browser subscribes via Supabase **realtime** for live updates,
  degrading to an 8s poll if the anon key is absent.
- **uncertainties / card_outcomes** — the 13 scenario uncertainties × 52 outcome cards (the deck).
- **drivers** — the 14 curated slide drivers.
- **content['model']** — the nested Explore model (drivers → uncertainties → outcomes → loops).

Every read falls back to the bundled `data/*.seed.json` snapshots if the database is
unavailable, so the app always renders. Airtable is no longer used at runtime (the client and
`scripts/setup-cards-airtable.mjs` remain for optional future content re-imports).

## Environment

Create `.env.local` (or set these in your host). See `.env.example`.

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_xxx   # public; inlined into the client bundle
SUPABASE_SERVICE_ROLE_KEY=eyJ…                     # server-only secret; never exposed
```

> `NEXT_PUBLIC_*` vars are read at **build time**. On any host, set them before building and
> redeploy (clear build cache) after changing them, or browser realtime silently falls back to
> polling.

## Run

```
npm install
npm run db:seed    # one-time: seed Supabase content tables from data/*.seed.json
npm run dev        # http://localhost:3000
```

## Deploy

Deployed on Render (see `render.yaml`). The database is provisioned via the committed
migrations:

```
supabase/migrations/0001_live_state_and_drivers.sql   # sessions, teams, submissions, responses, drivers + RLS + realtime
supabase/migrations/0002_content_deck_and_model.sql   # uncertainties, card_outcomes, content
```

On a fresh Supabase project: run both migrations, then `npm run db:seed`, then set the three
env vars above on the host and deploy.

## Editing the foresight content

Deck and drivers are editable rows in Supabase (`uncertainties`, `card_outcomes`, `drivers`);
the nested Explore model lives in `content['model']`. Re-running `npm run db:seed` upserts all
of them from `data/*.seed.json`, which remain the version-controlled source of truth. See
`docs/CLAUDE.md` and `docs/strategic-standard.md` for the writing standard.
