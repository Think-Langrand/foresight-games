// Client-safe types + pure helpers for Session 4, the SYNTHESIS board (internally still
// "commitments": the render key, the card kinds and this module keep that name because it is
// stored data and a rename would touch every row).
// No server imports — safe in client components, route handlers, and tests.
//
// The week, in six activities over three steps:
//
//   1.1 Reconnect              optional discussion notes against the scenario and Session 3
//   1.2 Prioritize             Session 3's risks and opportunities scored on impact and
//                              likelihood; the scores SUGGEST three, the group CONFIRMS them
//   2.1 Desired outcomes       one or two outcomes written under each priority
//   2.2 Strategic responses    response ideas written under each outcome
//   3.1 Vision                 one statement the group agrees on
//   3.2 Three bold moves       three recommendations, each explained by three questions
//
// Where each activity's work actually lives:
//
//   1.1 — an authored worksheet section (`w4-notes`), so its answers are ordinary STICKY
//         cards carrying the section key.
//   1.2 — `pick` cards, ROOTS carrying a `source_card_id` pointing at the Session 3 risk or
//         opportunity they bring onto this board. 0018's unique (code, source_card_id)
//         allows exactly one card per source, so everything act 2 says about an issue rides
//         on its pick:
//           · `plausibility` / `impact`  → the two scores (likelihood is stored as
//                                          plausibility; only the label differs from Week 2)
//           · `shortlisted`              → CONFIRMED as one of the three priorities
//           · `description`              → why it needs attention
//         Which three are the priorities is `prioritySlots()`: confirmed picks first, then
//         the highest-scoring unconfirmed picks fill the remaining slots as SUGGESTIONS.
//         The optional "anything else we should not overlook" is an authored section
//         (`w4-overlook`) on the same tab.
//   2.1 — `outcome` cards, SECOND under the pick they are written for. Many per pick.
//   2.2 — `response` cards, TERMINAL under the outcome they advance. A ROOT response is
//         legacy data from the untagged wall and still reads (`looseResponses`).
//   3.1 — an authored section (`w4-role`, labelled "Our vision"), rendered as ONE statement.
//   3.2 — a `direction` ROOT card per bold move, its `text` the move itself, with three
//         `sharpen` children carrying the further questions, the field in `section`
//         (DIRECTION_FIELDS). "How the three moves work together" is an authored section
//         (`w4-together`) on the same tab.
//
// THE AUTHORED SECTIONS ARE DELIBERATELY ABSENT FROM THIS MODULE. Their wording lives in
// the exercise's `sections` column and is editable in the admin block editor with no
// deploy; the answers are read by buildQuestions / WorksheetSections' own bySection.
//
// NOTHING ON AN EARLIER BOARD IS MUTATED. A priority on a Session 3 risk is derived from a
// pick here, not stored there — which is why the handoff deck can render one without
// Session 4 ever touching Session 3's cards.
//
// RETIRED, STILL READ. `w4-disputed` in a pick's `section` was act 2's "still disputed"
// flag before the overlook field replaced it; `milestone` and `settled` belong to the
// backcast timeline and the old handoff step. Their shaping stays so a board worked under
// an older shape still reads; the deck gates them behind SHOW_BACKCASTING / SHOW_UNSETTLED.

import { isTreeRoot, type RippleCard } from "@/lib/ripples-types";
import { compareByRank, rankValue } from "@/lib/ripples-scoring";

