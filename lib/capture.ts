// Client-safe capture config for the Cards game.
//
// This is the single place to reshape the scenario-capture step: reword prompts,
// reorder them, swap the fill-in sentence, or trim the starter set. Both the team
// form (CardsTeamView) and the projector (CardsPresentView) read from here, and
// the field keys line up 1:1 with columns on the Team record.

// --- fill-in-the-blank warm-up sentence (stored in Team.convergence) ---
export const CAPTURE_SENTENCE = {
  key: "convergence" as const,
  label: "In one sentence",
  // Alternative to try later — the "It is 2035…" template — just swap this string.
  template:
    "Because ___ has developed in this direction, ___ becomes increasingly common. This causes or enables ___, which ultimately changes ___ for public health.",
};

// --- Heather's five "internal logic" prompts ---
export type CapturePromptKey =
  | "definingCharacteristics"
  | "centralTension"
  | "newNormal"
  | "brokenAssumption";

export interface CapturePrompt {
  key: CapturePromptKey;
  // Short heading, used on the recap and projector.
  label: string;
  // The plain-language question the team answers in the build wizard.
  question: string;
  rows: number;
}

export const CAPTURE_PROMPTS: CapturePrompt[] = [
  {
    key: "definingCharacteristics",
    label: "Defining characteristics",
    question: "What two or three things are true across this whole world?",
    rows: 3,
  },
  {
    key: "newNormal",
    label: "The new normal",
    question: "What has become normal here that would feel strange today?",
    rows: 2,
  },
  {
    key: "brokenAssumption",
    label: "Broken assumption",
    question: "What assumption about public health no longer holds?",
    rows: 2,
  },
];

export const CAPTURE_TITLE = {
  key: "worldTitle" as const,
  label: "World title",
  question: "What would you call this world?",
  placeholder: "A short, evocative name for this future",
};

// Down-selected set of dimensions a group can be SEEDED from (the "critical"
// starters, per Heather). Each group is dealt a distinct one so no two start the
// same. Defaults to the core building-block dimensions — everything except the
// baseline/wildcard "threat environment". Trim to the specific handful here.
export const STARTER_DIMENSIONS: string[] = [
  "The shape of the public",
  "Where trust lives",
  "How health truth is established",
  "Public health's permission to act",
  "The institutional base",
  "The workforce model",
  "AI infrastructure and access",
  "What public health can see",
  "Control of body data",
  "The model of prevention",
  "The structure of care",
  "Individual and movement power",
];
