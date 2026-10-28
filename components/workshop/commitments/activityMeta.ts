// Session 4's six activities, the three steps they sit in, and every piece of copy the
// board's chrome prints for each: the tracker pill, the eyebrow, the minutes, the headline,
// the intro, the starter questions, the checklist and the continue button.
//
// ONE REGISTRY, NO REACT. The tracker, the header, the checklist and the continue button all
// read from here, so the tab a group is on, the heading above it and the button under it
// cannot name three different things. Copy that belongs to a BOARD rather than to the
// chrome — a wall's placeholder, a slot's chip — stays in that board's file.
//
// NO EM DASHES. House rule; middots and colons do the joining.

export type CommitStep =
  | "reconnect"
  | "prioritize"
  | "outcomes"
  | "responses"
  | "vision"
  | "directions"
  | "review";

// The six activities in order, then the handoff.
export const COMMIT_STEPS: readonly CommitStep[] = [
  "reconnect",
  "prioritize",
  "outcomes",
  "responses",
  "vision",
  "directions",
  "review",
];

export type ActivityStep = Exclude<CommitStep, "review">;
export const ACTIVITY_STEPS: readonly ActivityStep[] = [
  "reconnect",
  "prioritize",
  "outcomes",
  "responses",
  "vision",
  "directions",
];

// The three steps of the tracker, each holding two activities.
export interface ActivityGroup {
  n: number;
  label: string;
  steps: readonly [ActivityStep, ActivityStep];
}
export const ACTIVITY_GROUPS: readonly ActivityGroup[] = [
  { n: 1, label: "Set priorities", steps: ["reconnect", "prioritize"] },
  { n: 2, label: "Explore responses", steps: ["outcomes", "responses"] },
  { n: 3, label: "Define strategy", steps: ["vision", "directions"] },
];

export const REVIEW_LABEL = "Review handoff →";

// Starter questions come in two shapes: a bulleted list under a blue rule, or (act 1.1
// only) four numbered cards.
export type Starters =
  | { title: string; items: readonly string[] }
  | { title: string; cards: readonly { label: string; question: string }[] };

export interface ActivityMeta {
  code: string; // "1.1"
  pill: string; // "Reconnect", as the tracker prints it after the code
  eyebrow: string; // "STEP 1 · PART 1 OF 2 · RECONNECT"
  minutes: number;
  headline: string;
  intro: string;
  starters: Starters;
  checklistTitle?: string;
  checklist: readonly string[];
  next: CommitStep;
  nextLabel: string;
}

