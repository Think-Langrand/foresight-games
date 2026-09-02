// Client-safe registry of design-group EXERCISE TYPES. No server imports — safe in
// client components, route handlers, and tests.
//
// A design group runs a program of exercises (weeks). Each exercise has a `type`
// that decides how it renders and whether it needs a shared board:
//   - implications        → the existing RipplesTeamView (tree + one brainstorm)
//   - scenario-assessment → a spec-driven WorksheetView (brainstorm + question areas)
//   - placeholder         → "being designed" panel; no board
//
// A worksheet type declares SECTIONS. Every section's cards are STICKY ripple_cards
// tagged with the section `key` (ripple_cards.section), so one board hosts several
// named areas. Two section kinds, same card substrate, different rendering:
//   - brainstorm → a free wall of stickies
//   - question   → a prompt with accumulating short answer cards (concurrency-safe)

export type ExerciseRender = "implications" | "worksheet" | "placeholder";
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
export type ExerciseStatus = "placeholder" | "scheduled" | "locked" | "open";

export interface ExerciseGate {
  type: string;
  sessionCode: string | null;
  locked: boolean;
  opensAt: string | null; // ISO; null = open now
}

// A week is: `placeholder` (no board / unimplemented type), `scheduled` (opens_at in
// the future), `locked` (admin lock), or `open` (members can edit). Schedule is
// checked before the lock so a not-yet-open week reads as "Opens {date}".
export function exerciseStatus(ex: ExerciseGate, nowMs: number): ExerciseStatus {
  if (!isBoardBacked(ex.type) || !ex.sessionCode) return "placeholder";
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

export function exerciseTypeLabel(id: string): string {
  return EXERCISE_TYPES[id]?.label ?? id;
}

// Does this type need a backing shared-board Ripples session? (Unknown types are
// treated as board-backed=false so a bad value never tries to provision a board.)
export function isBoardBacked(id: string): boolean {
  return EXERCISE_TYPES[id]?.boardBacked ?? false;
}

// The default program seeded when a group's scenario is assigned. Session 1 = scenario
// assessment, Session 2 = implication mapping, Sessions 3-4 = TBD placeholders.
export interface ProgramWeek {
  sort: number;
  type: string;
  title: string;
}
export const DEFAULT_PROGRAM: ProgramWeek[] = [
  { sort: 0, type: "scenario-assessment", title: "Session 1 · Scenario Assessment" },
  { sort: 1, type: "implications", title: "Session 2 · Implication Mapping" },
  { sort: 2, type: "placeholder", title: "Session 3 · TBD" },
  { sort: 3, type: "placeholder", title: "Session 4 · Synthesis (TBD)" },
];
