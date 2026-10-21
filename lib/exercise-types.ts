// Client-safe registry of design-group EXERCISE TYPES. No server imports — safe in
// client components, route handlers, and tests.
//
// A design group runs a program of exercises (weeks). Each exercise has a `type`
// that decides how it renders and whether it needs a shared board:
//   - implications        → the existing RipplesTeamView (tree + one brainstorm)
//   - synthesis           → SynthesisTeamView (cluster into themes → explore each →
//                           hopes & fears → flip the fears), Week 3
//   - scenario-assessment → a spec-driven WorksheetView (brainstorm + question areas)
//   - placeholder         → "being designed" panel; no board
//
// A worksheet type declares SECTIONS. Every section's cards are STICKY ripple_cards
// tagged with the section `key` (ripple_cards.section), so one board hosts several
// named areas. Two section kinds, same card substrate, different rendering:
//   - brainstorm → a free wall of stickies
//   - question   → a prompt with accumulating short answer cards (concurrency-safe)

export type ExerciseRender =
  | "implications"
  | "worksheet"
  | "synthesis"
  | "commitments"
  | "placeholder";
export type SectionKind = "brainstorm" | "question";

export interface WorksheetSection {
  key: string; // unique within the type; written onto ripple_cards.section
  kind: SectionKind;
  label: string; // the area's heading / question prompt
  step?: string; // optional wizard/tab bucket — consecutive sections sharing a step render on one tab
  group?: string; // optional cluster heading (sections sharing a group render together)
  help?: string; // guidance text under the heading
  board?: boolean; // brainstorm only: render as a large, board-like canvas (e.g. the Sandbox)
}

export interface ExerciseType {
  id: string;
  label: string;
  render: ExerciseRender;
  boardBacked: boolean; // needs a Ripples session (implications + worksheet); placeholder does not
  sections?: WorksheetSection[]; // for render === "worksheet"
}

// --- Scenario Assessment (Week 1) section spec --------------------------------
// From "NPH01, Design Groups, Meeting 1, Worksheet, v1". The paper's Scenario/Date/
// Lead header is intentionally omitted (the admin already has it). Every exercise
// opens with a brainstorm area ("First reactions").
//
// Sections are grouped into four `step`s, rendered as jump-anywhere tabs:
//   1. First reactions   2. Assess the scenario   3. Stepping into the future
//   4. Sandbox (its own board-like sticky wall).
const SCENARIO_ASSESSMENT_SECTIONS: WorksheetSection[] = [
  {
    key: "reactions",
    kind: "brainstorm",
    step: "First reactions",
    label: "First reactions",
    help: "Initial thoughts as you read the scenario together.",
  },
  {
    key: "assess-important",
    kind: "question",
    step: "Assess the scenario",
    label: "What feels most important or distinctive?",
  },
  {
    key: "assess-unclear",
    kind: "question",
    step: "Assess the scenario",
    label: "What feels unclear, incomplete, or difficult to understand?",
  },
  {
    key: "assess-assumptions",
    kind: "question",
    step: "Assess the scenario",
    label: "What assumptions does the scenario appear to make?",
  },
  {
    key: "assess-missing",
    kind: "question",
    step: "Assess the scenario",
    label: "Is anything important missing that would need to be true for this future to make sense?",
  },
  {
    key: "stepping-in",
    kind: "brainstorm",
    step: "Stepping into the future",
    label: "Stepping into the future — what's different",
    help: "It is now several years into this future. What has become normal that would feel unusual today? What no longer works? What's become easier / harder? Who gained or lost influence? What do people now expect from institutions?",
  },
  {
    key: "key-changes",
    kind: "brainstorm",
    step: "Stepping into the future",
    label: "Key changes — brainstorm",
    help: "A key change is a meaningful difference between today and this future that changes the environment public health operates in. Generate as many as you can before narrowing down.",
  },
  {
    key: "six-changes",
    kind: "question",
    step: "Stepping into the future",
    label: "Our 6 key changes",
    help: "Choose the 6 changes that most define this future — consequential, distinct from today, important to public health, and different enough from each other to capture the scenario's breadth.",
  },
  {
    key: "parking-lot", // permanent card-link id — display name is "Sandbox"
    kind: "brainstorm",
    step: "Sandbox",
    board: true, // its own tab, a large sticky board
    label: "Sandbox — good ideas for later",
    help: "A free space for brainstorming — capture any ideas, questions, or possibilities that come up, including ones you can't act on yet.",
  },
];