// ---------------------------------------------------------------------------
// The timeline's periods
// ---------------------------------------------------------------------------
// A ten-year span in two-year steps, backcast from the aspiration.
//
// THE KEYS ARE PERMANENT AND THE LABELS ARE NOT. A key is written onto every milestone's
// `section` and is the only link back to the column it belongs in, so renaming one orphans
// every card ever filed under it. They are deliberately opaque for that reason: the span,
// the years, and the framing can all be rewritten by editing `label` alone, with no data
// touched and no migration.
//
// This is a SECOND, code-owned use of `ripple_cards.section`, alongside the WorksheetSection
// keys that steps 1's answers carry. That is safe and is meant to stay safe: every reader of
// worksheet sections filters on `order === "STICKY"` first (buildQuestions in
// lib/group-answers-shape, bySection in components/workshop/WorksheetSections), and a
// milestone is a tree card, so it can never surface as a stray or "removed" question block.
// Do not "tidy" either filter away.
export const PERIODS = [
  { key: "w4-p1", label: "2027–28", short: "27–28" },
  { key: "w4-p2", label: "2029–30", short: "29–30" },
  { key: "w4-p3", label: "2031–32", short: "31–32" },
  { key: "w4-p4", label: "2033–34", short: "33–34" },
  { key: "w4-p5", label: "2035–36", short: "35–36" },
] as const;

export type PeriodKey = (typeof PERIODS)[number]["key"];

export const PERIOD_KEYS: readonly PeriodKey[] = PERIODS.map((p) => p.key);

const PERIOD_SET = new Set<string>(PERIOD_KEYS);

export function isCommitmentPeriod(v: unknown): v is PeriodKey {
  return typeof v === "string" && PERIOD_SET.has(v);
}

// ---------------------------------------------------------------------------
// Act 6 — the three fields that sharpen a direction
// ---------------------------------------------------------------------------
// A direction's own TEXT is the move ("what should change?"), so only the three remaining
// questions need cards of their own. Each is a `sharpen` child of the direction with its
// key in `section` — the same parent-plus-section address a milestone uses, for the same
// reason: the parent says which move, `section` says which question about it.
//
// KEYS ARE PERMANENT AND LABELS ARE NOT, exactly as for PERIODS above. The prompt wording
// here is the one piece of act 6 that is NOT admin-editable, because these are fields on a
// card rather than authored sections; changing a `label` is a deploy but touches no data,
// and changing a `key` orphans every answer ever filed under it.
//
// ONE ANSWER PER FIELD, held by the UI and not by the database. Migration 0025's unique
// index covers a fixed list of kinds and is deliberately not extended — the same call
// `milestone` made. A second answer to the same field is surfaced, not hidden: see
// `sharpenFor`.
// The move itself. NOT in DIRECTION_FIELDS, because it is not a child card — it is the
// direction's own text, and a card with no move is not a direction with a field missing,
// it is nothing. Here so the composer and the step header ask it in the same words.
export const DIRECTION_MOVE = {
  label: "The move",
  prompt: "What strategic direction, initiative, or action do you recommend?",
  placeholder: "Write your recommendation…",
} as const;

// One placeholder for the three explaining fields; the prompts differ, the box does not.
export const DIRECTION_FIELD_PLACEHOLDER = "Add a brief explanation…";

export const DIRECTION_FIELDS = [
  {
    key: "w4-dir-purpose",
    label: "The purpose",
    prompt: "Which part of the vision does it advance?",
  },
  {
    key: "w4-dir-rationale",
    label: "The rationale",
    prompt:
      "If successful, how would this change how public health works or what it makes possible in this scenario?",
  },
  {
    key: "w4-dir-requirements",
    label: "The requirements",
    prompt:
      "What roles, capabilities, relationships, or other conditions would need to change or be in place for it to work?",
  },
] as const;

export type DirectionFieldKey = (typeof DIRECTION_FIELDS)[number]["key"];

export const DIRECTION_FIELD_KEYS: readonly DirectionFieldKey[] = DIRECTION_FIELDS.map(
  (f) => f.key
);

const DIRECTION_FIELD_SET = new Set<string>(DIRECTION_FIELD_KEYS);

export function isDirectionField(v: unknown): v is DirectionFieldKey {
  return typeof v === "string" && DIRECTION_FIELD_SET.has(v);
}

