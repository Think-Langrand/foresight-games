# Cross-Group Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An admin page that shows one field at a time across every design group in a project, plus an uncertainty grid and per-field CSV export.

**Architecture:** `buildProjectExport()` already returns the exact cross-group payload (`ProjectExport`: every group, every week, shaped `ExerciseAnswers`, plus group colour and sort) and is already tested — so no new loader. Two new pure shape modules turn that payload into a chip registry and a column of cells per group; a third builds the uncertainty grid from the Carmelita catalogue plus each group's scenario. The page is a thin server component; the board is one client component holding the selected chip.

**Tech Stack:** Next.js 16.2.10 App Router, React 19.2.4, TypeScript, Tailwind, vitest.

**Spec:** `docs/superpowers/specs/2026-11-09-cross-group-board-design.md`

## Global Constraints

- **Next.js 16.2.10, React 19.2.4.** Per `AGENTS.md`, read the relevant guide in `node_modules/next/dist/docs/` before writing route code. This is not the Next.js in your training data.
- **No migrations, no schema changes.** Every value rendered already exists.
- Branch off `dev`, PR into `dev`. Never branch from or into `main`.
- vitest `include` is `lib/**/*.test.ts` and `server-only` is **not** aliased: a module with tests must not `import "server-only"`. Pure shape modules stay pure; the page does the I/O.
- Stage files by name (`git add <paths>`). Never `git add -A` or `git add .`.
- Read answers only through `shapeExerciseAnswers` / `buildProjectExport`. Do not re-read boards or re-derive shapes.
- **Bold moves come from `CommitmentsExercise.directions[].move`, never from `boldMoves`** — that field is `looseResponses.filter(shortlisted)`, a legacy path that is structurally always empty on current boards.
- **"Our vision" is addressed by the key `COMMITMENTS_KEY_VISION` (`"w4-role"`) from `lib/exercise-types.ts`, never by its label.** Labels are admin-editable via `resolveEffectiveSections`.
- Every walk over the `ExerciseAnswers` union ends in a `default:` branch typed `never` that also throws at runtime, matching `exerciseCsvRows` in `lib/group-answers-csv.ts`. That guard exists because four card kinds once went missing from an export in silence.
- Field identity is `<weekSort>:<fieldKey>`, never an exercise id. Exercise ids differ per group.

## Review Focus

Input classes the spec implies but no task's happy path exercises. Each has a test pinned to the task that owns the code.

- **A project with no design groups at all** — the page renders an empty state, never a crash or a zero-column grid. (Task 5)
- **A gap week: `ExportedWeek.answers === null` for one group only** — that group's column reads "no such week for this group", visibly different from "they wrote nothing". (Task 2)
- **`programDivergent: true`** — week-index alignment may be comparing two different sessions, so the page says so rather than comparing silently. (Task 5)
- **Carmelita unreachable, or `carmelitaProjectRef` empty** — the uncertainty chip says so; every other chip renders normally. (Task 4)
- **A `PlaceholderExercise`, or a week whose `type` the registry does not know** — contributes no chips but is reported, never silently dropped. (Task 1)

---

### Task 1: Field registry and addressing

**Files:**
- Create: `lib/cross-group-shape.ts`
- Test: `lib/cross-group-shape.test.ts`

**Interfaces:**
- Consumes: `ProjectExport`, `ExportedGroup`, `ExportedWeek` from `@/lib/cohort-export-shape`; `ExerciseAnswers` from `@/components/design-groups/AnswerPanels`.
- Produces:
  ```ts
  export type FieldTier = "primary" | "overflow";
  export interface CrossGroupField {
    id: string;              // `${weekSort}:${fieldKey}`, or "uncertainties"
    fieldKey: string;        // "vision" | "bold-moves" | ... | `q:${sectionKey}`
    label: string;           // chip text, disambiguated by week title on collision
    weekSort: number | null; // null only for "uncertainties"
    weekTitle: string | null;
    tier: FieldTier;
    counts: Record<string, number>; // groupId -> number of cells
  }
  export function listCrossGroupFields(payload: ProjectExport): CrossGroupField[];
  export function unknownWeeks(payload: ProjectExport): { weekSort: number; type: string | null }[];
  ```

