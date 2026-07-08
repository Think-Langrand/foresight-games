# Future of Public Health — Driver Explorer

An interactive foresight model and explorer for NNPHI's "Foresight for Public Health" work, framed to ~2035. It maps the field's biggest drivers down through their critical uncertainties, the outcomes each uncertainty can resolve into, and how those outcomes hit the loops on the six-function systems maps of public health institutes (PHIs).

## What's here

- **`explorer/index.html`** — a single self-contained web app. Double-click to open in any browser (it loads React and fonts from a CDN, so it wants a network connection the first time). Pick any driver, step through its uncertainties as selectable mini-cards, and open each outcome to see its world-state, its alignment, its loop impacts, and its **Strategic move**. Includes an Alignment lens and a Hopeful lens.
- **`data/model.json`** — the entire model as editable JSON. This is the source of truth for the app. Edit it and rebuild.
- **`explorer/template.html`** + **`explorer/build.mjs`** — the app with the data pulled out, plus a tiny build script that injects `model.json` back in. This is how you regenerate `index.html` after editing data.
- **`docs/`** — the strategic-writing standard, the open work (the keystone), and the six systems maps for reference.

## The model, in one breath

22 **drivers**, grouped into 7 **themes**. Each driver has 3 **uncertainties** (one flagged as the sharpest axis), each uncertainty has 2 opposing **outcomes**, and each outcome links to one or more **loop impacts** on the systems maps. Totals: 22 drivers, 66 uncertainties, 132 outcomes, 187 loop impacts, across 38 loops.

Each outcome carries two strategic fields:

- **Narrative** — a one-line *world-state* (what the world looks like if this outcome happens).
- **Strategic move** — the payload: the mechanism, the venue where it's won, the hard part, and the move it implies for a PHI. Written so an outcome reads as a testable strategic bet.

126 of 132 outcomes have a Strategic move. The 6 that don't are the **Receding Public** keystone (see `docs/remaining-work.md`).

## Build / run

No install needed to *view*: open `explorer/index.html`.

To *edit the data and rebuild*:

```bash
# edit data/model.json, then:
npm run build      # == node explorer/build.mjs
# open explorer/index.html
```

Requires Node (any recent version). `build.mjs` has no dependencies.

## Working on branches

The whole thing is self-contained and version-controlled, so experiment freely:

```bash
git checkout -b keystone-pass
# edit data/model.json (or explorer/template.html for UI changes)
npm run build
git commit -am "draft keystone strategic moves"
```

`data/model.json` and `explorer/template.html` are the two things you'll edit. `explorer/index.html` is generated, so treat it as a build artifact.

See **`CLAUDE.md`** for the full handoff brief, and **`docs/strategic-standard.md`** for the writing standard.
