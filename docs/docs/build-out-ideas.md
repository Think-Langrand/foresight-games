# Explorer build-out ideas

A backlog of concrete directions to extend the explorer. None are required; pick what is useful. Each notes what data already exists to support it. The app is a single React file built from `data/model.json` via `explorer/build.mjs` (see `CLAUDE.md`), so most of these are template + build changes, not data changes.

## Framing and tone

- **Original vs neutral toggle.** Every driver already carries `neutralHeadline`, `neutralReading`, and `neutralName` in `model.json` (populated for all 22; `neutralName` for 7). Add a header toggle that swaps the displayed headline/name/description between the working and neutral framings. This is the most natural first build-out: the data is already there, the UI just does not surface it yet.

## Scenario tooling (the likely high-value direction)

- **Scenario 2x2 view.** Let the user pick two master axes (see the four candidates below) and render a 2x2. In each quadrant, pull the outcomes whose poles match that quadrant and show which loops they hit. This turns the model from a driver browser into a scenario generator. Candidate master axes: public vs private, AI clarifies vs corrupts, recentralize vs fragment, rebuild vs hollow.
- **Axis picker / correlation view.** Show the sharpest axis of each driver and let the user tag which master axis it feeds, to support selecting independent axes for a 2x2.

## Cross-cutting views (data already supports these)

- **Loop-centric view.** Every loop impact carries `loopName`, `loopSubsystem`, `loopCode`. Add a view that starts from a loop (e.g. "Steward R2 Knowledge engine") and shows every outcome across all drivers that strengthens, weakens, breaks, or reshapes it. Good for the systems-map conversation.
- **Alignment matrix.** Cross `direction` (positive/negative/mixed) against `alignment` (self-aligned / engineered / needs collective / mixed) into a grid, each cell listing its outcomes. The self-aligned + engineered positives are the "hopeful seeds"; the current Hopeful Lens already filters to them but a matrix would show the whole distribution.
- **Strategic-move search.** Free-text search across `narrative` and `strategicMove` so you can find every outcome that mentions, say, "Medicaid" or "procurement".

## Content completion

- **Keystone strategic moves.** The 6 Receding Public outcomes still have empty `strategicMove` (see `remaining-work.md`). Fill them to the standard in `strategic-standard.md`.

## Outputs

- **Export / print view.** A clean, print-friendly or one-page-per-driver export generated from `model.json`, for sharing outside the app (board pre-reads, handouts).
- **Systems-map integration.** The six function maps are in `docs/systems-maps/*.svg`. A view that shows the relevant map alongside a driver's loop impacts would tie the abstract loop names to the visuals.

## Data hygiene (optional)

- **Alignment spot-check** and the **Lowered Shield scope question** are noted in `remaining-work.md`; both are data edits in `model.json` (or Airtable), not UI.

## Working notes

- Edit `data/model.json` (data) or `explorer/template.html` (UI), then `npm run build`, then open `explorer/index.html`. The built file is a generated artifact; do not hand-edit it.
- After any template change, sanity-check that the app still transpiles (the CLAUDE.md has the one-liner for extracting and esbuild-checking the babel block).
- Keep the editorial design language (cream paper, ink, lime accent, Archivo + Cormorant, sharp corners) unless deliberately redesigning.