// ---------------------------------------------------------------------------
// Act 2 — the retired disputed marker
// ---------------------------------------------------------------------------
// Before the "anything else we should not overlook" field, act 2 let a group flag a pick as
// still disputed by writing this into its `section`. Nothing writes it any more. It is kept
// so a board worked under that shape still reads: `disputed()` below and the admin viewer
// print a legacy flag rather than losing it.
//
// A THIRD code-owned use of `ripple_cards.section`, alongside PERIODS and DIRECTION_FIELDS.
// Safe for the same reason they are: every reader of worksheet sections filters on
// `order === "STICKY"` first, and a pick is never a sticky.
export const LEGACY_DISPUTED_SECTION = "w4-disputed";

// ---------------------------------------------------------------------------
// Act 2 — the two scales, as this week names them
// ---------------------------------------------------------------------------
// THE STORED AXIS IS STILL `plausibility`. Week 2 scored its key changes on plausibility and
// impact and the column, the score route and ImpactMatrix all say so. Session 4 asks the
// same two questions in different words — "likelihood" reads better for a risk than
// "plausibility" does — so only the LABELS change, here, and Week 2's AXIS_LABELS /
// AXIS_ENDS in lib/ripples-scoring stay as they are.
export const PRIORITY_AXIS_LABELS = {
  plausibility: "Likelihood",
  impact: "Impact",
} as const;

export const PRIORITY_AXIS_ENDS = {
  plausibility: { low: "Very unlikely", high: "Very likely" },
  impact: { low: "Small", high: "Very large" },
} as const;

// What each scale asks, and the word for every point on it, for the definition boxes above
// the walls. Ordered 1 to 5.
export const PRIORITY_SCALES = [
  {
    axis: "impact",
    label: "Impact",
    question:
      "How much would this affect communities, public health institutes, or public health's ability to act?",
    words: ["Small", "Limited", "Moderate", "Large", "Very large"],
  },
  {
    axis: "plausibility",
    label: "Likelihood",
    question: "If this scenario came to pass, how likely would this risk or opportunity be?",
    words: ["Very unlikely", "Unlikely", "Neither likely nor unlikely", "Likely", "Very likely"],
  },
] as const;


// ---------------------------------------------------------------------------
// Caps
// ---------------------------------------------------------------------------
// Three moves, because the point of the step is that choosing is the work.
//
// MAX_BOLD_MOVES is the PARKED backcast timeline's cap, over shortlisted responses.
// MAX_DIRECTIONS is act 6's, over `direction` cards. Same number, different things: one
// counts what a retired step picked off a wall, the other what this step writes.
export const MAX_BOLD_MOVES = 3;
export const MAX_DIRECTIONS = 3;

// Five milestones per move across the WHOLE span, free to cluster — not one per period.
// Backcasting from a ten-year horizon rarely lands one beat per biennium; a group clusters
// two near-term steps and leaves a gap, and a per-cell rule would turn that into a refusal.
// Five per move also keeps the board to fifteen cards, which is finishable in a breakout.
export const MILESTONES_PER_MOVE = 5;

// A wall with fewer responses than the cap cannot be down-selected to the cap, so that is
// where step 2 stops being "started".
// Kept although nothing reads it yet: it is the threshold the step-2 directions quote.
export const RESPONSES_FOR_DONE = MAX_BOLD_MOVES;

// Three risks and three opportunities for the handoff. Same cap, same honesty as the bold
// moves: the UI holds it, the database does not, so an over-pick is reported not hidden.
//
// SUPERSEDED BY MAX_PRIORITIES and kept only for the retired handoff step. Act 2 asks for
// three priorities ACROSS BOTH WALLS, not three of each — a group whose scenario is all
// downside should be able to send three risks.
export const MAX_PICKS_PER_KIND = 3;

// Act 2's cap: three priority issues in total, risks and opportunities together.
export const MAX_PRIORITIES = 3;

// Step 2's FLOOR, not a cap. At least this many risks and this many opportunities go on the
// matrix, and a group may place as many more as it likes.
//
// A floor rather than a cap because of two facts about the real boards. Session 3's optional
// fields came back empty in all four groups, so anything not asked for does not happen; and
// the stake counts run from 14 to 44 per group, so a cap tuned for one group starves
// another. A floor asks for enough to be a judgement and lets a thorough group be thorough.
export const PLACED_FLOOR_PER_KIND = 5;