export const ACTIVITY_META: Record<ActivityStep, ActivityMeta> = {
  reconnect: {
    code: "1.1",
    pill: "Reconnect",
    eyebrow: "Step 1 · Part 1 of 2 · Reconnect",
    minutes: 5,
    headline: "Looking across everything, what matters most?",
    intro:
      "Revisit your scenario and the themes, risks, opportunities, hopes, and fears from Session 3. Use the questions below to get back into the conversation. A brief discussion is enough; written notes are optional.",
    starters: {
      title: "Starter questions",
      cards: [
        { label: "Protect", question: "What do we most want to protect?" },
        {
          label: "Create or make possible",
          question: "What do we most want to create or make possible?",
        },
        { label: "Prevent", question: "What do we most want to prevent?" },
        {
          label: "Manage",
          question:
            "What tensions are we unlikely to eliminate, and may instead need to manage?",
        },
      ],
    },
    checklist: [],
    next: "prioritize",
    nextLabel: "Continue to prioritize →",
  },
  prioritize: {
    code: "1.2",
    pill: "Prioritize",
    eyebrow: "Step 1 · Part 2 of 2 · Prioritize",
    minutes: 10,
    headline: "Which three risks or opportunities most need our attention?",
    intro:
      "Score risks and opportunities as a group. Score at least five of each, or all if there are fewer. Give each item a score for impact and likelihood. Review the suggested priorities, then confirm your top three.",
    starters: {
      title: "Consider as you score",
      items: [
        "Which risks or opportunities would have the greatest consequences?",
        "What conditions in this scenario make each risk or opportunity more or less likely?",
      ],
    },
    checklist: [
      "We reviewed both risks and opportunities.",
      "We can explain why these three need our attention.",
    ],
    next: "outcomes",
    nextLabel: "Continue to desired outcomes →",
  },
  outcomes: {
    code: "2.1",
    pill: "Desired outcomes",
    eyebrow: "Step 2 · Part 1 of 2 · Desired outcomes",
    minutes: 15,
    headline: "What would better look like for each priority?",
    intro:
      "For each priority, write one or two short outcomes describing what you want to be different for people, communities, and public health. Draw on your hopes from Session 3.",
    starters: {
      title: "Starter questions",
      items: [
        "What would people be able to count on if public health responded well?",
        "What harm would be reduced, or what opportunity would become possible?",
        "Who should benefit, especially those who might otherwise be left out?",
      ],
    },
    checklist: [
      "Our outcomes describe a difference for people, communities, or public health.",
      "Each priority gives us a clear starting point for brainstorming.",
    ],
    next: "responses",
    nextLabel: "Continue to strategic responses →",
  },
  responses: {
    code: "2.2",
    pill: "Strategic responses",
    eyebrow: "Step 2 · Part 2 of 2 · Strategic responses",
    minutes: 30,
    headline: "What could NNPHI and institutes do to achieve these outcomes?",
    intro:
      "Start with a few minutes of individual thinking, then share and build on one another's ideas. Use the outcomes to get started. Explore several ways to achieve them, including ideas that support more than one outcome. Write one idea per card: what could we do?",
    starters: {
      title: "Starter questions",
      items: [
        "What different approaches could achieve the outcome?",
        "What could NNPHI, institutes, communities, or partners each contribute?",
        "What could we do differently, and what bigger possibilities have we not considered?",
      ],
    },
    checklist: [
      "We explored several approaches, including ideas beyond current practice.",
      "We have a broad pool of ideas to draw from.",
      "Our responses fit the conditions and constraints of the scenario.",
    ],
    next: "vision",
    nextLabel: "Continue to vision →",
  },
  vision: {
    code: "3.1",
    pill: "Vision",
    eyebrow: "Step 3 · Part 1 of 2 · Vision",
    minutes: 15,
    headline: "What must public health become to help communities thrive in this world?",
    intro:
      "Look across your priorities, hopes, desired outcomes, and response ideas. Describe the kind of public health that could make these aspirations possible. Write a two- to three-sentence vision statement about what public health would aspire to, what it would make possible for communities, the role it would play, and how it would operate differently.",
    starters: {
      title: "Starter questions",
      items: [
        "What role would public health play in working with communities and other organizations across the wider health ecosystem?",
        "What would be fundamentally different about how it operates, shares power, or works with others?",
        "What should public health be especially capable of doing under these conditions?",
      ],
    },
    checklist: [
      "Our vision describes a future worth working toward for communities.",
      "It makes clear how public health’s role or way of working would change in this scenario.",
      "It gives us a clear basis for setting a strategy.",
    ],
    next: "directions",
    nextLabel: "Continue to three bold moves →",
  },
  directions: {
    code: "3.2",
    pill: "Three bold moves",
    eyebrow: "Step 3 · Part 2 of 2 · Three bold moves",
    minutes: 30,
    headline: "What three major changes would establish the public health described in our vision?",
    intro:
      "Draw from the full pool of response ideas. Combine and extend them into three bold strategic recommendations for NNPHI and institutes. Each move should establish an essential part of the public health described in your vision. Explain what would change, why it matters, and how the three moves work together. This is your recommendation for an overarching strategy. Detailed planning comes later.",
    starters: {
      title: "Starter questions",
      items: [
        "What three strategic directions or pillars would make the greatest contribution to achieving this vision?",
        "Which response ideas belong together as one larger change?",
        "How would these changes reinforce one another, and what would we need to stop or do differently?",
      ],
    },
    checklistTitle: "Check the three moves together",
    checklist: [
      "These moves would change how public health works and what it makes possible.",
      "The three moves have distinct roles and reinforce one another.",
      "Together, they would make meaningful progress toward our vision.",
    ],
    next: "review",
    nextLabel: REVIEW_LABEL,
  },
};

// Which of the three steps an activity belongs to, for the tracker's progress bars.
export function groupOf(step: ActivityStep): ActivityGroup {
  return ACTIVITY_GROUPS.find((g) => g.steps.includes(step))!;
}

/** "1.1 Reconnect", as the tracker prints it. */
export function pillLabel(step: ActivityStep): string {
  const m = ACTIVITY_META[step];
  return `${m.code} ${m.pill}`;
}
