# Carmelita Scenario API — integration guide

**For:** the team building the external **scenario display app**.
**Owner:** Carmelita / Foresight Scanner platform team.
**Status:** implemented and live.

This is a read-only HTTP API for pulling a project's **published foresight
scenarios** — the divergent future-worlds, their prose, card metadata, and
images — so you can render them in your own UI however you like. It is
server-to-server and authenticated with a shared API key.

---

## 1. Base URL & config

| Environment | Base URL |
| --- | --- |
| Local dev   | `http://localhost:8000/api/v1/foresight` |
| Production  | `https://<platform-host>/api/v1/foresight` _(confirm host with the platform team)_ |

Configure two values in your app (server-side env):

```
FORESIGHT_API_URL=http://localhost:8000/api/v1/foresight
FORESIGHT_API_KEY=<shared secret from the platform team>
```

Every path below is relative to `FORESIGHT_API_URL`.

> **Running your app inside Docker on the same host?** Use
> `http://<backend-service-name>:8000/api/v1/foresight` instead of `localhost`
> (inside a container, `localhost` is the container itself).

---

## 2. Authentication

Send the key on **every** request as a header:

```
X-Foresight-Key: <FORESIGHT_API_KEY>
```

- **Call this API from your server only.** Never ship the key to the browser.
  Fetch in a route handler / server component / API route, then pass rendered
  data (or a same-origin proxy response) to the client.
- Missing or wrong key → **`401`** (the response never reveals which).

---

## 3. Identifying a project (`{ref}`)

The `{ref}` path segment accepts **either the project UUID or its slug**:

- `…/projects/nnphi/…` (slug — human-readable, nice in URLs)
- `…/projects/2f9c…-uuid/…` (UUID — never changes)