// ---------------------------------------------------------------------------
// The board
// ---------------------------------------------------------------------------
export interface CommitmentsBoard {
  // EVERY live response, nested or not, in board order: the legacy roots first, then each
  // outcome's in outcome order. Counts, the rail and the CSV read the whole pool here.
  responses: RippleCard[];
  // Act 2.2's shape. A response is written under the outcome it advances; `looseResponses`
  // are ROOT responses from boards worked before that, still shown rather than lost.
  responsesByOutcome: Map<string, RippleCard[]>; // outcomeId → its responses
  looseResponses: RippleCard[];
  // Act 2.1. pickId → the desired outcomes written for that priority, in order.
  outcomes: Map<string, RippleCard[]>;
  boldMoves: RippleCard[]; // the shortlisted responses, in wall order — step 3's picks
  // responseId → period → its milestones. Keyed by EVERY live response, not only the bold
  // moves: un-ticking a move must not strand its milestones, and re-ticking it must bring
  // them back. The timeline draws `boldMoves`; the data keeps the rest.
  milestones: Map<string, Map<PeriodKey, RippleCard[]>>;
  // Step 5. Keyed by the EARLIER card each one marks, so a view that has the Session 3 or
  // Session 1 cards in hand can ask "is this one picked" with a map lookup and never needs
  // to scan. A source that appears twice is impossible: 0018's unique (code, source_card_id).
  picks: Map<string, RippleCard>; // sourceCardId → the pick marking it
  settled: Map<string, RippleCard>; // sourceCardId → the mark saying it is no longer open
  // Act 6's recommendations, in board order. Roots of kind `direction`; the move itself is
  // the card's own text.
  directions: RippleCard[];
  // directionId → field key → the answers sharpening it.
  sharpen: Map<string, Map<DirectionFieldKey, RippleCard[]>>;
  parked: RippleCard[]; // set aside, non-STICKY
  // Cards no bucket could legitimately hold: a response hung off something, a milestone with
  // no parent, a milestone whose period is missing or unrecognised, a milestone under a card
  // that is not a live response. Surfaced rather than dropped — see the note below.
  orphans: RippleCard[];
}

// `sort` first, creation time as the tiebreak. Every card starts at sort 0, so a board
// nobody has reordered still reads in creation order; dragging assigns real sort values.
const byOrder = (a: RippleCard, b: RippleCard) =>
  a.sort - b.sort || a.createdTime.localeCompare(b.createdTime);

