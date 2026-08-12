# Integration data-model contract

**Audience:** the internal foresight-platform team (Next.js + Python backend).
**Purpose:** document the data shapes the `foresight-games` app uses today, so we can
measure drift and agree on the shared contract before wiring the two systems together.

**Source of truth in this repo:** [`lib/types.ts`](../lib/types.ts),
[`lib/workshop-types.ts`](../lib/workshop-types.ts),
[`lib/analysis/types.ts`](../lib/analysis/types.ts), and
[`supabase/migrations/`](../supabase/migrations/).

## What we're building (overview)

`foresight-games` is a self-contained Next.js + Supabase app that turns a foresight
model into a **card game**: players are dealt outcome cards, pick three (one per
capability domain), and write a short scenario, "three cards, one world." Today it is
single-tenant, runs one client's content (NNPHI's "Future of Public Health"), and
carries its own copy of the foresight model.

We are integrating it with the larger foresight platform (this **thin Next.js frontend
+ Python backend**, the system of record, which today models **drivers only**) so the
game becomes a **per-client, semi-public play surface** driven by that platform:

- **Down (platform -> game):** for a given project, the platform supplies the drivers
  and the uncertainties/outcomes generated from them. The game turns that model into a
  deck the client plays. Content is authored and generated on the internal side, not
  in the game.
- **Up (game -> platform):** every world a client builds is normalized into a
  **kernel** and pushed back to the platform as structured scenario-building input.
- **Access:** clients reach a project's game by link plus a **per-project passphrase**
  (server-validated, no accounts). Each project is isolated from every other.

The result is one reusable game engine we can stand up per client/project, fed by and
feeding back into the foresight work in the main platform. This document is the
**data contract** between the two systems: what the game needs *from* the platform,
what it sends *back*, and which objects must line up for that to work.

### Who owns what (the boundary)

```
Python backend  ── system of record: drivers, uncertainties, outcomes, canonical scenarios
   ▲   │
   │   │  GET model (down)      POST kernels (up)
   │   ▼
Game app (this repo) ── per-project deck + play + capture, passphrase-gated
   │
   ▼
Supabase ── ephemeral live play state only (sessions, teams, submissions)
```

Rule: **Python owns canonical foresight objects; Supabase owns ephemeral live play
state; the game is a membrane that reads the model and writes captured worlds back.**

## How to read this

Objects are grouped by **who should own them** once integrated:

- **A. Canonical foresight objects** the internal app (Python) should own and serve.
  These are the alignment target: field-for-field agreement here is what removes drift.
- **B. Derived game objects** this app builds from A at read time. Game-internal, no
  alignment needed.
- **C. Live play state** that stays in this app's Supabase (ephemeral).
- **D. The kernel / harvest payload:** the up-flow contract, worlds clients build,
  pushed back for scenario synthesis.
- **E. The API contract** the internal app must expose.

Integration boundary rule: **Python owns canonical foresight objects; Supabase owns
ephemeral live play state; the game is a membrane that reads the model and writes
captured worlds back.**

---

## A. Canonical foresight objects (ALIGN THESE)

From [`lib/types.ts`](../lib/types.ts). These are TypeScript interfaces today; the
internal app models the equivalents (in Python and/or its DB). The **Alignment
checklist** at the end of this section lists the fields most likely to differ.

### Driver
```ts
interface Driver {
  id: string;
  name: string;
  theme: string;            // one of THEME_ORDER (below)
  headline: string;
  short: string;
  neutralHeadline: string;  // neutral-framing variant
  neutralReading: string;
  neutralName: string;
  topRight: boolean;        // "top-ranked" flag used by the Explore filter
  impact?: string;
  uncertainty?: string;
  uncertainties: Uncertainty[];
}
```

### Uncertainty
```ts
interface Uncertainty {
  id: string;
  label: string;
  question: string;
  poleA: string;            // the two opposing resolutions, as labels
  poleB: string;
  sharpest: boolean;        // flagged the "sharpest axis" / best scenario spine
  outcomes: Outcome[];
}
```

### Outcome
```ts
interface Outcome {
  id: string;
  label: string;
  direction: Direction;     // enum, below
  alignment: Alignment;     // enum, below
  narrative: string;        // exactly one sentence: the world-state
  strategicMove: string;    // 4-6 sentences ending in "The move:" (see strategic-standard.md)
  impacts: LoopImpact[];
}
```