The structural field keys per week type, which fix chip order within a week:

| Week type | fieldKeys, in order |
|---|---|
| `commitments` | `vision`, `bold-moves`, `priorities`, `outcomes`, `responses`, then `q:<key>` for every other authored section |
| `synthesis` | `themes`, `risks`, `opportunities`, `hopes-fears`, `implications`, then `q:<key>` |
| `implications` | `map`, `brainstorm`, then `q:<key>` |
| `worksheet` | `q:<key>` for each section, in spec order |
| `placeholder` | none |

Tier: every structural key above is `primary` except `implications`, `map` and `brainstorm`, which are `overflow`; every `q:<key>` is `overflow` except commitments' `vision`, which is already its own structural key. Project-wide chip order is the spec's primary list first (`uncertainties`, `vision`, `bold-moves`, `priorities`, `risks`, `opportunities`, `outcomes`, `responses`, `themes`, `hopes-fears`), then everything else in week order.

- [ ] **Step 1: Write the failing tests**

```ts
const FIXTURE = JSON.parse(
  readFileSync("data/all-groups-public-health-2026-10-30.json", "utf8")
) as ProjectExport;

it("lists one chip per structural field per week", () => {
  const ids = listCrossGroupFields(FIXTURE).map((f) => f.id);
  expect(ids).toContain("3:vision");
  expect(ids).toContain("3:bold-moves");
  expect(ids).toContain("2:risks");
  expect(ids).toContain("1:map");
});

it("counts cells per group on the chip", () => {
  const moves = listCrossGroupFields(FIXTURE).find((f) => f.id === "3:bold-moves")!;
  // directions[], not boldMoves[]: 3 / 2 / 1 / 1 across the four groups.
  expect(Object.values(moves.counts).sort((a, b) => b - a)).toEqual([3, 2, 1, 1]);
});

it("puts the spec's primary fields before the overflow ones", () => {
  const fields = listCrossGroupFields(FIXTURE);
  const tiers = fields.map((f) => f.tier);
  expect(tiers.indexOf("overflow")).toBeGreaterThan(tiers.lastIndexOf("primary") - 1);
  expect(fields.find((f) => f.fieldKey === "map")!.tier).toBe("overflow");
});

it("addresses vision by key, not by label", () => {
  const renamed = structuredClone(FIXTURE);
  for (const g of renamed.groups) {
    const q = (g.weeks[3].answers as CommitmentsExercise).questions
      .find((x) => x.key === COMMITMENTS_KEY_VISION)!;
    q.label = "What we are aiming for";
  }
  expect(listCrossGroupFields(renamed).map((f) => f.id)).toContain("3:vision");
});

it("disambiguates two weeks that offer the same field", () => {
  const twice = structuredClone(FIXTURE);
  twice.weeks.push({ sort: 4, title: "Session 5 · Synthesis again", type: "synthesis" });
  for (const g of twice.groups) g.weeks.push({ ...g.weeks[2], weekSort: 4, weekTitle: "Session 5 · Synthesis again" });
  const risks = listCrossGroupFields(twice).filter((f) => f.fieldKey === "risks");
  expect(risks).toHaveLength(2);
  expect(new Set(risks.map((f) => f.label)).size).toBe(2);
});

it("reports a week whose type it does not know instead of dropping it", () => {
  const odd = structuredClone(FIXTURE);
  odd.groups[0].weeks[0].type = "tarot-reading";
  odd.groups[0].weeks[0].answers = { kind: "placeholder", exerciseId: "x", title: "?" };
  expect(unknownWeeks(odd)).toEqual([{ weekSort: 0, type: "tarot-reading" }]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/cross-group-shape.test.ts`
Expected: FAIL — `listCrossGroupFields is not a function`

- [ ] **Step 3: Implement `listCrossGroupFields` and `unknownWeeks` in `lib/cross-group-shape.ts`**

