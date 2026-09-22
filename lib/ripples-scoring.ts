// Client-safe scoring + ranking helpers for the implication map's RANK step.
// No server imports — safe in client components, route handlers, and tests.
//
// Session 2 opens by ranking the key changes (the map's tree roots, seeded from Session
// 1) on two 1–5 axes: how PLAUSIBLE the change is, and how much IMPACT it would have.
// There is ONE score per key change — a decision the group reaches together, not an
// average of per-member votes — so it lives on the card itself
// (ripple_cards.plausibility / .impact, migration 0019).
//
// The RANKING is never stored. Only the two axes are; everything below derives from
// them, so a re-score instantly re-ranks the list, the matrix and all three map views
// with no second write and nothing to keep in sync.

import { isTreeRoot, type RippleCard } from "@/lib/ripples-types";

// ---------------------------------------------------------------------------
// The scale
// ---------------------------------------------------------------------------
export const SCORE_MIN = 1;
export const SCORE_MAX = 5;

export type Score = 1 | 2 | 3 | 4 | 5;
export type ScoreAxis = "plausibility" | "impact";

// Both axes, in the order they're asked. Iterated by the route (to build a patch) and
// by the panel (to render the two button rows), so neither can drift from the other.
export const SCORE_AXES: readonly ScoreAxis[] = ["plausibility", "impact"];

export const AXIS_LABELS: Record<ScoreAxis, string> = {
  plausibility: "Plausibility",
  impact: "Impact",
};

// The ends of each scale, for the hints under the button rows.
export const AXIS_ENDS: Record<ScoreAxis, { low: string; high: string }> = {
  plausibility: { low: "Far-fetched", high: "Near certain" },
  impact: { low: "Marginal", high: "Transformative" },
};

export const SCORE_VALUES: readonly Score[] = [1, 2, 3, 4, 5];

// What the scoring UI emits: the one axis the user just set. Never null — clearing a
// score is a route-level capability (send an explicit null), not something the button
// rows can do, since there is no "unset" button.
export type ScorePatchInput = { plausibility?: Score; impact?: Score };

export function isScore(v: unknown): v is Score {
  return typeof v === "number" && Number.isInteger(v) && v >= SCORE_MIN && v <= SCORE_MAX;
}

// Coerce anything — a JSON body field, a jsonb round-trip, a stray string — to a Score
// or null. This is the ONLY place the range is decided; the route and every renderer go
// through it, so a bad value can never reach the DB or crash a board. Numeric strings
// are accepted ("4" → 4): request bodies are hand-rollable and a string digit is
// unambiguous. Everything else (0, 6, 3.5, "", NaN, Infinity, objects) reads as null.
export function coerceScore(v: unknown): Score | null {
  if (typeof v === "string") {
    const trimmed = v.trim();
    if (!/^\d+$/.test(trimmed)) return null;
    const n = Number(trimmed);
    return isScore(n) ? n : null;
  }
  return isScore(v) ? v : null;
}

// ---------------------------------------------------------------------------
// Per-card reads
// ---------------------------------------------------------------------------

// A card's scores, normalised. Out-of-range junk in the DB reads as null rather than
// throwing, so one bad row can't take a board down (same tolerance as depthOfOrder).
export function cardScores(card: RippleCard): { plausibility: Score | null; impact: Score | null } {
  return { plausibility: coerceScore(card.plausibility), impact: coerceScore(card.impact) };
}

// Both axes set? A half-scored key change doesn't rank — there's no defensible place to
// put it on the matrix.
export function isScored(card: RippleCard): boolean {
  const { plausibility, impact } = cardScores(card);
  return plausibility !== null && impact !== null;
}

// The ranking value: plausibility × impact (1..25). null when either axis is unset.
// Multiplicative, not additive: a sum makes 5+1 tie with 3+3, which is exactly the
// distinction the matrix exists to draw. Changing the formula is a change to this
// function alone — nothing else knows it.
export function rankValue(card: RippleCard): number | null {
  const { plausibility, impact } = cardScores(card);
  return plausibility === null || impact === null ? null : plausibility * impact;
}

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------
export interface RankedRoot {
  card: RippleCard;
  plausibility: Score | null;
  impact: Score | null;
  value: number | null; // rankValue
  rank: number | null; // 1-based among FULLY scored roots; null while unscored
}