// Index a whole Session 4 board in one pass. Every Session 4 selector reads this, so callers
// should memoize it on the card array rather than re-scanning.
//
// ORPHANS ARE SHOWN, NOT LOST. A milestone whose period is unrecognised belongs to no column
// and a milestone under a deleted move hangs off a parent no lane walks to; either one would
// otherwise sit in the database drawn by no view, visible to nobody and deletable by nobody.
// That is the same contract indexSynthesisBoard's `orphans` carries, and it is why the write
// routes refuse an unknown period with a 400 rather than storing null.
export function indexCommitmentsBoard(cards: RippleCard[]): CommitmentsBoard {
  const looseResponses: RippleCard[] = [];
  const directions: RippleCard[] = [];
  const parked: RippleCard[] = [];
  const orphans: RippleCard[] = [];
  // Flat first, bucketed only once we know which parents are live.
  const byParent = new Map<string, RippleCard[]>();
  const sharpenByParent = new Map<string, RippleCard[]>();
  const outcomesByParent = new Map<string, RippleCard[]>();
  const responsesByParent = new Map<string, RippleCard[]>();
  const pickRows: RippleCard[] = [];
  const settledRows: RippleCard[] = [];
  const push = (m: Map<string, RippleCard[]>, k: string, c: RippleCard) => {
    const arr = m.get(k);
    if (arr) arr.push(c);
    else m.set(k, [c]);
  };

  for (const c of cards) {
    // Step 1's answers live on the sections, not here. See the header.
    if (c.order === "STICKY") continue;
    if (c.parked) {
      parked.push(c);
      continue;
    }
    if (c.cardKind === "response") {
      // Under the outcome it advances, or a ROOT from the untagged wall this week used to
      // have. Anything else is a response to nothing this board draws.
      if (isTreeRoot(c)) looseResponses.push(c);
      else if (c.parentId) push(responsesByParent, c.parentId, c);
      else orphans.push(c);
      continue;
    }
    if (c.cardKind === "outcome") {
      // Written FOR a priority, so it has to hang off a pick. Whether that pick is live is
      // settled below, once the picks are indexed.
      if (c.parentId) push(outcomesByParent, c.parentId, c);
      else orphans.push(c);
      continue;
    }
    if (c.cardKind === "direction") {
      if (isTreeRoot(c)) directions.push(c);
      else orphans.push(c);
      continue;
    }
    if (c.cardKind === "pick" || c.cardKind === "settled") {
      // A mark with nothing to mark is not a finding about anything.
      if (c.sourceCardId) (c.cardKind === "pick" ? pickRows : settledRows).push(c);
      else orphans.push(c);
      continue;
    }
    if (c.cardKind === "milestone") {
      // Both halves of a milestone's address have to be there: a parent to say which move
      // it belongs to, and a known period to say which column.
      if (c.parentId && isCommitmentPeriod(c.section)) {
        const arr = byParent.get(c.parentId);
        if (arr) arr.push(c);
        else byParent.set(c.parentId, [c]);
      } else {
        orphans.push(c);
      }
      continue;
    }
    if (c.cardKind === "sharpen") {
      // Same two-part address as a milestone: a parent saying which direction, a known
      // field key saying which of the three questions it answers.
      if (c.parentId && isDirectionField(c.section)) {
        const arr = sharpenByParent.get(c.parentId);
        if (arr) arr.push(c);
        else sharpenByParent.set(c.parentId, [c]);
      } else {
        orphans.push(c);
      }
      continue;
    }
    // Any other kind on a Session 4 board is a card from another week's shape that has no
    // home here. Deliberately not an exhaustive switch over CardKind: this board owns two
    // kinds and adding an unrelated one elsewhere should not have to touch this file.
    orphans.push(c);
  }

  looseResponses.sort(byOrder);

  // Reachability. Being in `byParent` is not the same as being reachable: a milestone under
  // a parked or deleted response, or under another milestone, sits under a parent no lane
  // ever walks to.
  const live = new Set(looseResponses.map((r) => r.id));
  const milestones = new Map<string, Map<PeriodKey, RippleCard[]>>();
  for (const [parentId, arr] of byParent) {
    if (!live.has(parentId)) {
      orphans.push(...arr);
      continue;
    }
    const periods = new Map<PeriodKey, RippleCard[]>();
    for (const c of arr.sort(byOrder)) {
      // Narrowed in the loop above, so this is a read rather than a re-check.
      const key = c.section as PeriodKey;
      const cell = periods.get(key);
      if (cell) cell.push(c);
      else periods.set(key, [c]);
    }
    milestones.set(parentId, periods);
  }

  directions.sort(byOrder);
  const liveDirections = new Set(directions.map((d) => d.id));

  // Act 6's sharpening answers, under the same reachability rule as the milestones above.
  const sharpen = new Map<string, Map<DirectionFieldKey, RippleCard[]>>();
  for (const [parentId, arr] of sharpenByParent) {
    if (!liveDirections.has(parentId)) {
      // ORPHANS, NOT A "STRANDED" LIST. A direction has no un-chosen state the way a
      // shortlisted response does: it is written, edited or deleted, and 0007's cascade
      // takes its children with it. So the only way a sharpening answer outlives its
      // parent is a parked or malformed direction, which is exactly what `orphans` is for.
      // An earlier version of this file carried a `strandedSharpening` helper that copied
      // the milestone shape without the second state that makes it work, so it could only
      // ever return [] while the admin viewer promised to report what it found.
      orphans.push(...arr);
      continue;
    }
    const fields = new Map<DirectionFieldKey, RippleCard[]>();
    for (const c of arr.sort(byOrder)) {
      // Narrowed in the loop above, so this is a read rather than a re-check.
      const key = c.section as DirectionFieldKey;
      const cell = fields.get(key);
      if (cell) cell.push(c);
      else fields.set(key, [c]);
    }
    sharpen.set(parentId, fields);
  }

  // The picks, in the wall's own order, so a lane's position matches its card's.
  const boldMoves = looseResponses.filter((r) => r.shortlisted);

  // Newest wins if a source somehow carries two marks, and the LOSER GOES TO ORPHANS rather
  // than nowhere. 0018's unique (code, source_card_id) makes this unreachable from the UI,
  // but an earlier version silently dropped the loser into no bucket at all, which is the
  // exact failure this module's orphan contract exists to prevent.
  const index = (rows: RippleCard[]) => {
    const m = new Map<string, RippleCard>();
    for (const c of rows.sort(byOrder)) {
      const prev = m.get(c.sourceCardId!);
      if (prev) orphans.push(prev);
      m.set(c.sourceCardId!, c);
    }
    return m;
  };

  const picks = index(pickRows);
  const settled = index(settledRows);

  // Act 2.1's outcomes, under a LIVE pick. A pick is live once it is in `picks`; an outcome
  // under anything else — a deleted pick, a response, a direction — is filed nowhere a
  // step walks to, so it is an orphan.
  const livePicks = new Set([...picks.values()].map((p) => p.id));
  const outcomes = new Map<string, RippleCard[]>();
  for (const [parentId, arr] of outcomesByParent) {
    if (!livePicks.has(parentId)) {
      orphans.push(...arr);
      continue;
    }
    outcomes.set(parentId, arr.sort(byOrder));
  }

  // Act 2.2's responses, under a live outcome, in the same contract.
  const liveOutcomes = new Set([...outcomes.values()].flat().map((o) => o.id));
  const responsesByOutcome = new Map<string, RippleCard[]>();
  for (const [parentId, arr] of responsesByParent) {
    if (!liveOutcomes.has(parentId)) {
      orphans.push(...arr);
      continue;
    }
    responsesByOutcome.set(parentId, arr.sort(byOrder));
  }

  // The whole pool, in a stable order: legacy roots first, then each priority's outcomes'
  // responses in pick order. `priorities()` is not consulted here on purpose — the pool is
  // every response the group wrote, whatever the ranking does afterwards.
  const responses: RippleCard[] = [...looseResponses];
  for (const pick of [...picks.values()].sort(byOrder)) {
    for (const o of outcomes.get(pick.id) ?? []) {
      responses.push(...(responsesByOutcome.get(o.id) ?? []));
    }
  }

  orphans.sort(byOrder);

  return {
    responses,
    responsesByOutcome,
    looseResponses,
    outcomes,
    directions,
    boldMoves,
    milestones,
    picks,
    settled,
    sharpen,
    parked,
    orphans,
  };
}

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------
export function milestonesFor(
  board: CommitmentsBoard,
  moveId: string,
  period: PeriodKey
): RippleCard[] {
  return board.milestones.get(moveId)?.get(period) ?? [];
}