// --- Implication Mapping (Week 2), step 3 -------------------------------------
// The RANK and MAP steps are code (the scoring panel and the tree). The third step rides
// the ordinary section substrate, so a facilitator can reword it like any worksheet block.
// It is a single Sandbox — the same free sticky wall Week 1 ends on. Risks & opportunities
// moved to Week 3. Keep every section here on ONE `step`: WorksheetSections then renders
// its flat stack rather than a second tab bar nested inside the exercise's own tabs.
// Keys are permanent ids written onto every answer card's `section` — never rename them.
// Cards still tagged with the retired `implication-risks` / `implication-opportunities`
// keys are not lost: the answer shaping surfaces them under a "removed block" heading.
const IMPLICATIONS_SECTIONS: WorksheetSection[] = [
  {
    key: "implication-sandbox",
    kind: "brainstorm",
    step: "Sandbox",
    board: true, // a large sticky board, like Week 1's parking-lot
    label: "Sandbox — good ideas for later",
    help: "A free space for brainstorming — capture any ideas, questions, or possibilities that come up, including ones you can't act on yet.",
  },
];

// --- Synthesis (Week 3) — no sections -----------------------------------------
// All four steps are code (cluster, theme exploration, hopes & fears, flip the fears), so
// nothing rides the section substrate: every wall on this board is cards of a kind, on a
// theme or on the board itself.
//
// The retired `synthesis-risks`, `synthesis-opportunities` and `synthesis-sandbox` keys
// are NOT reused or renamed — a key is the permanent link to every answer card ever
// written under it. Risks and opportunities are cards on a theme now (step 2), not loose
// stickies. Any card still carrying a retired key surfaces in the admin viewer under a
// "removed block" heading rather than vanishing.
const SYNTHESIS_SECTIONS: WorksheetSection[] = [];

// --- Commitments (Week 4), steps 1 and 4 --------------------------------------
// Steps 2, 3 and 5 are code (the impact matrix, the response wall, the review). Steps 1
// and 4 ride the ordinary section substrate, the same hybrid Week 2 uses for its Sandbox,
// and for the same reason: a facilitator can reword these prompts, add one or drop one, in
// the program editor with no deploy. That is why neither step has card kinds of its own.
//
// `step` buckets them onto a tab. Sections sharing a step render as one flat stack;
// CommitmentsTeamView splits on this, and anything an admin adds with no step falls to
// step 1, which is where an extra question belongs.
//
// KEYS ARE PERMANENT ids written onto every answer card's `section` — never rename one.
// The LABEL is the editable part. `aspiration-statement`, `aspiration-serves`,
// `aspiration-holds` and `handoff-committee-line` are RETIRED, not reused: the week was
// restructured away from a three-part aspiration and a handoff step, and any card still
// carrying one of those keys surfaces in the admin viewer under a "removed block" heading
// rather than vanishing.
//
// `question` rather than `brainstorm` because each prompt accumulates short answers, one
// card each: three people in a breakout have three readings and all three belong on the
// sheet. Migration 0027 is the record of what forcing one answer per question cost.
// Exported so the board filters `sections` on these rather than on string literals it
// would have to keep in sync by hand.
export const COMMITMENTS_STEP_CHANGES = "Key changes";
export const COMMITMENTS_STEP_MOVES = "Bold moves";
// The role's section key, named because the handoff deck gives it a slide of its own and
// has to find it by IDENTITY rather than by position. Keys are permanent (see the header),
// so this is the stable thing to match on; the label belongs to whoever edits the program.
export const COMMITMENTS_KEY_ROLE = "w4-role";
const STEP_CHANGES = COMMITMENTS_STEP_CHANGES;
const STEP_MOVES = COMMITMENTS_STEP_MOVES;

const COMMITMENTS_SECTIONS: WorksheetSection[] = [
  {
    key: "w4-summary",
    kind: "question",
    step: STEP_CHANGES,
    label: "How has the field of public health changed the most in this world?",
    help: "A big-picture question. Not a list of differences, and not one programme: the shape of the field, said so that someone who missed every session would understand it.",
  },
  {
    key: "w4-assumptions",
    kind: "question",
    step: STEP_CHANGES,
    label:
      "What are the biggest assumptions about public health in today's world that aren't true in this scenario?",
    help: "Not what breaks. What nobody argues about today, because everyone takes it for granted, and this world quietly stops being true.",
  },
  {
    key: "w4-role",
    kind: "question",
    step: STEP_MOVES,
    label: "What is the aspirational role for public health in this world?",
    help: "What the field is reaching for here, not what you expect it to settle for. Say it as something already true in this world. The moves below are how you get to it.",
  },
  {
    key: "w4-bold-moves",
    kind: "question",
    step: STEP_MOVES,
    label:
      "What are the boldest moves that can be made in public health in this scenario to help you meet your aspirations?",
    help: "Three of them, one per answer. Something someone does, with your group in the room when it happens.",
  },
];