Walk `payload.weeks` for the canonical order, and for each week walk every group's `ExportedWeek.answers` to collect authored section keys and per-group counts. The `switch` on `answers.kind` carries the `default: never` guard. Labels for structural keys are fixed strings from the table above; `q:<key>` labels come from the first group that has that section. On a collision across weeks, append ` · <weekTitle>`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/cross-group-shape.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/cross-group-shape.ts lib/cross-group-shape.test.ts
git commit -m "Cross-group board: which fields the chip row offers"
```

---

### Task 2: Columns of cells — synthesis and commitments fields

**Files:**
- Modify: `lib/cross-group-shape.ts`
- Test: `lib/cross-group-shape.test.ts`

**Interfaces:**
- Consumes: Task 1's `CrossGroupField`.
- Produces:
  ```ts
  export interface CrossGroupCell {
    id: string;            // the card id
    text: string;
    author: string;
    createdAt: string;
    tag: string | null;    // parent theme / priority / outcome text
    note: string | null;   // extra line: a priority's status, a hope/fear's kind
  }
  export interface CrossGroupColumn {
    groupId: string;
    groupName: string;
    color: string | null;
    scenarioTitle: string | null;
    state: "ok" | "no-week" | "no-board";
    cells: CrossGroupCell[];
  }
  export function columnsFor(payload: ProjectExport, fieldId: string): CrossGroupColumn[];
  ```

`state` is `"no-week"` when `ExportedWeek.exerciseId === null`, `"no-board"` when the row exists but `answers === null`, else `"ok"`. Columns are always returned for every group in `sort` order, even when empty.

- [ ] **Step 1: Write the failing tests**

```ts
it("reads bold moves from directions, not from the legacy boldMoves field", () => {
  const cols = columnsFor(FIXTURE, "3:bold-moves");
  expect(cols[0].cells.map((c) => c.text)).toContain(
    "PH works entirely on upstream issues"
  );
});

it("tags each risk with the theme it hangs off", () => {
  const cols = columnsFor(FIXTURE, "2:risks");
  const cell = cols[0].cells.find((c) => c.text.startsWith("PH funding comes from one source"))!;
  expect(cell.tag).toBe("Predictable funding enables long-term  investment but new competition for resources");
});

it("tags a response with its parent outcome", () => {
  const cols = columnsFor(FIXTURE, "3:responses");
  const cell = cols[0].cells.find((c) => c.text.startsWith("Allocated funding includes enough"))!;
  expect(cell.tag).toBe("Robust engagement is an integrated expectation of any PH planning process");
});

it("notes a priority's confirmed/suggested status", () => {
  const cols = columnsFor(FIXTURE, "3:priorities");
  expect(cols[0].cells[0].note).toBe("confirmed");
});

it("marks a hope or fear as which it is", () => {
  const kinds = new Set(columnsFor(FIXTURE, "2:hopes-fears")[0].cells.map((c) => c.note));
  expect(kinds).toEqual(new Set(["hope", "fear"]));
});

it("returns a column for every group in sort order, including empty ones", () => {
  const cols = columnsFor(FIXTURE, "3:bold-moves");
  expect(cols).toHaveLength(4);
  expect(cols.map((c) => c.groupName)).toEqual(FIXTURE.groups.map((g) => g.groupName));
});