// Every milestone under a move, across the whole span. The cap counts these, not a cell.
export function milestoneCount(board: CommitmentsBoard, moveId: string): number {
  const periods = board.milestones.get(moveId);
  if (!periods) return 0;
  let n = 0;
  for (const arr of periods.values()) n += arr.length;
  return n;
}

export function canAddMilestone(board: CommitmentsBoard, moveId: string): boolean {
  return milestoneCount(board, moveId) < MILESTONES_PER_MOVE;
}

// Milestones under a live response the group has since un-ticked. Not orphans: the cards are
// intact and come back the moment the move is picked again. They are reported so the UI can
// say so, because "where did my timeline go" is otherwise a silent loss.
export function strandedMilestones(board: CommitmentsBoard): RippleCard[] {
  const bold = new Set(board.boldMoves.map((m) => m.id));
  const out: RippleCard[] = [];
  for (const [moveId, periods] of board.milestones) {
    if (bold.has(moveId)) continue;
    for (const arr of periods.values()) out.push(...arr);
  }
  return out.sort(byOrder);
}





// --- act 6: the fields that sharpen a direction ----------------------------------------
// Every answer filed under one field of one direction. A list rather than a single card
// because the database does not enforce one-per-field (see DIRECTION_FIELDS): the UI edits
// the first and the extras stay visible rather than becoming invisible duplicates.
export function sharpenFor(
  board: CommitmentsBoard,
  directionId: string,
  field: DirectionFieldKey
): RippleCard[] {
  return board.sharpen.get(directionId)?.get(field) ?? [];
}

