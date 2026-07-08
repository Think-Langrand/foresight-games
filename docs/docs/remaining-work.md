# Remaining work

## 1. The keystone: The Receding Public (the main open task)

Six outcomes still have an empty `strategicMove`. They all belong to the keystone driver, **The Receding Public**, which is the master axis of the whole model, not a normal driver. It asks the question underneath every other driver: *is there still a public for public health to serve?* Its strategic moves are effectively the thesis of the entire exercise, so they were left for a deliberate pass rather than batched.

Write these to the standard in `docs/strategic-standard.md`, and lean on the coherence thesis there (mandate to substrate, steward the commons, engineer the aligned zone). Rewrite each `narrative` to a crisp one-liner too if it helps, then `npm run build`.

The six outcomes (all under `The Receding Public`, theme `Keystone`):

### Uncertainty: "Is there still a public?"  [SHARPEST]
Poles: Re-engaged, re-constituted public  <->  Permanently receded, privatized public

- **Public re-constituted** (Positive / Needs collective action)
  Current world-state: A visible crisis and deliberate community organizing rebuild a shared sense of the public; public health regains a real constituency it can mobilize.
- **Public dissolves into silos** (Negative / Self-aligned)
  Current world-state: People retreat into private, individualized health worlds curated by platforms and personal networks; no shared audience left to mobilize.

### Uncertainty: "Mandate for collective action"
Poles: Consent for collective action holds  <->  Consent evaporates

- **Collective mandate renewed** (Positive / Needs collective action)
  Current world-state: Communities reaffirm that some health problems require collective action and grant public health explicit consent to act on their behalf.
- **Consent withdrawn** (Negative / Needs collective action)
  Current world-state: The idea that any body may act on the collective becomes illegitimate; even sound interventions are read as overreach.

### Uncertainty: "Routed around or re-earned?"
Poles: Institutions re-earn their place  <->  Permanently routed around

- **Institutions re-earn relevance** (Positive / Engineered alignment)
  Current world-state: Public institutions win back a place people actually use, becoming a trusted default rather than a fallback.
  NOTE: this is the exact outcome whose weak first draft ("by showing up reliably and delivering value") prompted the whole standard. It is the best test case. See the before/after in `docs/strategic-standard.md`.
- **Permanently routed around** (Negative / Self-aligned)
  Current world-state: Private and platform alternatives become the default path for health, and institutions fade into a residual role invisible until a system fails.

### Framing help for the keystone

Because the keystone is the master question, its strategic moves should carry the argument the other six sections build toward:

- The positive moves are the affirmative case that you can get better, even more equitable, health *without* a mobilized public: raise the floor with near-zero-marginal-cost tools, make the healthy option the ambient default, equip trusted local nodes, and steward the data/model/evidence commons. Public health shifts from governing a public to setting the substrate.
- The "hard part" for the keystone positives is the funding paradox: the commons and the equity backstop are public goods, but you have lost the public that funds public goods, so the move has to name where the money and the mandate come from (value-based financing, platform/AI obligations imposed as a required layer, philanthropy).
- The negatives are the world where public health keeps assuming it needs the old mobilized public, does not make the substrate move, and gets routed around.

## 2. Optional polish (nice-to-have, not required)

- **Alignment spot-check.** The `alignment` field on all 132 outcomes was a first-pass classification. A few tie-break cases (unchecked-self-interest harms vs collective-action-failure harms) are arguable; eyeball and adjust if any read wrong. Do not change one without also sanity-checking the strategic move still fits.
- **A scenario 2x2 view.** The model supports crossing two master axes (e.g. public-vs-private against AI-helps-vs-harms) to generate four worlds, each pulling the outcomes and loop impacts that fire in it. This would be a new view in the explorer, not a data change.
- **Loop coverage.** The `Loops & Key Structures` table (in Airtable; see `data/schema.md`) currently holds ~38 loops across all six functions plus the cross-cutting seams. If more loops get added to the maps, the loop-impact links can be extended.
- **A read-only export.** A formatted brief or slide-ready summary of the 22 drivers, their sharpest axes, outcomes, and strategic moves, generated from `model.json`.
