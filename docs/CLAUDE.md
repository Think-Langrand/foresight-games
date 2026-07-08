# CLAUDE.md — handoff brief for Claude Code

This project is a foresight model plus an explorer app for NNPHI's "Future of Public Health" work (horizon ~2035). Read this first, then `docs/strategic-standard.md`.

## What this is

A relational model of how public health could change by 2035:

- **Drivers** (22) grouped into **themes** (7). A driver is a force of change (e.g. "AI as Public Health Infrastructure", "The Workforce Cliff").
- **Uncertainties** (66, three per driver) are the genuinely open either/or questions inside each driver. One per driver is flagged the **sharpest axis** (the best scenario spine).
- **Outcomes** (132, two per uncertainty) are the opposing ways an uncertainty resolves. Each has a **Direction** (good/bad/mixed for public health) and an **Alignment** (see below).
- **Loop impacts** (187) connect an outcome to a specific **loop** on the six-function PHI systems maps (Anchor, Convene, Amplify, Translate & Disperse, Steward, Bridge & Extend, plus cross-cutting seams), with an Effect (Strengthens / Weakens / Breaks / reverses / Reshapes / Neutral) and a Magnitude.

The six systems maps are in `docs/systems-maps/` for reference.

## The two strategic fields on every outcome

- **`narrative`** — a one-sentence *world-state*: what the world looks like if this outcome happens.
- **`strategicMove`** — the strategic payload. This is the important field. It must read as a testable bet: *public health wins or loses here IF it does X, at Y venue, which is hard because Z*, ending with a concrete "The move:" line. Full standard and worked examples in `docs/strategic-standard.md`. **Match that standard exactly** when writing new ones.

Also on each outcome:
- **`alignment`** — the incentive logic of the path: `Self-aligned` (individual/market self-interest alone produces it), `Engineered alignment` (needs a designed default/standard/governance, not a mandate), `Needs collective action` (needs mandates, pooled funding, or commons stewardship), or `Mixed / depends`.

## Repo layout

```
data/model.json          # SOURCE OF TRUTH. The whole nested model. Edit this.
explorer/template.html   # the app UI with a __MODEL_JSON__ placeholder. Edit for UI changes.
explorer/build.mjs       # injects model.json into template.html -> index.html
explorer/index.html      # GENERATED build artifact. Do not hand-edit.
docs/strategic-standard.md   # the writing standard + worked examples (read before writing strategicMove)
docs/remaining-work.md       # the open task (the keystone) + optional polish
docs/systems-maps/           # the six PHI function maps (SVG)
data/schema.md               # model.json shape + the Airtable field/table IDs
```

## Build

```bash
npm run build      # node explorer/build.mjs  ->  regenerates explorer/index.html
```

`build.mjs` has no dependencies. After editing `data/model.json`, always rebuild, then open `explorer/index.html` to check.

To sanity-check that the app still compiles after a template change:

```bash
# extract the babel block and transpile it
node -e "const fs=require('fs');const h=fs.readFileSync('explorer/index.html','utf8');const m=h.match(/<script type=\"text\/babel\"[^>]*>([\s\S]*?)<\/script>/);fs.writeFileSync('/tmp/chk.jsx',m[1]);"
npx esbuild /tmp/chk.jsx --loader:.jsx=jsx --jsx=transform >/dev/null && echo OK
```

## State of the work

- **Done:** all six thematic sections have had their outcomes lifted to the strategic standard (126 of 132 outcomes have a `strategicMove`).
- **Open:** the **Receding Public** keystone (6 outcomes) has empty `strategicMove`. It is the master axis, not a normal driver, so it was left for a deliberate final pass. See `docs/remaining-work.md` — it lists the six exact outcomes and the argument to draw on.
- **Building it out:** `docs/build-out-ideas.md` is a backlog of concrete ways to extend the explorer (original/neutral framing toggle, a scenario 2x2 view, a loop-centric view, strategic-move search, exports, and more), each noting what data already supports it. Start there for feature work.

## Conventions (please keep)

- **Avoid em-dashes.** Use commas, colons, periods. (Author preference.)
- `narrative` = exactly one sentence, the world-state. `strategicMove` = 4 to 6 sentences ending in "The move:".
- Do not change an outcome's `direction` or `alignment` when only rewriting its prose. If you believe a classification is wrong, flag it rather than silently changing it.
- Keep the positive/negative pole logic: a positive outcome's world-state describes the good world, negative the bad, mixed the genuinely two-sided.
- `explorer/index.html` is generated. Edit `data/model.json` or `explorer/template.html`, never the built file.

## Optional: syncing back to Airtable

The model also lives in an Airtable base (this repo is an export). If you want to push edits back, the base and field IDs are in `data/schema.md`. That requires Airtable API access configured in your environment (an API key / the Airtable MCP). It is entirely optional: the local `model.json` + build workflow is fully self-contained and is the recommended way to experiment on branches.
