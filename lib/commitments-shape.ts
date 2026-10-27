// Client-safe types + pure helpers for Session 4, the COMMITMENTS board.
// No server imports — safe in client components, route handlers, and tests.
//
// The week, in six activities: the group reconnects with the scenario, picks three
// PRIORITIES off Session 3's risk and opportunity walls, says what outcomes it wants,
// opens a wall of strategic responses, sets a VISION, then WRITES three DIRECTIONS and
// sharpens each with three further answers.
//
// Where each activity's work actually lives:
//
//   act 1 — authored worksheet sections ("what most needs our attention", "what to keep in
//           mind"), so their answers are ordinary STICKY cards carrying a section key.
//   act 2 — `pick` cards, ROOTS carrying a `source_card_id` pointing at the Session 3 risk
//           or opportunity they bring onto this board. WHICH ONES ARE PRIORITIES IS NOT
//           STORED: it is the top of the ranking, read back by `priorities()`. The one
//           marker that IS stored rides on the pick rather than being a card of its own,
//           because 0018's unique (code, source_card_id) allows exactly one card per
//           source:
//             · `section === DISPUTED_SECTION`  → still disputed; why is in `description`
//           It is independent of the ranking: a priority may also be disputed, and the
//           issue a room cannot agree on is often the one it scored low.
//           (`shortlisted` was the priority marker, set by a star on the matrix. The star
//           is gone — see `priorities()` — and the column means nothing on a pick now.)
//   act 3 — an authored section (`w4-outcomes`). Flat, with the priorities shown as
//           context rather than nested under them.
//   act 4 — `response` cards, tree roots, one per strategic response.
//   act 5 — an authored section (`w4-role`, labelled "Set the vision").
//   act 6 — a `direction` ROOT card per recommendation, its `text` the move itself, with
//           three `sharpen` children carrying the further questions, the field in
//           `section` (DIRECTION_FIELDS).
//
//           WRITTEN, NOT PICKED. An earlier shape made a direction a `response` carrying
//           `shortlisted`, so act 4's wall was the menu act 6 chose from. On a finished
//           board that left no way to tell where the three had come from or why those
//           three — the thing the activity exists to make explicit. The wall is context in
//           the rail now, which is what it always was.
//
// THE AUTHORED SECTIONS ARE DELIBERATELY ABSENT FROM THIS MODULE. Their wording lives in
// the exercise's `sections` column and is editable in the admin block editor with no
// deploy; the answers are read by buildQuestions / WorksheetSections' own bySection.
// Teaching this module about them would pull that wording into code and undo the point.
//
// NOTHING ON AN EARLIER BOARD IS MUTATED. A star on a Session 3 risk is derived from a
// pick here, not stored there — which is why the handoff deck can render one without
// Session 4 ever touching Session 3's cards.
//
// `milestone` and `settled` belong to retired steps (the backcast timeline, the old
// handoff). Their shaping stays so a board worked under the old structure still reads; the
// deck gates them behind SHOW_BACKCASTING / SHOW_UNSETTLED.

import { isTreeRoot, type RippleCard } from "@/lib/ripples-types";
import {
  cardScores,
  compareByRank,
  rankValue,
  topScoredWithTies,
} from "@/lib/ripples-scoring";

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
  prompt: "What should change?",
} as const;