// Review Focus: a gap week must not read as "they wrote nothing".
it("distinguishes a missing week from an empty one", () => {
  const gap = structuredClone(FIXTURE);
  gap.groups[1].weeks[3] = { ...gap.groups[1].weeks[3], exerciseId: null, answers: null };
  const cols = columnsFor(gap, "3:bold-moves");
  expect(cols[1].state).toBe("no-week");
  expect(cols[0].state).toBe("ok");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/cross-group-shape.test.ts -t columnsFor`
Expected: FAIL — `columnsFor is not a function`

- [ ] **Step 3: Implement `columnsFor` for the synthesis and commitments field keys**

Sources, exactly as the spec's table fixes them: `vision` → the `questions` block whose key is `COMMITMENTS_KEY_VISION`; `bold-moves` → `directions[].move`; `priorities` → `prioritySlots[].pick` with `note` from `status`; `outcomes` → `prioritySlots[].outcomes[].outcome`, tagged with the pick's text; `responses` → `responses[]`, tagged with the parent outcome found by walking `prioritySlots[].outcomes[].responses`; `themes` → `themes[]`; `risks`/`opportunities` → `themes[].risks`/`.opportunities`, tagged with the theme text; `hopes-fears` → `hopesFears[]` with `note` from `cardKind`. An unrecognised `fieldKey` throws.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/cross-group-shape.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/cross-group-shape.ts lib/cross-group-shape.test.ts
git commit -m "Cross-group board: a column of cells per group for Sessions 3 and 4"
```

---

### Task 3: Columns of cells — worksheet and implications fields

**Files:**
- Modify: `lib/cross-group-shape.ts`
- Test: `lib/cross-group-shape.test.ts`

**Interfaces:**
- Consumes: Task 2's `columnsFor`, `CrossGroupCell`.
- Produces: the same `columnsFor`, now answering `q:<key>`, `map`, `brainstorm` and `implications`.

`map` flattens `ImplicationsExercise.cards` in tree-walk order — parents before children — with each cell tagged by its parent card's text and root cards tagged `null`. The spec is explicit: flat, tagged, never nested and never a wheel.

- [ ] **Step 1: Write the failing tests**

```ts
it("answers an authored worksheet question by its section key", () => {
  // Session 1's keys as the fixture carries them: `reactions`, `six-changes`,
  // `key-changes`, and generated `sec_<hash>` keys for sections an admin added.
  expect(columnsFor(FIXTURE, "0:q:reactions")[0].cells).toHaveLength(9);
  expect(columnsFor(FIXTURE, "0:q:six-changes")[0].cells).toHaveLength(6);
});

it("handles a generated section key as readily as a named one", () => {
  // Admin-authored sections get keys like `sec_cf8bc585`, so the label is their only
  // human-readable name — which is why the chip label comes from the label and the
  // field id never does.
  const cols = columnsFor(FIXTURE, "0:q:sec_cf8bc585");
  expect(cols[0].cells.length).toBeGreaterThan(0);
});

it("flattens Session 2's map in tree-walk order, parents before children", () => {
  const cells = columnsFor(FIXTURE, "1:map")[0].cells;
  expect(cells.length).toBe(152);
  const pos = new Map(cells.map((c, i) => [c.id, i]));
  for (const c of cells) {
    if (!c.tag) continue;
    const parent = cells.find((p) => p.text === c.tag)!;
    expect(pos.get(parent.id)!).toBeLessThan(pos.get(c.id)!);
  }
});

it("tags a map card with its parent's words and leaves roots untagged", () => {
  const cells = columnsFor(FIXTURE, "1:map")[0].cells;
  expect(cells[0].tag).toBeNull();
  expect(cells.some((c) => c.tag !== null)).toBe(true);
});

it("reads Session 3's clustered implications separately from Session 2's own cards", () => {
  const clustered = columnsFor(FIXTURE, "2:implications")[0].cells;
  const own = columnsFor(FIXTURE, "1:map")[0].cells;
  expect(clustered.length).toBe(146);
  expect(own.length).not.toBe(clustered.length);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/cross-group-shape.test.ts -t "worksheet\|map\|implications"`
Expected: FAIL — unrecognised fieldKey

- [ ] **Step 3: Extend `columnsFor` for `q:<key>`, `map`, `brainstorm` and `implications`**

`q:<key>` → the matching `QuestionBlock.answers`, on any week type. `brainstorm` → `ImplicationsExercise.brainstorm`. `implications` → `themes[].implications`, tagged with the theme text. `map` → a depth-first walk of `cards` using each card's `parentId`, skipping cards unreachable from any root, which `lib/group-answers-shape.ts` already treats as drawn by no view.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/cross-group-shape.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/cross-group-shape.ts lib/cross-group-shape.test.ts
git commit -m "Cross-group board: Session 1's questions and Session 2's own map"
```

---

### Task 4: The uncertainty grid shape

**Files:**
- Create: `lib/cross-group-uncertainties-shape.ts`
- Test: `lib/cross-group-uncertainties-shape.test.ts`

**Interfaces:**
- Consumes: `PublicUncertainty`, `Scenario` from `@/lib/foresight/types`.
- Produces:
  ```ts
  export interface UncertaintyCell {
    resolution: string | null;        // null = not resolved (absent OR empty string)
    options: PublicOutcome[];         // the full option set, for the expanded row
    chosen: string | null;            // the matched PublicOutcome.title
  }
  export interface UncertaintyRow {
    id: string;
    title: string;
    question: string;
    unmatched: boolean;               // a resolution with no catalogue row
    agreed: boolean;                  // 2+ groups share a resolution
    cells: Record<string, UncertaintyCell>; // groupId -> cell
  }
  export interface UncertaintyGrid {
    rows: UncertaintyRow[];
    emptyGroups: string[];            // groupIds with no usable resolution at all
  }
  export function buildUncertaintyGrid(input: {
    catalogue: PublicUncertainty[];
    scenarios: { groupId: string; scenario: Scenario | null }[];
  }): UncertaintyGrid;
  ```

- [ ] **Step 1: Write the failing tests**

```ts
it("keeps only uncertainties at least one scenario resolved", () => {
  const grid = buildUncertaintyGrid({ catalogue: CATALOGUE_13, scenarios: FOUR });
  expect(grid.rows.map((r) => r.title)).not.toContain("How health truth is established");
  expect(grid.rows.length).toBeLessThan(CATALOGUE_13.length);
});

it("treats an empty-string resolution as unresolved", () => {
  // The Living Floor's live state: five uncertainties linked, every resolution "".
  const grid = buildUncertaintyGrid({ catalogue: CATALOGUE_13, scenarios: FOUR });
  expect(grid.rows.every((r) => r.cells["g3"].resolution === null)).toBe(true);
  expect(grid.emptyGroups).toContain("g3");
});

it("marks a row where two or more groups landed on the same resolution", () => {
  const grid = buildUncertaintyGrid({ catalogue: CATALOGUE_13, scenarios: FOUR });
  expect(grid.rows.find((r) => r.title === "The shape of the public")!.agreed).toBe(true);
  expect(grid.rows.find((r) => r.title === "The model of prevention")!.agreed).toBe(false);
});

it("keeps a resolution whose title matches no catalogue row, flagged", () => {
  const scenarios = structuredClone(FOUR);
  scenarios[0].scenario!.linkedUncertainties.push({
    uncertaintyId: "u-x", title: "Something retired", resolution: "A position",
  });
  const grid = buildUncertaintyGrid({ catalogue: CATALOGUE_13, scenarios });
  const extra = grid.rows.find((r) => r.title === "Something retired")!;
  expect(extra.unmatched).toBe(true);
  expect(grid.rows.at(-1)).toBe(extra);
});

it("marks which option a resolution chose", () => {
  const grid = buildUncertaintyGrid({ catalogue: CATALOGUE_13, scenarios: FOUR });
  const row = grid.rows.find((r) => r.title === "The shape of the public")!;
  expect(row.cells["g1"].chosen).toBe("Shared civic public");
  expect(row.cells["g1"].options.length).toBeGreaterThan(1);
});

// Review Focus: the platform being unreachable is a null scenario, not a crash.
it("renders an empty grid when no scenario could be loaded", () => {
  const grid = buildUncertaintyGrid({
    catalogue: CATALOGUE_13,
    scenarios: FOUR.map((s) => ({ groupId: s.groupId, scenario: null })),
  });
  expect(grid.rows).toEqual([]);
  expect(grid.emptyGroups).toHaveLength(4);
});
```

Build `CATALOGUE_13` and `FOUR` as fixtures in the test file from `data/deck-reference.snapshot.json` and `data/uncertainties.seed.json`, with group ids `g1`–`g4` and `g3`'s resolutions set to `""` to match live state.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/cross-group-uncertainties-shape.test.ts`
Expected: FAIL — `buildUncertaintyGrid is not a function`

- [ ] **Step 3: Implement `buildUncertaintyGrid` in `lib/cross-group-uncertainties-shape.ts`**

Index the catalogue by `title`. For each scenario's `linkedUncertainties`, treat a falsy or whitespace-only `resolution` as unresolved. Filter catalogue rows to those with at least one resolved cell, keep catalogue `number` order, then append unmatched rows. `chosen` matches `resolution` against `PublicOutcome.title`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/cross-group-uncertainties-shape.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/cross-group-uncertainties-shape.ts lib/cross-group-uncertainties-shape.test.ts
git commit -m "Cross-group board: the uncertainty grid, resolved rows only"
```

---

### Task 5: The page and the board

**Files:**
- Create: `app/admin/projects/[slug]/cross-group/page.tsx`
- Create: `components/admin/CrossGroupBoard.tsx`
- Test: `lib/cross-group-shape.test.ts` (the divergent-program and no-groups cases)

**Interfaces:**
- Consumes: `listCrossGroupFields`, `columnsFor`, `unknownWeeks`, `buildUncertaintyGrid`, `buildProjectExport`, `getScenario`, `getForesightUncertainties`, `foresightConfigured`.
- Produces: the route `/admin/projects/<slug>/cross-group?field=<id>`.

The page: `getProjectBySlugAny(slug)`, `buildProjectExport(project)`, and — when `foresightConfigured()` and `project.carmelitaProjectRef` is set — `getForesightUncertainties(ref)` plus one `getScenario(g.scenarioRef, ref)` per group, all inside try/catch so a platform failure yields a null grid and a reason string rather than a 500. `export const dynamic = "force-dynamic"`.

The board (client): chip row from `listCrossGroupFields`, primary chips inline and overflow behind a "More" disclosure; the selected chip in the URL via `useRouter`/`useSearchParams`; equal columns from `columnsFor`; cards truncated to four lines with click-to-expand; `state` of `no-week`/`no-board` rendered as its own wording. The uncertainty chip renders Task 6's grid instead of columns.

- [ ] **Step 1: Write the failing tests**

```ts
// Review Focus: a project with no groups.
it("returns no fields and no columns for a project with no groups", () => {
  const empty = { ...FIXTURE, groups: [] };
  expect(listCrossGroupFields(empty)).toEqual([]);
  expect(columnsFor(empty, "3:bold-moves")).toEqual([]);
});

// Review Focus: positional week alignment across a divergent program.
it("reports a divergent program so the page can warn before comparing", () => {
  expect(crossGroupWarnings({ ...FIXTURE, programDivergent: true })).toContain(
    "programDivergent"
  );
  expect(crossGroupWarnings(FIXTURE)).toEqual([]);
});
```

Add `export function crossGroupWarnings(payload: ProjectExport): string[]` to `lib/cross-group-shape.ts`, returning one machine-readable reason per condition (`"programDivergent"`, and `"unknownWeek:<sort>"` for each `unknownWeeks` entry) so the board renders the copy.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/cross-group-shape.test.ts -t "no groups\|divergent"`
Expected: FAIL — `crossGroupWarnings is not a function`

- [ ] **Step 3: Implement `crossGroupWarnings`, then the page and `CrossGroupBoard`**

Read `node_modules/next/dist/docs/01-app` on `searchParams` and client components before writing the route. Follow `AdminGroupAnswers` for admin board conventions (colours, eyebrow headings, deep-linking).

- [ ] **Step 4: Verify**

Run: `npx vitest run lib/cross-group-shape.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors. Then load `/admin/projects/public-health/cross-group` and confirm: four columns, a chip row, bold moves showing 3/2/1/1, and the uncertainty chip showing ~9 rows with Group 3 empty.

- [ ] **Step 5: Commit**

```bash
git add lib/cross-group-shape.ts lib/cross-group-shape.test.ts \
  "app/admin/projects/[slug]/cross-group/page.tsx" components/admin/CrossGroupBoard.tsx
git commit -m "Cross-group board: one field at a time across every group"
```

---

### Task 6: The uncertainty grid in the board

**Files:**
- Create: `components/admin/CrossGroupUncertainties.tsx`
- Modify: `components/admin/CrossGroupBoard.tsx`

**Interfaces:**
- Consumes: `UncertaintyGrid` from Task 4.
- Produces: `export function CrossGroupUncertainties({ grid, groups, reason }: { grid: UncertaintyGrid | null; groups: CrossGroupColumn[]; reason: string | null })`.

A real grid, not columns of cards: one row per `UncertaintyRow` with `title` and `question` as a subline, one cell per group. `agreed` rows get a left-edge marker. A null `resolution` reads "not resolved" and is never blank. A groupId in `emptyGroups` gets one column-level "no resolutions published for this scenario" instead of the same words repeated down every row. Expanding a row lists `options` with each group's `chosen` marked. `unmatched` rows are visibly flagged. A null `grid` renders `reason`.

- [ ] **Step 1: Verify by rendering**

No new unit test: Task 4 owns the logic and this task is presentation over it. Load `/admin/projects/public-health/cross-group?field=uncertainties` and confirm: ~9 rows, "The shape of the public" marked as agreed, Group 3 carrying one column-level note, and a row expanding to its Core/Edge/Wildcard options.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add components/admin/CrossGroupUncertainties.tsx components/admin/CrossGroupBoard.tsx
git commit -m "Cross-group board: the uncertainty grid"
```

---

### Task 7: CSV export, per field and all fields

**Files:**
- Create: `lib/cross-group-csv.ts`
- Create: `lib/cross-group-csv.test.ts`
- Create: `app/api/admin/projects/[id]/cross-group-csv/route.ts`
- Modify: `components/admin/CrossGroupBoard.tsx`

**Interfaces:**
- Consumes: `columnsFor`, `listCrossGroupFields`, `buildUncertaintyGrid`.
- Produces:
  ```ts
  export const CROSS_GROUP_FIELD_CSV_HEADER = ["Group", "Field", "Week", "Tag", "Content", "Author", "Created"] as const;
  export function fieldCsvRows(payload: ProjectExport, fieldId: string): string[][];
  export function allFieldsCsvRows(payload: ProjectExport): string[][];
  export const UNCERTAINTY_CSV_HEADER = ["Uncertainty", "Question"] as const; // + one column per group
  export function uncertaintyCsvRows(grid: UncertaintyGrid, groups: { groupId: string; groupName: string }[]): { header: string[]; rows: string[][] };
  ```

The sheet matches what is on screen, which is chip-shaped rather than week-shaped — so these build from `columnsFor`, the same function the board renders. The exhaustive `never` guard in Task 1's registry is what keeps that safe. The dashboard's existing "All groups · CSV" remains the lossless whole-project record; this is the piece-by-piece export, and the board links to the existing button for the full dump.

- [ ] **Step 1: Write the failing tests**

```ts
it("emits one row per cell with the group in front", () => {
  const rows = fieldCsvRows(FIXTURE, "3:bold-moves");
  expect(rows).toHaveLength(7); // 3 + 2 + 1 + 1
  expect(rows[0]).toHaveLength(CROSS_GROUP_FIELD_CSV_HEADER.length);
  expect(rows[0][0]).toBe(FIXTURE.groups[0].groupName);
});

it("carries the theme tag into its own column", () => {
  const row = fieldCsvRows(FIXTURE, "2:risks")
    .find((r) => r[4].startsWith("PH funding comes from one source"))!;
  expect(row[3]).toContain("Predictable funding");
});

it("covers every chip in the all-fields export", () => {
  const fields = listCrossGroupFields(FIXTURE).filter((f) => f.weekSort !== null);
  const seen = new Set(allFieldsCsvRows(FIXTURE).map((r) => r[1]));
  for (const f of fields) if (Object.values(f.counts).some((n) => n > 0)) expect(seen).toContain(f.label);
});

it("exports the uncertainty grid wide, one column per group", () => {
  const { header, rows } = uncertaintyCsvRows(GRID, GROUPS);
  expect(header).toEqual(["Uncertainty", "Question", "Group 1", "Group 2", "Group 3", "Group 4"]);
  expect(rows[0]).toHaveLength(header.length);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/cross-group-csv.test.ts`
Expected: FAIL — `fieldCsvRows is not a function`

- [ ] **Step 3: Implement the three row builders, then the route and the buttons**

The route follows `app/api/admin/projects/[id]/export/route.ts` exactly: `supabaseConfigured()` check, `getSessionUser()` re-check returning 401, `getProjectById`, `export const maxDuration = 300`, `force-dynamic`. It takes `?field=<id>` for one field or `?field=all`, and returns `text/csv`. Buttons re-fetch on every click, as `ProjectExportButtons` does and for the reason its comment gives.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/cross-group-csv.test.ts && npm test && npx tsc --noEmit`
Expected: PASS, whole suite green, no type errors

- [ ] **Step 5: Commit**

```bash
git add lib/cross-group-csv.ts lib/cross-group-csv.test.ts \
  "app/api/admin/projects/[id]/cross-group-csv/route.ts" components/admin/CrossGroupBoard.tsx
git commit -m "Cross-group board: export one field, or all of them"
```

---

### Task 8: The dashboard link and the not-shown notes

**Files:**
- Modify: `app/admin/projects/[slug]/page.tsx:155-185`
- Modify: `components/admin/CrossGroupBoard.tsx`
- Test: `lib/cross-group-shape.test.ts`

**Interfaces:**
- Consumes: `ProjectExport`.
- Produces: `export function notShownCounts(payload: ProjectExport): Record<string, Record<string, number>>` — groupId → bucket name → count, for the material no chip reaches.

The spec's anti-goal 1 applies to what this page does not show: `parked`, `orphans`, `unclustered`, `stranded`, `strayOutcomes`, `looseResponses`, and synthesis' legacy theme-level `chain`. Each gets a count, surfaced as a small per-group note naming where it lives — not a chip, never a silent omission.

- [ ] **Step 1: Write the failing test**

```ts
it("counts the material no chip reaches, per group", () => {
  const counts = notShownCounts(FIXTURE);
  const g1 = counts[FIXTURE.groups[0].groupId];
  expect(Object.keys(g1).sort()).toEqual(
    ["chain", "looseResponses", "orphans", "parked", "strandedMilestones", "strayOutcomes", "unclustered"].sort()
  );
  expect(Object.values(g1).every((n) => Number.isInteger(n) && n >= 0)).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/cross-group-shape.test.ts -t "no chip reaches"`
Expected: FAIL — `notShownCounts is not a function`

- [ ] **Step 3: Implement `notShownCounts`, render the notes, add the dashboard link**

The link goes in the **"Design groups"** section beside Implications / Cohort analysis / Group activity, using the existing link class in that block — not the "Content · Carmelita" row above it, which holds member-facing `/project/<slug>/…` links.

- [ ] **Step 4: Verify**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all green. Then confirm the link appears on `/admin/projects/public-health` and reaches the board.

- [ ] **Step 5: Commit**

```bash
git add lib/cross-group-shape.ts lib/cross-group-shape.test.ts \
  "app/admin/projects/[slug]/page.tsx" components/admin/CrossGroupBoard.tsx
git commit -m "Cross-group board: reachable from the dashboard, honest about what it omits"
```

---

## Self-Review

**Spec coverage.** Layout and chip-at-a-time → Tasks 1, 5. Flat cards with parent tags → Tasks 2, 3. Field table including Session 2's own map → Tasks 2, 3. Field identity by week index → Task 1. Uncertainty grid, resolved rows only, empty-string handling, unmatched rows, options on expand → Tasks 4, 6. Live platform source with graceful degradation → Tasks 4, 5. Exports → Task 7. Dashboard link → Task 8. Anti-goal 1's not-shown material → Task 8. Divergent programs and the `never` guard → Tasks 1, 5.

**One deviation from the spec, recorded.** The spec says "All fields" should extend `crossGroupCsvRows` and have "This field" filter it. Task 7 builds both from `columnsFor` instead, because `exerciseCsvRows` is week-and-section shaped and cannot express a chip — a response tagged with its parent outcome has no row shape there. The spec's actual concern was two "everything" CSVs that disagree; that is answered by leaving the dashboard's existing lossless export as the whole-project record and linking to it from the board, and by Task 1's `never` guard carrying the same protection into the registry. Flagging rather than silently diverging.

**Types.** `CrossGroupField`, `CrossGroupCell`, `CrossGroupColumn`, `UncertaintyRow`, `UncertaintyCell`, `UncertaintyGrid` are each defined once and used under those names throughout. `columnsFor` keeps one signature across Tasks 2, 3 and 7.

**Review Focus.** All five have a pinned test: no-groups and divergent-program in Task 5, gap week in Task 2, platform-down in Task 4, unknown week type in Task 1.

**Proportion.** Eight tasks over roughly four new modules and three components, with code blocks confined to test assertions and signatures. No step carries a function body the signature and tests already determine.