### LoopImpact
```ts
interface LoopImpact {
  id: string;
  label: string;
  effect: Effect;           // enum, below
  magnitude: Magnitude;     // enum, below
  mechanism: string;
  loopName: string;         // a loop on the six-function PHI systems maps
  loopSubsystem: string;
  loopCode: string;
}
```

### ScenarioUncertainty (cross-cutting workshop axis)
A curated axis sitting *above* the driver-level uncertainties. In this app it is
**derived at read time** from the `uncertainties` table (poles/whyItMatters left blank
in the derived form), not stored, so treat it as optional for alignment.
```ts
interface ScenarioUncertainty {
  id: string;
  workshopId: string;        // "U01" … "U24"
  label: string;
  question: string;
  poleA: string;
  poleB: string;
  capabilityDomain: string;  // see CAPABILITY_DOMAIN_ORDER
  whyItMatters: string;
  identityImplication: string;
  sourceDriverIds: string[];      // -> Driver.id
  mappedUncertaintyIds: string[]; // -> Uncertainty.id
}
```

### Enums
```ts
type Direction = "Positive for public health" | "Negative for public health" | "Mixed / depends";
type Alignment = "Self-aligned" | "Engineered alignment" | "Needs collective action" | "Mixed / depends";
type Effect    = "Strengthens" | "Weakens" | "Breaks / reverses" | "Reshapes" | "Neutral / unclear";
type Magnitude = "High" | "Medium" | "Low";
```

### Ordering constants
```ts
THEME_ORDER = [
  "Keystone",
  "Trust, Legitimacy & Information",
  "The Social Fabric",
  "The Institutional Base",
  "The Data & AI Inflection",
  "The Shifting Burden of Disease",
  "Decentralization & Consumerization",
];

CAPABILITY_DOMAIN_ORDER = [
  "Permission to Act",
  "Capacity to Act",
  "Ability to See",
  "Ability to Speak and Be Believed",
  "Ability to Adapt",
];
```

### Alignment checklist (highest-risk drift points)

Confirm with the internal team, field by field:

- [ ] **Driver** carries the `neutral*` framing fields (`neutralHeadline`,
  `neutralReading`, `neutralName`) and the `topRight` flag.
- [ ] **Uncertainty** uses `poleA` / `poleB` and a `sharpest` boolean.
- [ ] **Outcome** carries `direction` **and** `alignment` **and** `narrative` **and**
  `strategicMove` (the writing standard is in
  [`docs/strategic-standard.md`](strategic-standard.md)).
- [ ] The four **enums** use the same string values (exact casing / wording matters:
  the deck builder and UI colour maps key off these strings).
- [ ] **LoopImpact** is modeled at all, and to the systems-map loops
  (`docs/systems-maps/`). If the internal app does not model loops, decide whether the
  game needs them (today it does not use them for play, only for Explore).
- [ ] **Ids:** the game references drivers/uncertainties by string id/slug. Agree on a
  stable id scheme (slug vs uuid) the internal API returns.

---

## B. Derived game objects (GAME-INTERNAL, no alignment needed)

Built from A at read time by [`lib/cards.ts`](../lib/cards.ts). The internal app does
not need to know these; listed for completeness. From
[`lib/workshop-types.ts`](../lib/workshop-types.ts).

```ts
interface Card {                 // one outcome card in the deck
  id: string;                    // "C01"…"C52"
  uncertaintyId: string;         // slug
  dimension: string;             // the uncertainty title
  domain: string;                // capability domain (board grouping)
  seedingQuestion: string;
  sourceDriverIds: string[];
  title: string;
  condition: string;             // the future condition printed on the card
  role: "Core" | "Edge" | "Wildcard";
}

interface Deck { cards: Card[]; dimensions: string[]; uncertainties: UncertaintyLite[]; }
```

The deck is assembled as: for each uncertainty, one `Card` per outcome
(`uncertainty x outcomes`). Role maps from the outcome's role; `Core` is the default.

---

## C. Live play state (SUPABASE, STAYS HERE, ephemeral)

Exact columns from [`supabase/migrations/0001`](../supabase/migrations/0001_live_state_and_drivers.sql)
and later migrations. This stays in the game's Supabase and does not move to the
internal app. The `teams` capture fields are the raw material for the kernel (section D).

