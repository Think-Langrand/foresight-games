// The two readings a cohort run needs that the clustering itself cannot produce: where the
// cohort put its WEIGHT (the plausibility and impact the groups actually assigned), and
// what each room managed to FLIP from a fear into a hope.
//
// Client-safe and pure. The loads live in lib/analysis/cohort-analysis.ts.
//
// Both are reconstructions across sessions, which is the awkward part and the reason this
// file exists rather than the numbers being read off a column:
//
//   Scores are on Session 2's key-change roots. Session 3's themes hold COPIES of Session
//   2 implications (sourceCardId points back), so a Session 3 theme's weight has to be
//   inherited through its implications' lineage. Two hops, averaged.
//
//   Flips are Session 3 step 4: a hope written as a child of the fear it answers. Older
//   boards wrote their hopes and fears under a theme rather than on the board, and
//   synthesis-shape keeps that placement working, so both placements have to be walked.
//
// Every derived number carries how much it was derived FROM. A theme positioned from one
// scored member sits in the same place as one positioned from nine, and a view that cannot
// tell them apart invites a confident reading of almost nothing.

import {
  boardChainCards,
  flattenChainCards,
  indexSynthesisBoard,
  lineageByCardId,
} from "@/lib/synthesis-shape";
import type { RippleCard } from "@/lib/ripples-types";
import type { CohortTheme } from "./cohort-cluster-shape";
import type { PoolSource } from "./cohort-pool-shape";

export interface Score {
  plausibility: number | null;
  impact: number | null;
}

export interface ThemeWeight extends Score {
  n: number; // members that carried a score
  missing: number; // members that did not
}

export interface FlipEntry {
  fearId: string;
  fearText: string;
  // What the room wrote on the other side. Plural because a fear can be answered more
  // than once, and because collapsing it to one would quietly drop the others.
  hopes: { id: string; text: string }[];
  flipped: boolean;
}

export interface GroupFlips {
  groupId: string;
  entries: FlipEntry[];
  flipped: number;
  total: number;
}

const mean = (xs: number[]): number | null =>
  xs.length === 0 ? null : Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100;

function scoreOfRoots(roots: RippleCard[]): Score | null {
  const p = roots.map((r) => r.plausibility).filter((x): x is number => typeof x === "number");
  const i = roots.map((r) => r.impact).filter((x): x is number => typeof x === "number");
  if (p.length === 0 && i.length === 0) return null;
  return { plausibility: mean(p), impact: mean(i) };
}

// Per pooled item, the plausibility and impact behind it. Items with nothing behind them are
// ABSENT from the map rather than present with nulls, so a caller counting `size` counts
// what it can actually position.
export function scoresForItems(args: {
  source: PoolSource;
  week2Cards: RippleCard[];
  week3Cards: RippleCard[];
  itemIds: string[];
}): Map<string, Score> {
  const { source, week2Cards, week3Cards, itemIds } = args;
  const out = new Map<string, Score>();
  if (week2Cards.length === 0) return out;

  const lineage = lineageByCardId(week2Cards);
  const week2ById = new Map(week2Cards.map((c) => [c.id, c]));
  const rootOf = (week2CardId: string): RippleCard | null => {
    const rootId = lineage[week2CardId]?.keyChangeId;
    return rootId ? (week2ById.get(rootId) ?? null) : null;
  };

  if (source === "implications") {
    // The item IS a Session 2 card, so one hop to its key change.
    for (const id of itemIds) {
      const score = scoreOfRoots([rootOf(id)].filter((r): r is RippleCard => r !== null));
      if (score) out.set(id, score);
    }
    return out;
  }

  // A Session 3 item inherits from its theme: the theme's implications were seeded from
  // Session 2, and each carries the id of what it was copied from.
  const board = indexSynthesisBoard(week3Cards);
  const week3ById = new Map(week3Cards.map((c) => [c.id, c]));

  const themeScores = new Map<string, Score | null>();
  for (const theme of board.themes) {
    const roots = (board.clusters.get(theme.id) ?? [])
      .map((c) => (c.sourceCardId ? rootOf(c.sourceCardId) : null))
      .filter((r): r is RippleCard => r !== null);
    // Distinct roots: a theme holding four implications from one key change should weigh
    // that key change once, not four times.
    const distinct = [...new Map(roots.map((r) => [r.id, r])).values()];
    themeScores.set(theme.id, scoreOfRoots(distinct));
  }

  for (const id of itemIds) {
    const card = week3ById.get(id);
    if (!card?.parentId) continue; // a board-level hope or fear hangs under no theme
    const score = themeScores.get(card.parentId) ?? null;
    if (score) out.set(id, score);
  }
  return out;
}

// One weight per clustered theme, in the themes' own order.
export function weightsForThemes(
  themes: CohortTheme[],
  scoresByItemId: Map<string, Score>
): ThemeWeight[] {
  return themes.map((t) => {
    const got = t.memberIds.map((id) => scoresByItemId.get(id)).filter((s): s is Score => Boolean(s));
    return {
      plausibility: mean(got.map((s) => s.plausibility).filter((x): x is number => x !== null)),
      impact: mean(got.map((s) => s.impact).filter((x): x is number => x !== null)),
      n: got.length,
      missing: t.memberIds.length - got.length,
    };
  });
}

// Every fear on one group's Session 3 board, with whatever was flipped from it.
//
// A fear left standing is kept, and is arguably the more interesting half: it is where a
// room looked at something and could not find the other side of it.
export function flipsForBoard(week3Cards: RippleCard[], groupId: string): GroupFlips {
  const board = indexSynthesisBoard(week3Cards);

  // Both placements -- on the board (step 3) and on a theme (older boards) -- deduped by
  // id, since a card can be reached by either walk.
  const fears = new Map<string, RippleCard>();
  for (const e of boardChainCards(board)) {
    if (e.card.cardKind === "fear" && e.card.text.trim()) fears.set(e.card.id, e.card);
  }
  for (const theme of board.themes) {
    for (const e of flattenChainCards(board, theme.id)) {
      if (e.card.cardKind === "fear" && e.card.text.trim()) fears.set(e.card.id, e.card);
    }
  }

  const entries: FlipEntry[] = [...fears.values()].map((fear) => {
    const hopes = (board.chains.get(fear.id) ?? [])
      .filter((c) => c.cardKind === "hope" && c.text.trim())
      .map((c) => ({ id: c.id, text: c.text }));
    return { fearId: fear.id, fearText: fear.text, hopes, flipped: hopes.length > 0 };
  });

  return {
    groupId,
    entries,
    flipped: entries.filter((e) => e.flipped).length,
    total: entries.length,
  };
}