export const DIRECTION_FIELDS = [
  {
    key: "w4-dir-purpose",
    label: "The purpose",
    prompt: "Which priority and desired outcome does it address?",
  },
  {
    key: "w4-dir-rationale",
    label: "The rationale",
    prompt: "Why does it make sense under these scenario conditions?",
  },
  {
    key: "w4-dir-requirements",
    label: "The requirements",
    prompt: "What would need to change from today, or be in place, for it to work?",
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
// Act 2 — the disputed marker
// ---------------------------------------------------------------------------
// "Note any consequential issue where disagreement remains." A dispute is not a card of
// its own: 0018's unique (code, source_card_id) permits exactly ONE card per Session 3
// source, and that card is the pick. So the mark rides on the pick, in `section`.
//
// A THIRD code-owned use of `ripple_cards.section`, alongside PERIODS and DIRECTION_FIELDS.
// Safe for the same reason they are: every reader of worksheet sections filters on
// `order === "STICKY"` first, and a pick is never a sticky.
export const DISPUTED_SECTION = "w4-disputed";


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
  responses: RippleCard[]; // kind 'response', tree roots, not parked — step 2's wall
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
  const responses: RippleCard[] = [];
  const directions: RippleCard[] = [];
  const parked: RippleCard[] = [];
  const orphans: RippleCard[] = [];
  // Flat first, bucketed into periods only once we know which parents are live.
  const byParent = new Map<string, RippleCard[]>();
  const sharpenByParent = new Map<string, RippleCard[]>();
  const pickRows: RippleCard[] = [];
  const settledRows: RippleCard[] = [];

  for (const c of cards) {
    // Step 1's answers live on the sections, not here. See the header.
    if (c.order === "STICKY") continue;
    if (c.parked) {
      parked.push(c);
      continue;
    }
    if (c.cardKind === "response") {
      // A response is the wall's own card; hung off something it is not a response to
      // anything this board draws.
      if (isTreeRoot(c)) responses.push(c);
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

  responses.sort(byOrder);

  // Reachability. Being in `byParent` is not the same as being reachable: a milestone under
  // a parked or deleted response, or under another milestone, sits under a parent no lane
  // ever walks to.
  const live = new Set(responses.map((r) => r.id));
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
  const boldMoves = responses.filter((r) => r.shortlisted);

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

  orphans.sort(byOrder);

  return {
    responses,
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

// --- act 2: priorities, and what is still disputed --------------------------------------
export function isPicked(board: CommitmentsBoard, sourceId: string): boolean {
  return board.picks.has(sourceId);
}

/**
 * The group's priorities: the highest-scoring issues on the matrix, strongest first.
 *
 * DERIVED, NOT CHOSEN. This was a manual star, and the star was a second mechanism that
 * could disagree with the scores — a group would score "shut out of the system" 5×5 and
 * still see a 3×4 in the rail because that was what somebody had clicked. The scoring step
 * IS the prioritising step, so there is nothing left to click: score the walls and the
 * three fall out. (`shortlisted` on a pick is now dead for priorities; it still carries
 * act 6's directions, which really are a choice.)
 *
 * MORE THAN THREE WHEN THE SCORES TIE, and FEWER THAN THREE before the walls are scored —
 * see topScoredWithTies. A half-scored issue has no defensible place on the matrix and so
 * none at the top of it either.
 */
export function priorities(board: CommitmentsBoard): RippleCard[] {
  const ranked = [...board.picks.values()].sort(compareByRank);
  return topScoredWithTies(ranked, MAX_PRIORITIES, (c) => ({
    value: rankValue(c),
    impact: cardScores(c).impact,
  }));
}

export function isPriority(board: CommitmentsBoard, sourceId: string): boolean {
  return priorities(board).some((p) => p.sourceCardId === sourceId);
}

/**
 * Picks the group flagged as still disputed. Independent of `priorities` — an issue can be
 * both, and the most interesting ones usually are.
 */
export function disputed(board: CommitmentsBoard): RippleCard[] {
  return [...board.picks.values()]
    .filter((p) => p.section === DISPUTED_SECTION)
    .sort(byOrder);
}

export function isDisputed(board: CommitmentsBoard, sourceId: string): boolean {
  return board.picks.get(sourceId)?.section === DISPUTED_SECTION;
}

// An earlier uncertainty is STILL OPEN unless the group has said otherwise. The default
// matters: a group that does nothing on step 5 leaves an honest record rather than an empty
// one, which is the opposite of how a star behaves.
export function isStillOpen(board: CommitmentsBoard, sourceId: string): boolean {
  return !board.settled.has(sourceId);
}