export const EXERCISE_TYPES: Record<string, ExerciseType> = {
  "scenario-assessment": {
    id: "scenario-assessment",
    label: "Scenario Assessment",
    render: "worksheet",
    boardBacked: true,
    sections: SCENARIO_ASSESSMENT_SECTIONS,
  },
  // A blank worksheet — the target type for admin-built weeks. Its questions live per
  // exercise (design_group_exercises.sections jsonb), authored in the admin editor.
  worksheet: {
    id: "worksheet",
    label: "Worksheet (custom)",
    render: "worksheet",
    boardBacked: true,
    sections: [],
  },
  implications: {
    id: "implications",
    label: "Implication Mapping",
    render: "implications",
    boardBacked: true,
    sections: IMPLICATIONS_SECTIONS,
  },
  // Week 3: cluster Week 2's implications into themes, explore each (four questions,
  // risks, opportunities), brainstorm hopes & fears for the board, then flip the fears.
  // Four code-driven steps on one board.
  synthesis: {
    id: "synthesis",
    label: "Synthesis (Cluster, Exploration, Hopes & Fears, Flip)",
    render: "synthesis",
    boardBacked: true,
    sections: SYNTHESIS_SECTIONS,
  },
  // Week 4: say the aspiration, open a wall of strategic responses, down-select three as
  // bold moves, then backcast each across ten years in two-year steps. Step 1 is sections,
  // steps 2 to 4 are code, all on one board.
  commitments: {
    id: "commitments",
    label: "Commitments (Aspiration, Responses, Bold Moves, Backcasting)",
    render: "commitments",
    boardBacked: true,
    sections: COMMITMENTS_SECTIONS,
  },
  placeholder: {
    id: "placeholder",
    label: "To be designed",
    render: "placeholder",
    boardBacked: false,
  },
};

export const EXERCISE_TYPE_IDS = Object.keys(EXERCISE_TYPES);

// The ordered, de-duplicated list of `step` labels a worksheet declares, in first-
// appearance order — one entry per tab. Empty when no section declares a step, which
// the view reads as "render the flat stack" (backward compatible with un-stepped types).
export function worksheetSteps(sections: WorksheetSection[]): string[] {
  const seen = new Set<string>();
  const steps: string[] = [];
  for (const s of sections) {
    const step = s.step?.trim(); // tolerate stray whitespace in admin-authored data
    if (step && !seen.has(step)) {
      seen.add(step);
      steps.push(step);
    }
  }
  return steps;
}

// Coerce a raw jsonb blob (design_group_exercises.sections) into a clean, well-typed
// WorksheetSection[]. Tolerant of missing/extra keys, bad `kind`, non-object rows, and
// duplicate keys so template drift or hand-edited data never crashes the worksheet.
// Returns [] for anything non-array/empty — the caller then falls back to the code
// template (getExerciseType(type).sections). Mirrors resolveConfig in lib/ripples-types.
export function resolveSections(raw: unknown): WorksheetSection[] {
  if (!Array.isArray(raw)) return [];
  const out: WorksheetSection[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const r = item as Record<string, unknown>;
    const key = typeof r.key === "string" ? r.key.trim() : "";
    if (!key || seen.has(key)) continue; // key is the answer-card link — required + unique
    seen.add(key);
    const section: WorksheetSection = {
      key,
      kind: r.kind === "brainstorm" ? "brainstorm" : "question",
      label: typeof r.label === "string" ? r.label : "",
    };
    // Trim step/group so whitespace variants don't split tabs or cluster headings.
    const step = typeof r.step === "string" ? r.step.trim() : "";
    if (step) section.step = step;
    const group = typeof r.group === "string" ? r.group.trim() : "";
    if (group) section.group = group;
    if (typeof r.help === "string" && r.help) section.help = r.help;
    if (r.board === true) section.board = true;
    out.push(section);
  }
  return out;
}

// Mint a fresh, collision-resistant section key. Keys are permanent IDs written onto every
// answer card's `section`, so the editor only ever mints them — it never renames one.
// Prefers crypto.randomUUID (better entropy); falls back to Math.random where unavailable.
export function newSectionKey(): string {
  const rand =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().replace(/-/g, "")
      : Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  return "sec_" + rand.slice(0, 8);
}

// --- Schedule / lock status (pure; used by the hub and the route gate) --------
export type ExerciseStatus = "placeholder" | "closed" | "scheduled" | "locked" | "open";

