// Client-safe types + pure helpers for Session 4, the COMMITMENTS board.
// No server imports — safe in client components, route handlers, and tests.
//
// The week: a group says what it is aspiring to inside the scenario, opens a wall of
// strategic responses that would get there, down-selects three of them as BOLD MOVES, then
// backcasts each move into milestones across a ten-year span in two-year steps.
//
// Where each step's work actually lives:
//
//   step 1 — the aspiration prompts are AUTHORED WORKSHEET SECTIONS, so their answers are
//            ordinary STICKY cards carrying a section key, exactly like Session 1's. They
//            are deliberately absent from this module: the prompts' wording lives in the
//            exercise's `sections` column and is editable in the admin block editor with no
//            deploy, and the answers are read by buildQuestions / WorksheetSections' own
//            bySection. Teaching this module about them would pull that wording into code
//            and undo the whole point.
//   step 2 — `response` cards, tree roots, one per strategic response.
//   step 3 — `shortlisted` on a `response`. No separate card and no rank column: migration
//            0022 says shortlist_rank is cleanly additive and to not pre-build it, and the
//            response's own `sort` is already the wall's drag order, so one list has one
//            order and the lanes cannot disagree with the wall.
//   step 4 — `milestone` cards, children of a response, with the period in `section`.
//   step 5 — `pick` and `settled` cards, both ROOTS carrying a `source_card_id` that points
//            at an EARLIER week's card. Nothing on an earlier board is mutated: a star on a
//            Session 3 risk is derived from a pick here, not stored there. That keeps every
//            write on this board, the way every other step works, and it is why the handoff
//            deck can render a star without Session 4 ever touching Session 3's cards.

import { isTreeRoot, type RippleCard } from "@/lib/ripples-types";
import type { ThemeProgress } from "@/lib/synthesis-shape";

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

export function periodLabel(key: PeriodKey): string {
  return PERIODS.find((p) => p.key === key)?.label ?? key;
}

// ---------------------------------------------------------------------------
// Caps
// ---------------------------------------------------------------------------
// Three moves, because the point of the step is that choosing is the work.
export const MAX_BOLD_MOVES = 3;

// Five milestones per move across the WHOLE span, free to cluster — not one per period.
// Backcasting from a ten-year horizon rarely lands one beat per biennium; a group clusters
// two near-term steps and leaves a gap, and a per-cell rule would turn that into a refusal.
// Five per move also keeps the board to fifteen cards, which is finishable in a breakout.
export const MILESTONES_PER_MOVE = 5;

// A wall with fewer responses than the cap cannot be down-selected to the cap, so that is
// where step 2 stops being "started".
export const RESPONSES_FOR_DONE = MAX_BOLD_MOVES;

// Three risks and three opportunities for the handoff. Same cap, same honesty as the bold
// moves: the UI holds it, the database does not, so an over-pick is reported not hidden.
export const MAX_PICKS_PER_KIND = 3;

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
  const parked: RippleCard[] = [];
  const orphans: RippleCard[] = [];
  // Flat first, bucketed into periods only once we know which parents are live.
  const byParent = new Map<string, RippleCard[]>();
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

  // The picks, in the wall's own order, so a lane's position matches its card's.
  const boldMoves = responses.filter((r) => r.shortlisted);

  // Newest wins if a source somehow carries two marks. The unique index makes that
  // impossible today, but the shape should not depend on a constraint to be total.
  const index = (rows: RippleCard[]) => {
    const m = new Map<string, RippleCard>();
    for (const c of rows.sort(byOrder)) m.set(c.sourceCardId!, c);
    return m;
  };

  orphans.sort(byOrder);

  return {
    responses,
    boldMoves,
    milestones,
    picks: index(pickRows),
    settled: index(settledRows),
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

// ---------------------------------------------------------------------------
// Per-step progress, for the step row's glyphs
// ---------------------------------------------------------------------------
// Step 2 is done once there is something to choose between. Under three responses there is
// no down-select to make, only a formality.
export function responseProgress(board: CommitmentsBoard): ThemeProgress {
  const n = board.responses.length;
  if (n === 0) return "empty";
  return n >= RESPONSES_FOR_DONE ? "done" : "started";
}

// Step 3 reports the count against the cap rather than a tri-state, because "2 of 3" is the
// thing a group needs to see. `picked` can exceed the cap: the cap is enforced in the UI and
// not by the database, so two people ticking at once can land a fourth, and the shape's job
// is to say so rather than to hide it.
export function boldMoveProgress(board: CommitmentsBoard): { picked: number; cap: number } {
  return { picked: board.boldMoves.length, cap: MAX_BOLD_MOVES };
}

// Step 4 is a fraction of what the picked moves could hold, so an unpicked wall reads as
// capacity 0 rather than as a timeline that is somehow complete.
export function timelineProgress(board: CommitmentsBoard): {
  placed: number;
  capacity: number;
  movesStarted: number;
} {
  let placed = 0;
  let movesStarted = 0;
  for (const move of board.boldMoves) {
    const n = milestoneCount(board, move.id);
    placed += n;
    if (n > 0) movesStarted += 1;
  }
  return { placed, capacity: board.boldMoves.length * MILESTONES_PER_MOVE, movesStarted };
}

// ---------------------------------------------------------------------------
// Step 5: the handoff
// ---------------------------------------------------------------------------
// How many of a given pool the group has starred. The pool is an earlier week's cards, so
// the caller passes their ids; this counts the marks that point at them.
export function pickedFrom(board: CommitmentsBoard, sourceIds: Iterable<string>): string[] {
  const out: string[] = [];
  for (const id of sourceIds) if (board.picks.has(id)) out.push(id);
  return out;
}

export function isPicked(board: CommitmentsBoard, sourceId: string): boolean {
  return board.picks.has(sourceId);
}

// An earlier uncertainty is STILL OPEN unless the group has said otherwise. The default
// matters: a group that does nothing on step 5 leaves an honest record rather than an empty
// one, which is the opposite of how a star behaves.
export function isStillOpen(board: CommitmentsBoard, sourceId: string): boolean {
  return !board.settled.has(sourceId);
}