// Fully scored first by value desc, ties by impact desc → plausibility desc →
// createdTime asc; unscored roots keep createdTime order at the end. Total and
// deterministic, so an unstable Array.sort can never reshuffle a board between renders.
function compareRoots(a: RippleCard, b: RippleCard): number {
  const av = rankValue(a);
  const bv = rankValue(b);
  if (av === null && bv === null) return a.createdTime.localeCompare(b.createdTime);
  if (av === null) return 1; // unscored sinks
  if (bv === null) return -1;
  if (av !== bv) return bv - av;
  const as = cardScores(a);
  const bs = cardScores(b);
  // Same product, so impact is the tiebreak: 5×3 outranks 3×5.
  if (as.impact !== bs.impact) return (bs.impact ?? 0) - (as.impact ?? 0);
  if (as.plausibility !== bs.plausibility) return (bs.plausibility ?? 0) - (as.plausibility ?? 0);
  return a.createdTime.localeCompare(b.createdTime);
}

// The tree roots (key changes) in rank order, each carrying its scores and its 1-based
// rank. Non-root and STICKY cards are never included.
export function rankedRoots(cards: RippleCard[]): RankedRoot[] {
  const roots = cards.filter(isTreeRoot).sort(compareRoots);
  let rank = 0;
  return roots.map((card) => {
    const { plausibility, impact } = cardScores(card);
    const value = rankValue(card);
    return { card, plausibility, impact, value, rank: value === null ? null : ++rank };
  });
}

// cardId → 1-based rank, for the fully scored roots only. What the tree, wheel and list
// badge with; an absent id simply renders no badge.
export function rankByCardId(cards: RippleCard[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rankedRoots(cards)) {
    if (r.rank !== null) m.set(r.card.id, r.rank);
  }
  return m;
}

// Stable root ordering for any renderer, without needing the rank map. Returns a NEW
// array (Array.sort mutates, and these lists come straight out of a memo). Identical to
// the given order when no root is scored, which is what keeps the solo/standalone game
// and every pre-scoring board rendering exactly as before.
export function sortRootsByRank(roots: RippleCard[]): RippleCard[] {
  return [...roots].sort(compareRoots);
}

// ---------------------------------------------------------------------------
// The 5×5 matrix readout
// ---------------------------------------------------------------------------
export interface MatrixCell {
  plausibility: Score; // x
  impact: Score; // y
  cards: RippleCard[]; // the roots in this cell, in rank order
}

// Always exactly 25 cells in a stable order — impact 5→1 (top row first), plausibility
// 1→5 within a row — so a renderer can drop them straight onto a 5-column grid without
// any coordinate maths. Half-scored and non-root cards land in no cell at all.
export function matrixCells(cards: RippleCard[]): MatrixCell[] {
  const ranked = rankedRoots(cards);
  const out: MatrixCell[] = [];
  for (let impact = SCORE_MAX; impact >= SCORE_MIN; impact--) {
    for (let plausibility = SCORE_MIN; plausibility <= SCORE_MAX; plausibility++) {
      out.push({
        plausibility: plausibility as Score,
        impact: impact as Score,
        cards: ranked
          .filter((r) => r.plausibility === plausibility && r.impact === impact)
          .map((r) => r.card),
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

// How far the group has got. `total` counts every key change on the board (STICKY notes
// and implications are not key changes); `scored` counts those with BOTH axes set.
export function scoringProgress(cards: RippleCard[]): { scored: number; total: number } {
  const roots = cards.filter(isTreeRoot);
  return { scored: roots.filter(isScored).length, total: roots.length };
}

// Every key change scored — drives the "now move on to the map" nudge. A board with no
// key changes at all is NOT complete (nothing has been ranked yet), so the nudge can't
// fire vacuously on an unseeded board.
export function scoringComplete(cards: RippleCard[]): boolean {
  const { scored, total } = scoringProgress(cards);
  return total > 0 && scored === total;
}
