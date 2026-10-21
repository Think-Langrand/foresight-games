// WHICH material a cohort run pools. Client-safe and pure, so the source list can be
// rendered in a picker and every source's extraction can be tested without a database.
//
// The cohort clustering in this directory was built for one source: every group's Session 2
// implications. Its whole value, though, is in what cohort-cluster-shape.ts says about
// groupCount -- "1 means an outlier; all of them means convergence" -- and that reading is
// not specific to implications. The groups each worked a DIFFERENT scenario, so a risk
// raised in all four is robust to which future arrives and one raised in a single group is
// contingent on that group's scenario. Answering that for risks, opportunities, hopes and
// fears needs nothing from the clustering but a different pool, because everything
// downstream of the pool consumes only CohortItem.
//
// So this file is the seam: one function per source, returning the same shape.

import {
  boardChainCards,
  flattenChainCards,
  indexSynthesisBoard,
  implicationSeedCandidates,
  themeLabel,
} from "@/lib/synthesis-shape";
import { IMPLICATION_MATERIAL, type PoolMaterial } from "./theme-guidance";
import type { RippleCard } from "@/lib/ripples-types";
import type { CohortItem } from "./cohort-cluster-shape";

export const POOL_SOURCES = [
  "implications",
  "risks",
  "opportunities",
  "stakes",
  "hopes",
  "fears",
] as const;
export type PoolSource = (typeof POOL_SOURCES)[number];

export function isPoolSource(v: unknown): v is PoolSource {
  return typeof v === "string" && (POOL_SOURCES as readonly string[]).includes(v);
}

const LABELS: Record<PoolSource, string> = {
  implications: "Implications (Session 2)",
  risks: "Risks (Session 3)",
  opportunities: "Opportunities (Session 3)",
  stakes: "Risks & opportunities together",
  hopes: "Hopes (Session 3)",
  fears: "Fears (Session 3)",
};

export function poolSourceLabel(source: PoolSource): string {
  return LABELS[source];
}

// How each source is described TO THE MODEL. The clustering prompts were written for
// implications and name them twice, so pooling risks through the same call would hand the
// model a list of risks under a sentence calling them implications. `implications` reuses
// IMPLICATION_MATERIAL by reference, which is how composeClusterPrompt recognizes the
// default and returns the original prompt unchanged.
export const POOL_MATERIAL: Record<PoolSource, PoolMaterial> = {
  implications: IMPLICATION_MATERIAL,
  risks: {
    plural: "risks",
    singular: "risk",
    produced: "named the risks they saw in the themes they had built",
    context: "theme",
  },
  opportunities: {
    plural: "opportunities",
    singular: "opportunity",
    produced: "named the opportunities they saw in the themes they had built",
    context: "theme",
  },
  stakes: {
    plural: "risks and opportunities",
    singular: "item",
    produced: "named the risks and opportunities they saw in the themes they had built",
    context: "theme",
  },
  hopes: {
    plural: "hopes",
    singular: "hope",
    produced: "wrote what they hoped for in a future scenario",
    context: "fear it answers",
  },
  fears: {
    plural: "fears",
    singular: "fear",
    produced: "wrote what they feared in a future scenario",
    context: "theme",
  },
};

// Which week a source lives on. Implications are Session 2's tree; everything else is
// written in Session 3, so the week selector has to follow the source rather than always
// looking for an implications week.
export function poolSourceRender(source: PoolSource): "implications" | "synthesis" {
  return source === "implications" ? "implications" : "synthesis";
}

const ok = (c: RippleCard) => c.text.trim().length > 0;

// Stable across calls: by creation time, then id. The model sees the pool in this order and
// an unstable order would make two runs over identical material differ for no reason.
const byAge = (a: RippleCard, b: RippleCard) =>
  a.createdTime.localeCompare(b.createdTime) || a.id.localeCompare(b.id);

export function itemsFromBoard(
  cards: RippleCard[],
  source: PoolSource,
  groupId: string
): CohortItem[] {
  if (source === "implications") {
    // Unchanged from what the existing cohort run pools, deliberately: an implications run
    // must return exactly what it returned before this seam existed.
    return implicationSeedCandidates(cards).map((c) => ({
      id: c.id,
      text: c.text,
      keyChange: c.keyChange,
      groupId,
    }));
  }

  const board = indexSynthesisBoard(cards);

  if (source === "hopes" || source === "fears") {
    const want = source === "hopes" ? "hope" : "fear";

    // Two walks, because a hope or fear can sit in two places.
    //
    // boardChainCards covers step 3's two walls and step 4's flips. The flips matter: a
    // flipped hope is a child of the fear it answers, not a root, so reading
    // board.hopesFears alone would omit every hope the rooms worked to turn a fear into --
    // the most interesting hopes on the board.
    //
    // flattenChainCards covers the LEGACY placement, where an older board wrote its hopes
    // and fears UNDER A THEME. lib/synthesis-shape.ts keeps that placement working rather
    // than migrating it, so real boards have both. Group 1 on the dev database is one of
    // them, and with only the first walk it pooled as having zero hopes while its fears
    // pooled normally -- which reads as "Group 1 never hoped for anything". That is a
    // finding, and it would have been a false one.
    //
    // `flippedFrom` is the fear a hope answers and is the right context to cluster it
    // with; a theme-attached hope that answers nothing gets the theme instead. Deduped by
    // id, since the two walks can reach the same card.
    const entries: { id: string; text: string; kind: string; context: string }[] = [];
    for (const e of boardChainCards(board)) {
      entries.push({
        id: e.card.id,
        text: e.card.text,
        kind: e.card.cardKind ?? "",
        context: e.flippedFrom?.text ?? "",
      });
    }
    for (const theme of board.themes) {
      const label = themeLabel(board, theme);
      for (const e of flattenChainCards(board, theme.id)) {
        entries.push({
          id: e.card.id,
          text: e.card.text,
          kind: e.card.cardKind ?? "",
          context: e.flippedFrom?.text ?? label,
        });
      }
    }

    const seen = new Set<string>();
    const out: CohortItem[] = [];
    for (const e of entries) {
      if (e.kind !== want || !e.text.trim() || seen.has(e.id)) continue;
      seen.add(e.id);
      out.push({ id: e.id, text: e.text, keyChange: e.context, groupId, polarity: want });
    }
    return out;
  }

  // Risks and opportunities hang off a THEME, so the theme is their context. An unnamed
  // theme gets "Theme N" from themeLabel rather than an empty string, since a blank context
  // tells the model nothing and real boards leave themes unnamed.
  const want: ("risk" | "opportunity")[] =
    source === "stakes" ? ["risk", "opportunity"] : [source === "risks" ? "risk" : "opportunity"];

  const out: CohortItem[] = [];
  for (const theme of board.themes) {
    const label = themeLabel(board, theme);
    for (const kind of want) {
      const bucket = kind === "risk" ? board.risks : board.opportunities;
      for (const c of [...(bucket.get(theme.id) ?? [])].sort(byAge)) {
        if (!ok(c)) continue;
        out.push({ id: c.id, text: c.text, keyChange: label, groupId, polarity: kind });
      }
    }
  }
  return out;
}
