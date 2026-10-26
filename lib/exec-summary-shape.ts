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
  // WHAT THIS DRAFT WAS BUILT FROM — a fingerprint of the Session 4 material the model read,
  // written only on the generate path. It is how the route tells "the group changed an
  // answer, so rebuild" from "the group came back to read it, so leave it alone", which a
  // timestamp cannot do. See execSummaryReuse.
  //
  // OPTIONAL, because drafts stored before fingerprinting have none, and because a lead the
  // group wrote has nothing to compare: it is never regenerated over whatever is asked.
  sourceHash?: string;
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
    // Carried through rather than defaulted: absent is a meaningful state here, and it has
    // to survive the round trip through this function or every stored draft would come back
    // looking like it predates fingerprinting.
    ...(typeof r.sourceHash === "string" && r.sourceHash ? { sourceHash: r.sourceHash } : {}),
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
    { label: "Structure & assumptions", done: s.changesTotal === 0 || s.changes >= s.changesTotal },
    { label: "Risks & opportunities", done: s.placements >= 1 },
    { label: "Strategic responses", done: s.responses >= 1 },
    { label: "Identity & direction", done: s.movesTotal === 0 || s.moves >= s.movesTotal },
  ];
  const missing = steps.filter((x) => !x.done).map((x) => x.label);
  return { ready: missing.length === 0, missing, steps };
}

// WHETHER THE COMPOSER SHOULD TAKE THE STORED LEAD IT HAS JUST BEEN HANDED.
//
// The composer keeps the text in local state, because that is what a textarea needs. So it
// has to reconcile when the stored lead changes underneath it, and there are two ways that
// happens: step 5 mounts while the board's refresh is still in flight and the draft lands a
// moment later, and another member drafts, saves or deletes and realtime pushes the new
// config to every open board.
//
// UNSAVED EDITS WIN, ALWAYS. Losing words a group has typed would be the worst bug this
// feature could have, so a dirty box is never overwritten — not by a draft, not by another
// member's save, not by a delete. They keep what they are writing and their own Save still
// settles it.
//
// Compared on text AND source: saving text back unchanged flips source to "edited" and
// nothing else, and the chip above the box is read from exactly that.
export function shouldAdoptExecSummary(
  adopted: ExecSummaryOverride | null,
  incoming: ExecSummaryOverride | null,
  dirty: boolean
): boolean {
  if (dirty) return false;
  if (!adopted && !incoming) return false;
  if (!adopted || !incoming) return true;
  return adopted.text !== incoming.text || adopted.source !== incoming.source;
}

// WHETHER THE GENERATE ROUTE SHOULD SPEND A MODEL CALL, or hand back what is stored.
//
// THE OLD TEST WAS THE DRAFT'S AGE, and it was wrong. An unedited draft over a minute old
// was assumed to mean the group had undone a step and redone it, so the material had
// changed and the draft was stale. But simply reopening a finished board looked exactly the
// same, so every revisit silently rewrote the lead the group was reading and billed another
// call. The minute only ever separated "two browsers in the same second" from everything
// else; it could not separate a changed answer from a returning reader.
//
// SO ASK THE MATERIAL. A draft carries a fingerprint of the Session 4 work it was built
// from, and a draft built from exactly what is on the board now is current by definition —
// however long ago it was written, and however many members open the board.
//
// The rules, in the order they win:
//
//   A LEAD THE GROUP WROTE is never regenerated over, whatever is asked, force included.
//   Those are their words.
//
//   FORCE replaces an unedited draft. That is "Draft again", the one place where replacing
//   a machine draft is the intent.
//
//   A MATCHING FINGERPRINT is reused. Nothing has changed, so there is nothing to say.
//
//   NO FINGERPRINT is reused too. Drafts written before this existed have no provenance to
//   compare, and treating unknown as stale would regenerate every one of them on the next
//   board open — the exact behaviour being fixed. "Draft again" is the way out, and it
//   stamps a fingerprint on its way through.
export function execSummaryReuse(
  existing: ExecSummaryOverride | null,
  fingerprint: string,
  force: boolean
): "reuse" | "generate" {
  if (existing?.source === "edited") return "reuse";
  if (!existing) return "generate";
  if (force) return "generate";
  if (!existing.sourceHash) return "reuse";
  return existing.sourceHash === fingerprint ? "reuse" : "generate";
}
