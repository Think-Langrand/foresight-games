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
  group?: string; // optional cluster heading (sections sharing a group render together)
  help?: string; // guidance text under the heading
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
const SCENARIO_ASSESSMENT_SECTIONS: WorksheetSection[] = [
  { key: "reactions", kind: "brainstorm", label: "First reactions", help: "Initial thoughts as you read the scenario together." },
  {
    key: "assess-important",
    kind: "question",
    group: "Assess the scenario",
    label: "What feels most important or distinctive?",
  },
  {
    key: "assess-unclear",
    kind: "question",
    group: "Assess the scenario",
    label: "What feels unclear, incomplete, or difficult to understand?",
  },
  {
    key: "assess-assumptions",
    kind: "question",
    group: "Assess the scenario",
    label: "What assumptions does the scenario appear to make?",
  },
  {
    key: "assess-missing",
    kind: "question",
    group: "Assess the scenario",
    label: "Is anything important missing that would need to be true for this future to make sense?",
  },
  {
    key: "stepping-in",
    kind: "brainstorm",
    label: "Stepping into the future — what's different",
    help: "It is now several years into this future. What has become normal that would feel unusual today? What no longer works? What's become easier / harder? Who gained or lost influence? What do people now expect from institutions?",
  },
  {
    key: "key-changes",
    kind: "brainstorm",
    label: "Key changes — brainstorm",
    help: "A key change is a meaningful difference between today and this future that changes the environment public health operates in. Generate as many as you can before narrowing down.",
  },
  {
    key: "six-changes",
    kind: "question",
    label: "Our 6 key changes",
    help: "Choose the 6 changes that most define this future — consequential, distinct from today, important to public health, and different enough from each other to capture the scenario's breadth.",
  },
  {
    key: "parking-lot",
    kind: "brainstorm",
    label: "Parking lot — good ideas for later",
    help: "Implications, risks, opportunities, or actions you notice but should not solve today. Later sessions explore them.",
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

// The default program seeded when a group's scenario is assigned. Week 1 = scenario
// assessment, Week 2 = implication mapping, Weeks 3-4 = TBD placeholders.
export interface ProgramWeek {
  sort: number;
  type: string;
  title: string;
}
export const DEFAULT_PROGRAM: ProgramWeek[] = [
  { sort: 0, type: "scenario-assessment", title: "Week 1 · Scenario Assessment" },
  { sort: 1, type: "implications", title: "Week 2 · Implication Mapping" },
  { sort: 2, type: "placeholder", title: "Week 3 · TBD" },
  { sort: 3, type: "placeholder", title: "Week 4 · Synthesis (TBD)" },
];