**`sessions`** — one game run. `id`, `code` (unique short code), `title`, `scope`
(`Single`/`Full`/`Cards`/`Solo`), `pacing`, `uncertainty_id`, `driver_id`, `mode`,
`prompt`, `status` (`Draft`/`Open`/`Closed`), `facilitator`, `created_at`.
*Phase 0 adds `project_id`.*

**`teams`** — one built world within a session. `id`, `session_id` (FK, cascade),
`code`, `name`, `color`, `seed_uncertainty_id`, `seed_card_id`, `hand_ids[]`,
`kept_ids[]`, `wildcard_id`, and the **capture fields**:
`convergence` (the fill-in sentence), `world_title`, `world_description` (legacy
freeform), `primary_condition`, `defining_characteristics`, `central_tension`,
`new_normal`, `broken_assumption`; `status` (`Drafting`/`Submitted`), `created_at`.
Added later: `seed_locked` (0003), `tone` (`hopeful`/`dark`) + `family` (0004,
facilitator analysis tags).

**`submissions`**, **`responses`** — participant text + upvotes/reactions/poll answers
for the live divergent/convergent workshop. Not part of the up-flow contract.

The scenario triad = `seed_card_id` + `kept_ids` (three outcome cards, one per
capability domain).

---

## D. Kernel / harvest payload (THE UP-FLOW CONTRACT)

A **kernel** is one submitted world, normalized for the internal app to consume as
scenario-building input. In this app it is produced from a `teams` row (compare the
flat `KernelEntry` in [`lib/analysis/types.ts`](../lib/analysis/types.ts), which the
Analysis view already derives). This app will keep a `kernels` **outbox** table and
push kernels up on submit; the internal app stores the canonical kernel.

Proposed payload (agree this shape with the internal team):
```ts
interface Kernel {
  projectRef: string;                    // the internal-app project id
  source: { sessionCode: string; teamId: string };
  worldTitle: string;
  triad: {                               // exactly 3, one per capability domain
    uncertaintyId: string;
    outcomeCode: string;                 // the chosen outcome (Card id)
    domain: string;                      // capability domain
    sourceDriverIds: string[];
  }[];
  capture: {
    convergence: string;                 // the fill-in "Because ___ …" sentence
    primaryCondition: string;
    definingCharacteristics: string;
    centralTension: string;
    newNormal: string;
    brokenAssumption: string;
  };
  tags: { tone: "hopeful" | "dark" | null; family: string | null };
  submittedAt: string;                   // ISO
}
```

Notes:
- `triad[].outcomeCode` is the game's `Card.id` (which equals the outcome's `code`),
  so the internal app can map each choice back to a canonical outcome/uncertainty/driver.
- `convergence` is the one-sentence world summary the player fills in, not a separate
  "oneSentence" field.
- Delivery is at-least-once via an outbox with a `sync_status` and reconciliation, so
  the internal app's endpoint should be **idempotent** on `source.teamId`.

---

## E. Integration API contract (internal app provides)

Minimum surface the game needs. Base URL + auth via `FORESIGHT_API_URL` /
`FORESIGHT_API_KEY` (server-only in the game).

- **`GET /projects/:ref/model`** -> `{ drivers, uncertainties, outcomes }`.
  Must be mappable to this app's `UncertaintyRow` (see
  [`lib/cards.ts`](../lib/cards.ts) lines 15-23): each uncertainty needs
  `id`/`slug`, `number`, `domain`, `title`, `question`, `sourceDriverIds[]`, and
  `outcomes: { code, role, title, description }[]`. Drivers as in section A.
- **`POST /projects/:ref/kernels`** <- the `Kernel` payload in section D. Idempotent
  on `source.teamId`.
- **Per-project passphrase management** (set / rotate) surfaced in the internal
  project admin. The game stores only a hash and validates it server-side; it never
  needs the plaintext after set.

## Open questions for the internal team

1. Id scheme for drivers/uncertainties/outcomes the API returns: slug or uuid?
2. Do you model `LoopImpact` / systems-map loops, and should the game receive them?
3. Do outcomes carry `strategicMove` + `narrative`, or a different content shape?
4. Do you want the full `teams` play detail (hands, submissions) for research, or only
   the normalized kernel?
