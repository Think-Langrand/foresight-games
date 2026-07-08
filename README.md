# Future of Public Health — Foresight Workshop

An interactive foresight model **and** a live participatory workshop tool for NNPHI's
"Future of Public Health" work (horizon ~2035). Built with Next.js (App Router) and wired
live to the NNPHI Airtable base.

Two experiences:

- **Explore** (`/explore`) — browse the 22 drivers, their uncertainties, the outcomes each
  can resolve into, alignment, and loop impacts on the systems maps. Includes a neutral-framing
  toggle and top-ranked filter.
- **Workshop** (`/workshop`) — open any uncertainty as a live session. Participants join on
  their phones by a short code and either **diverge** (write their own ways it could play out,
  then upvote the sharpest) or **converge** (react to the pre-authored outcomes: how plausible,
  how good or bad). Everything writes to Airtable and shows live on a projection screen.

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
  airtable.ts                  # server-only Airtable REST client (list/create/update)
  model.ts                     # assembles the nested model from Airtable, seed fallback
  workshop.ts                  # server-only: sessions, submissions, responses, aggregation
  workshop-types.ts            # client-safe workshop domain types
data/model.seed.json           # bundled snapshot, used if Airtable is unavailable
docs/                          # ORIGINAL project: model.json source, strategic standard,
                               #   systems maps, and the legacy single-file explorer
```

**Data source.** The foresight content is read live from Airtable (base `appJbrDG28mXRJgfA`)
and cached ~5 min; if the key is missing or a read fails, the app falls back to
`data/model.seed.json` so it always renders. Workshop input is written to (and aggregated
live from) three tables the app created in that base:

- **Workshop Sessions** — one row per live session (code, uncertainty, mode, status, prompt).
- **Workshop Submissions** — participant-generated "ways it could play out" (+ lean, upvotes).
- **Workshop Responses** — every vote/reaction/poll answer (upvotes, outcome reactions, polls).

Live updates use short polling with a server-side single-flight cache (1.5s TTL) so many
phones polling at once collapse into ~1 Airtable read/session/second, well within rate limits.

## Environment

Create `.env.local` (or set these in your host):

```
AIRTABLE_TOKEN=pat_xxx…        # PAT with data.records:read+write, schema.bases:read on the base
AIRTABLE_BASE_ID=appJbrDG28mXRJgfA
```

`AIRTABLE_API_KEY` is also accepted as a fallback name. See `.env.example`.

## Run

```
npm install
npm run dev        # http://localhost:3000
```

## Editing the foresight content

The model still lives in Airtable and in `docs/data/model.json` (the original export). See
`docs/CLAUDE.md` and `docs/strategic-standard.md` for the writing standard. To refresh the
bundled fallback snapshot after Airtable edits, re-export and copy over `data/model.seed.json`.