/** How many of a direction's three fields carry an answer. */
export function sharpenCount(board: CommitmentsBoard, directionId: string): number {
  const fields = board.sharpen.get(directionId);
  if (!fields) return 0;
  return DIRECTION_FIELD_KEYS.filter((k) => (fields.get(k)?.length ?? 0) > 0).length;
}

/** A direction is sharpened when all three of its fields are answered. */
export function isSharpened(board: CommitmentsBoard, directionId: string): boolean {
  return sharpenCount(board, directionId) === DIRECTION_FIELD_KEYS.length;
}

/** Whether another direction can be written. Held here, not by the database — see above. */
export function canAddDirection(board: CommitmentsBoard): boolean {
  return board.directions.length < MAX_DIRECTIONS;
}

// --- act 2: priorities ---------------------------------------------------------------
export function isPicked(board: CommitmentsBoard, sourceId: string): boolean {
  return board.picks.has(sourceId);
}

// One of the three slots on the "confirm your three priorities" panel.
//
// `confirmed` is the group's choice, stored as `shortlisted` on the pick. `suggested` is
// the scores' choice, derived: the highest-ranked picks that are not confirmed, filling
// whatever slots the confirmed ones leave. The panel shows both, labelled, and the group
// keeps or replaces each suggestion until all three are its own.
export type PrioritySlot = { card: RippleCard; status: "confirmed" | "suggested" };

/**
 * The three priorities, strongest first, each labelled with how it got there.
 *
 * SCORES SUGGEST, THE GROUP CONFIRMS. An earlier shape read the three straight off the
 * ranking, which meant a group could never say "this 3x4 matters more to us than that 4x4"
 * without re-scoring a card it had scored honestly. The shape before THAT was a bare star
 * that could disagree with the scores on the same row. This is the middle: the ranking
 * fills the slots so nobody starts from nothing, and confirming or replacing is one click.
 *
 * CONFIRMING WINS SELECTION, NOT POSITION. A confirmed pick holds a slot whatever it
 * scored, so a 1x1 the group chose keeps its place over a 5x5 it did not: that is the
 * point of confirming, and it is decided below when the slots are filled. What it no
 * longer does is float to the top. The rows are then sorted by rank alone, and the badge
 * is the only thing that says which are the group's and which are the ranking's.
 *
 * WHY THE BADGE CARRIES IT ALONE. Status used to be said twice, by the chip and by the
 * position, and the second one moved cards nobody touched: confirming any pick re-sorted
 * it into a block above the suggestions, so a neighbouring row jumped a place for reasons
 * the group could not see. Undo made it worse, because walking back a Replace moves three
 * cards between the blocks one at a time. Rank is stable under confirming, so ordering on
 * rank alone means a Keep or an Undo changes one chip and nothing else.
 *
 * FEWER THAN THREE before anything is scored (an unscored pick is never suggested), and
 * MORE THAN THREE only if more than three are confirmed, which the panel reports rather
 * than hides. Ties are not extended: a suggestion is a suggestion, and the group settles
 * a dead heat by confirming one of them.
 */