**Recommendation:** let users type/see the **slug**, but **store the UUID** as
the canonical reference you persist — a slug *can* be renamed by an admin, a UUID
cannot. Project **name is not a valid lookup key** (names aren't unique).

Unknown project → **`404`**.

---

## 4. The fetch model: list → detail

Scenarios carry a large Markdown `body`, a rich `sections` bag, and an image
gallery. To keep grids fast, **lists return lightweight cards; only the
single-scenario endpoint returns the full payload.**

```
1. GET /projects/{ref}/scenario-sets            → set summaries      (pick a set)
2. GET /projects/{ref}/scenario-sets/{setId}    → set + scenario CARDS (render grid)
3. GET /projects/{ref}/scenarios/{scenarioRef}  → FULL scenario      (render one)
```

Fetch (3) lazily — when a user opens a scenario — not for every card up front.

---

## 5. Endpoints

### 5.1 List scenario sets

```
GET /projects/{ref}/scenario-sets
```

Published sets for the project, as summaries. Sets that are deleted or have **no
published scenarios** are omitted. Returns `200` with an array (possibly empty).

```jsonc
[
  {
    "id": "99ed9ea5-eae9-4a66-a40d-2f34964982a5",
    "domain": "The Future of Public Health",
    "horizonYear": 2035,
    "format": "appendix",
    "sharedUncertainties": [
      { "axis": "Where trust lives", "outcomes": ["Local", "Institutional"], "resolution": "" }
    ],
    "scenarioCount": 4,
    "updatedAt": "2026-08-05T14:22:10"
  }
]
```

### 5.2 Get one scenario set (with cards)

```
GET /projects/{ref}/scenario-sets/{setId}
```

`{setId}` is the `id` (UUID) from 5.1. Returns the set plus its scenarios as
**cards**. `404` if the set is deleted or has no published scenarios.

```jsonc
{
  "id": "99ed9ea5-eae9-4a66-a40d-2f34964982a5",
  "domain": "The Future of Public Health",
  "horizonYear": 2035,
  "format": "appendix",
  "sharedUncertainties": [ /* as above */ ],
  "scenarios": [
    {
      "id": "local-witness-mesh",          // slug — use this as scenarioRef in 5.4
      "setId": "99ed9ea5-…",
      "position": 0,
      "title": "The Local Witness Mesh",
      "headline": "Trust re-roots in neighbourhoods as national institutions recede.",
      "teaser": "A two-paragraph setup shown above the fold…",
      "theme": { "slug": "decentralization", "label": "Decentralization" },
      "mood": { "label": "Guarded hope", "colorHex": "#2E7D6B", "emotionalRegister": "resolute" },
      "icon": "network",
      "timeHorizon": { "year": 2035, "label": "2035" },
      "coverImageUrl": "https://…signed…/cover.png",   // may be null; expires (see §7)
      "updatedAt": "2026-08-05T14:22:10"
    }
  ]
}
```

### 5.3 List scenarios (flat, cards)

```
GET /projects/{ref}/scenarios
GET /projects/{ref}/scenarios?set_id={setId}
```

All published scenarios for the project as **cards** (same shape as
`scenarios[]` in 5.2), ordered by set position. Optional `set_id` scopes to one
set. Useful if you want one flat grid across sets. Returns `200` + array.

### 5.4 Get one scenario (full)

```
GET /projects/{ref}/scenarios/{scenarioRef}
```

`{scenarioRef}` is the scenario **slug** (the card's `id`, preferred) or its
UUID. Returns the **full** payload. `404` if not published.

```jsonc
{
  "id": "local-witness-mesh",
  "setId": "99ed9ea5-…",
  "title": "The Local Witness Mesh",
  "headline": "Trust re-roots in neighbourhoods as national institutions recede.",
  "teaser": "A two-paragraph setup…",
  "theme": { "slug": "decentralization", "label": "Decentralization" },
  "mood": { "label": "Guarded hope", "colorHex": "#2E7D6B", "emotionalRegister": "resolute" },
  "icon": "network",
  "timeHorizon": { "year": 2035, "label": "2035" },
  "format": "appendix",
  "body": "# The Local Witness Mesh\n\nBy 2035, …",     // Markdown
  "openQuestion": "Who arbitrates when two neighbourhood meshes disagree?",
  "earlySignals": [
    {
      "statement": "Cities piloting resident-run health data trusts.",
      "sources": [ { "url": "https://example.org/article", "label": "Example News" } ]
    }
  ],
  "images": [
    { "url": "https://…signed…/1.png", "prompt": "a mesh of…", "position": 0, "source": "generated" }
  ],
  "linkedDrivers": [
    { "driverId": "8c1f…-uuid", "name": "Trust Recession" }
  ],
  "linkedUncertainties": [
    { "uncertaintyId": "b2a0…-uuid", "title": "Where trust lives", "resolution": "Local" }
  ],
  "sections": {
    "governing_settlement": "…", "lived_moment": "…"      // interim rich prose; keys not final (see §6)
  },
  "updatedAt": "2026-08-05T14:22:10"
}
```

---

## 6. Field reference

**ScenarioSetSummary** — `id` (uuid), `domain` (the set's display title),
`horizonYear`, `format` (`appendix` | `compact`), `sharedUncertainties[]`,
`scenarioCount`, `updatedAt` (ISO 8601, no timezone suffix).

**ScenarioCard** — `id` (slug), `setId`, `position`, `title`, `headline`,
`teaser`, `theme`, `mood`, `icon`, `timeHorizon`, `coverImageUrl`, `updatedAt`.

**Scenario (full)** — everything on the card **minus** `coverImageUrl`, **plus**
`format`, `body` (Markdown), `openQuestion`, `earlySignals[]`, `images[]`,
`linkedDrivers[]`, `linkedUncertainties[]`, `sections`.

**Shared sub-objects**

| Object | Shape |
| --- | --- |
| `theme` | `{ slug, label }` |
| `mood` | `{ label, colorHex, emotionalRegister }` |
| `timeHorizon` | `{ year, label }` |
| `sharedUncertainties[]` | `{ axis, outcomes: string[], resolution }` |
| `earlySignals[]` | `{ statement, sources: [{ url, label }] }` |
| `images[]` | `{ url, prompt, position, source }` — `source` is `uploaded` \| `generated` |
| `linkedDrivers[]` | `{ driverId, name }` |
| `linkedUncertainties[]` | `{ uncertaintyId, title, resolution }` |

Notes:
- `sections` is a **flexible object** of rich house-style prose keyed by section
  slug (e.g. `governing_settlement`, `lived_moment`, `blind_spot`). **Keys and
  shapes are not final** — render defensively (iterate keys; treat values as
  string or small object). Don't hard-code a fixed set of keys yet.
- `icon` is a short string name (a Lucide-style icon id). Map it to your own
  icon set, with a fallback.
- `body` is **Markdown** — render with your Markdown component of choice.

---

## 7. Images: signed URLs expire ⚠️

`coverImageUrl` and `images[].url` are **time-limited signed URLs generated at
read time**. They will 403 after they expire.

- **Do not persist these URLs.** Re-fetch the scenario (5.2 / 5.4) to get fresh
  ones when you render.
- If you need durable image copies (CDN, caching), **download the bytes
  server-side** right after fetching and re-host them yourself.
- `coverImageUrl` / `url` may be `null` if a scenario has no image or signing is
  unavailable — always guard.

---

## 8. "Published" semantics (why the API is safe to render directly)

You only ever receive **approved, non-deleted** scenarios. Draft/pending/rejected
scenarios, soft-deleted scenarios, and soft-deleted sets are filtered out
server-side, and a set with nothing published won't appear at all. So anything
this API returns is cleared for display — no extra status-checking needed on
your side.

---

## 9. Errors

| Status | Meaning |
| --- | --- |
| `401` | Missing or invalid `X-Foresight-Key`. |
| `404` | Unknown project ref; deleted/empty set; unpublished or unknown scenario. |
| `422` | Malformed value in a UUID-typed slot (e.g. a non-UUID `setId`, or a non-UUID `set_id` query). Project `{ref}` and scenario `{scenarioRef}` accept slugs, so they don't 422. |

Error bodies follow FastAPI's shape: `{ "detail": "…" }`.

---

## 10. Example: server-side fetch (TypeScript / Next.js)

```ts
// lib/foresight.ts — server-only. Do NOT import from client components.
const BASE = process.env.FORESIGHT_API_URL!;
const KEY = process.env.FORESIGHT_API_KEY!;

async function foresight<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "X-Foresight-Key": KEY },
    // scenarios change rarely; cache and revalidate as suits your app
    next: { revalidate: 300 },
  });
  if (!res.ok) throw new Error(`Foresight ${res.status} on ${path}`);
  return res.json() as Promise<T>;
}

export const getScenarioSets = (ref: string) =>
  foresight<ScenarioSetSummary[]>(`/projects/${ref}/scenario-sets`);

export const getScenarioSet = (ref: string, setId: string) =>
  foresight<ScenarioSet>(`/projects/${ref}/scenario-sets/${setId}`);

export const getScenario = (ref: string, scenarioRef: string) =>
  foresight<Scenario>(`/projects/${ref}/scenarios/${scenarioRef}`);
```

Quick curl smoke test:

```bash
curl -s -H "X-Foresight-Key: $FORESIGHT_API_KEY" \
  "$FORESIGHT_API_URL/projects/nnphi/scenario-sets" | jq
```

---

## 11. Not available yet / roadmap

- **Project discovery.** There is no keyed "list all projects" endpoint yet — you
  must already know the project ref (put it in your route/config for now). If you
  want a picker, ask the platform team to add
  `GET /projects` (returns `{ ref, slug, name, scenarioSetCount }[]`) — it's a
  small addition.
- **Pagination.** None — sets/scenarios per project are small. Assume the full
  list comes back in one response.
- **Webhooks / push.** None. Poll or rely on your own cache revalidation; content
  changes infrequently.