export interface ExerciseGate {
  type: string;
  sessionCode: string | null;
  locked: boolean;
  closed: boolean; // admin manually closed it — members can't open (independent of lock/schedule)
  opensAt: string | null; // ISO; null = open now
}

// A week is: `placeholder` (no board / unimplemented type), `closed` (admin manually
// closed it to members), `scheduled` (opens_at in the future), `locked` (admin lock,
// read-only-but-viewable), or `open` (members can edit). `closed` is checked before the
// schedule and lock — it's a hard, manual "not available" that members can't open at all
// (admins bypass at the route/hub layer), whereas `locked` is only read-only.
export function exerciseStatus(ex: ExerciseGate, nowMs: number): ExerciseStatus {
  if (!isBoardBacked(ex.type) || !ex.sessionCode) return "placeholder";
  if (ex.closed) return "closed";
  if (ex.opensAt && Date.parse(ex.opensAt) > nowMs) return "scheduled";
  if (ex.locked) return "locked";
  return "open";
}

// Members may edit only when fully open. (Admins bypass this at the route layer.)
export function exerciseEditable(ex: ExerciseGate, nowMs: number): boolean {
  return exerciseStatus(ex, nowMs) === "open";
}

export function getExerciseType(id: string): ExerciseType | undefined {
  return EXERCISE_TYPES[id];
}

// The sections a week EFFECTIVELY uses: its own snapshot, or the type's code template when
// the snapshot is empty ([] means "fall back to the template"). Answer cards are keyed to
// these section keys, so guards and the canonical program must compare/persist the effective
// set — never the raw (possibly []) column, or a template-backed started week looks keyless.
export function resolveEffectiveSections(type: string, sections: unknown): WorksheetSection[] {
  const snapshot = resolveSections(sections);
  return snapshot.length > 0 ? snapshot : getExerciseType(type)?.sections ?? [];
}

export function exerciseTypeLabel(id: string): string {
  return EXERCISE_TYPES[id]?.label ?? id;
}

// Does this type need a backing shared-board Ripples session? (Unknown types are
// treated as board-backed=false so a bad value never tries to provision a board.)
export function isBoardBacked(id: string): boolean {
  return EXERCISE_TYPES[id]?.boardBacked ?? false;
}

// Does this type render editable worksheet-style question/brainstorm blocks (the section
// substrate)? Worksheets do; the implications, synthesis and commitments boards also render
// blocks alongside their own steps, so all four expose the admin block editor and carry
// per-exercise `sections`. Commitments goes furthest: its whole first step IS sections.
export function supportsSections(id: string): boolean {
  const r = EXERCISE_TYPES[id]?.render;
  return (
    r === "worksheet" || r === "implications" || r === "synthesis" || r === "commitments"
  );
}

// The default program seeded when a group's scenario is assigned. Session 1 = scenario
// assessment, Session 2 = implication mapping, Session 3 = synthesis, Session 4 =
// commitments.
// Only new projects get this; existing groups keep whatever their rows already say, and an
// admin changes a week's type in the program editor. So changing a type here does NOT
// migrate a running cohort: that is a deliberate save in the admin, per group.
export interface ProgramWeek {
  sort: number;
  type: string;
  title: string;
}
export const DEFAULT_PROGRAM: ProgramWeek[] = [
  { sort: 0, type: "scenario-assessment", title: "Session 1 · Scenario Assessment" },
  { sort: 1, type: "implications", title: "Session 2 · Implication Mapping" },
  { sort: 2, type: "synthesis", title: "Session 3 · Synthesis" },
  { sort: 3, type: "commitments", title: "Session 4 · Commitments" },
];

// A CanonicalWeek is the group-AGNOSTIC content of one program week — the single thing
// the admin edits once and fans out to every group (lib/design-program.ts). Groups only
// differ by scenario, so title/type/schedule/questions are shared; the per-group rows
// (design_group_exercises) are just copies kept in lockstep.
export interface CanonicalWeek {
  title: string;
  type: string;
  opensAt: string | null;
  locked: boolean;
  closed: boolean;
  sections: WorksheetSection[];
}

// The default program as CanonicalWeek[] — used to seed the very first group in a project,
// when there are no existing exercises to derive a shared program from.
export function defaultProgramWeeks(): CanonicalWeek[] {
  return DEFAULT_PROGRAM.map((w) => ({
    title: w.title,
    type: w.type,
    opensAt: null,
    locked: false,
    closed: false,
    sections: getExerciseType(w.type)?.sections ?? [],
  }));
}
