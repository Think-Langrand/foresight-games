// The group's own edit of the handoff's executive summary slide.
//
// AN OVERLAY, NOT AN EDIT OF THE WORK. The slide is projected from Session 4's answers by
// GroupSummary; this is a body of text stored ON TOP of that projection. The board is never
// written to, so "Restore the board's words" is just deleting the key, and a group can
// always get back to what the room actually typed.
//
// Stored at sessions.config.execSummary on the WEEK 4 board — the house pattern for a
// non-card artifact attached to a week (see synthesis-summary-shape.ts for config.summary
// and theme-ideas-shape.ts for config.themeIdeas), and it needs no migration.
//
// DELIBERATELY NOT IN RipplesConfig / resolveConfig(). That function rebuilds config from a
// whitelist, so a key it does not know is simply absent from its output — which is what
// keeps this out of the /ripples payload every member's board fetches. The handoff page
// reads the raw session config instead. Adding it to the whitelist would ship every group's
// draft lead into every participant's devtools for no gain.
//
// ONE BODY OF TEXT, not a patch keyed by the worksheet blocks it was seeded from. A keyed
// patch needs a reconciliation rule for every way a block can later change — renamed, split,
// emptied — and this slide is a lead paragraph, not a form. Whole text needs no such rule,
// and it is the shape a generated précis would want too if that ever arrives.
//
// NO STALENESS TRACKING, on purpose. Once a group writes its own lead, later edits to the
// Session 4 board do not disturb it and nothing says the two have diverged. The full answers
// are still in the deck at slides 10 and 11, which is where a reader checks.

export interface ExecSummaryOverride {
  text: string;
  // WHO WROTE THESE WORDS. A draft the model built from the group's answers is not the same
  // claim as a lead the group wrote, and the deck says so: the chip and the slide's intro
  // both change on this. Defaults to "generated" whenever it cannot be read, because the
  // cautious answer is the one that does not claim a human authored something.
  source: "generated" | "edited";
  editedAt: string; // ISO; "" when the stored blob predates or omits it
  // Display name captured at save time, resolved server-side from the player row. Usually
  // "You" — Sessions 3 and 4 never prompt for a name — so any copy built on this has to
  // read sensibly when it is empty or a placeholder.
  editedBy: string;
}

// The text cap is generous because this is prose a committee reads, not a card: roughly two
// screens. The name cap matches what a board stores for a display name.
export const EXEC_SUMMARY_LIMITS = { text: 4000, editedBy: 80 } as const;

// Blank lines are the paragraph break the slide renders on, so they survive; runs of them,
// trailing spaces and \r\n from a paste do not.
function tidy(s: string): string {
  return s
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Whatever is actually in the config blob, read as an override or as nothing. Tolerant by
// necessity: the blob is free-form JSON written by more than one route.
//
// EMPTY TEXT IS NULL. Clearing the box and saving therefore means the same thing as pressing
// Restore — there is no way to publish a blank lead slide, by accident or otherwise.
export function coerceExecSummary(raw: unknown): ExecSummaryOverride | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;

  const text = tidy(typeof r.text === "string" ? r.text : "").slice(0, EXEC_SUMMARY_LIMITS.text);
  if (!text) return null;

  return {
    text,
    source: r.source === "edited" ? "edited" : "generated",
    editedAt: typeof r.editedAt === "string" ? r.editedAt : "",
    editedBy:
      typeof r.editedBy === "string"
        ? r.editedBy.replace(/\s+/g, " ").trim().slice(0, EXEC_SUMMARY_LIMITS.editedBy)
        : "",
  };
}

// One shaped Week 4 block, as lib/group-summary hands it over.
interface Block {
  key: string;
  label: string;
  answers: string[];
}

// What the editor opens with: the same answers the un-edited slide shows, as paragraphs.
//
// It lives here rather than in the slide so the seed and the default render cannot drift
// apart — a group that opens the editor, changes nothing and saves must not thereby alter
// what the slide said. The two-answer slice mirrors the slide's own.
//
// Labels are left out. The default render groups answers under their worksheet prompts; an
// override is a lead the group wrote, and seeding it with form headings invites them to fill
// in a form instead of writing one.
export function execSummaryDefaultText(changes: Block[], role: Block[]): string {
  const lines: string[] = [];
  for (const b of changes) lines.push(...b.answers.slice(0, 2));
  for (const b of role) lines.push(...b.answers);
  return lines.filter((l) => l.trim()).join("\n\n");
}

// Whether step 5 can offer to draft the lead, and what is still missing if not.
//
// A GATE ON THE MODEL, NOT ON THE GROUP. StepProgress is explicit that nothing on this week
// is enforced, and that stays true: every step remains editable whatever this returns. What
// it guards is a model call, which costs money and produces a thin, confident summary when
// run against three answers and a blank matrix.
//
// A step with no prompts counts as satisfied. Facilitators can edit the program, and a step
// whose prompts were removed can never be answered — holding the button hostage to it would
// be a dead end with no way out from inside the board.
export interface ExecSummarySteps {
  changes: number;
  changesTotal: number;
  placements: number;
  responses: number;
  moves: number;
  movesTotal: number;
}

export function execSummaryReadiness(s: ExecSummarySteps): {
  ready: boolean;
  missing: string[];
  // Every step with its state, not just the gaps. The locked panel shows the whole list so
  // a group can see how close it is — four names with three ticks says that, and a list of
  // the one thing left does not.
  steps: { label: string; done: boolean }[];
} {
  // In tab order, so the panel reads down the page the way the steps do rather than in
  // whatever order the checks happen to run.
  const steps = [
    // A step with no prompts counts as done. Facilitators can edit the program, and a step
    // whose prompts were removed can never be answered — leaving it unticked forever would
    // be a dead end with no way out from inside the board.
    { label: "Key changes", done: s.changesTotal === 0 || s.changes >= s.changesTotal },
    { label: "Risks & opportunities", done: s.placements >= 1 },
    { label: "Strategic responses", done: s.responses >= 1 },
    { label: "Role & bold moves", done: s.movesTotal === 0 || s.moves >= s.movesTotal },
  ];
  const missing = steps.filter((x) => !x.done).map((x) => x.label);
  return { ready: missing.length === 0, missing, steps };
}