export function prioritySlots(board: CommitmentsBoard): PrioritySlot[] {
  const all = [...board.picks.values()];
  // SELECTION FIRST, and here confirming still outranks the ranking: the confirmed picks
  // take their slots, and the suggestions fill only what is left over.
  const confirmed = all.filter((p) => p.shortlisted).sort(compareByRank);
  const room = Math.max(0, MAX_PRIORITIES - confirmed.length);
  const suggested = all
    .filter((p) => !p.shortlisted && rankValue(p) !== null)
    .sort(compareByRank)
    .slice(0, room);
  // THEN ORDER, on rank alone, across both. compareByRank is a total order and sinks an
  // unscored card to the end, so a confirmed pick whose scores were cleared mid-flight
  // shows last rather than at a position that implies a score it does not have.
  return [
    ...confirmed.map((card) => ({ card, status: "confirmed" as const })),
    ...suggested.map((card) => ({ card, status: "suggested" as const })),
  ].sort((a, b) => compareByRank(a.card, b.card));
}

/** The priorities as cards, slot order. Every reader of "the three" goes through this. */
export function priorities(board: CommitmentsBoard): RippleCard[] {
  return prioritySlots(board).map((s) => s.card);
}

export function isPriority(board: CommitmentsBoard, sourceId: string): boolean {
  return priorities(board).some((p) => p.sourceCardId === sourceId);
}

/** Scored picks not currently in a slot: what "Replace" offers. Strongest first. */
export function replaceCandidates(board: CommitmentsBoard): RippleCard[] {
  const slotted = new Set(priorities(board).map((p) => p.id));
  return [...board.picks.values()]
    .filter((p) => !slotted.has(p.id) && rankValue(p) !== null)
    .sort(compareByRank);
}

/**
 * Picks flagged as still disputed under the RETIRED shape. Nothing writes this flag any
 * more; it is read so a board worked before the overlook field still shows what it said.
 */
export function disputed(board: CommitmentsBoard): RippleCard[] {
  return [...board.picks.values()]
    .filter((p) => p.section === LEGACY_DISPUTED_SECTION)
    .sort(byOrder);
}

export function isDisputed(board: CommitmentsBoard, sourceId: string): boolean {
  return board.picks.get(sourceId)?.section === LEGACY_DISPUTED_SECTION;
}

// --- act 2.1 and 2.2: outcomes under priorities, responses under outcomes ---------------
export function outcomesFor(board: CommitmentsBoard, pickId: string): RippleCard[] {
  return board.outcomes.get(pickId) ?? [];
}

export function responsesFor(board: CommitmentsBoard, outcomeId: string): RippleCard[] {
  return board.responsesByOutcome.get(outcomeId) ?? [];
}

/** Every outcome under a current priority, in slot order then board order. */
export function allOutcomes(board: CommitmentsBoard): RippleCard[] {
  return priorities(board).flatMap((p) => outcomesFor(board, p.id));
}

/**
 * Outcomes written under a pick that is no longer one of the three. Not orphans: the cards
 * are intact and come back the moment that issue is a priority again. Reported so act 2.1
 * can say "no longer a priority" rather than lose the group's writing silently.
 */
export function strayOutcomes(board: CommitmentsBoard): { pick: RippleCard; outcomes: RippleCard[] }[] {
  const slotted = new Set(priorities(board).map((p) => p.id));
  const out: { pick: RippleCard; outcomes: RippleCard[] }[] = [];
  for (const pick of [...board.picks.values()].sort(byOrder)) {
    if (slotted.has(pick.id)) continue;
    const outcomes = outcomesFor(board, pick.id);
    if (outcomes.length > 0) out.push({ pick, outcomes });
  }
  return out;
}

/** How many of the current priorities carry at least one outcome. */
export function outcomeCoverage(board: CommitmentsBoard): number {
  return priorities(board).filter((p) => outcomesFor(board, p.id).length > 0).length;
}

// An earlier uncertainty is STILL OPEN unless the group has said otherwise. The default
// matters: a group that does nothing on step 5 leaves an honest record rather than an empty
// one, which is the opposite of how a star behaves.
export function isStillOpen(board: CommitmentsBoard, sourceId: string): boolean {
  return !board.settled.has(sourceId);
}
