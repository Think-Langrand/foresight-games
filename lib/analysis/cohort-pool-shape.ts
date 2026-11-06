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
import {
  indexCommitmentsBoard,
  outcomesFor,
  priorities,
  sharpenFor,
  type DirectionFieldKey,
} from "@/lib/commitments-shape";
import { COMMITMENTS_KEY_VISION } from "@/lib/exercise-types";
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
  // Session 4. The groups each worked a DIFFERENT scenario, so the convergence reading is
  // at its strongest here: a bold move three rooms arrived at independently is robust to
  // which future turns up, and one room's alone is contingent on that room's scenario.
  "priorities",
  "outcomes",
  "responses",
  "moves",
  "aspirations",
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
  priorities: "Priorities (Session 4)",
  outcomes: "Desired outcomes (Session 4)",
  responses: "Strategic responses (Session 4)",
  moves: "Bold moves (Session 4)",
  aspirations: "Vision statements (Session 4)",
};

export function poolSourceLabel(source: PoolSource): string {
  return LABELS[source];
}

/** Which session a source comes from, for grouping the picker. */
export function poolSourceSession(source: PoolSource): string {
  if (source === "implications") return "Session 2";
  return poolSourceRender(source) === "commitments" ? "Session 4" : "Session 3";
}

// WHAT THE WEIGHT VIEW IS PLOTTING, which is not the same sentence for every source.
//
// Weeks 2 and 3 inherit Session 2's numbers through a lineage, and Session 2 calls the
// first axis PLAUSIBILITY. Session 4 scores its own priorities and asks the same two
// questions in different words — "likelihood" reads better for a risk — so the same stored
// column is labelled differently (PRIORITY_AXIS_LABELS in lib/commitments-shape). The view
// has to follow the source or it will label a Week 4 run with Week 2's word.
export function poolSourceScoreAxis(source: PoolSource): { x: string; basis: string } {
  return poolSourceRender(source) === "commitments"
    ? { x: "Likelihood", basis: "the priorities behind it" }
    : { x: "Plausibility", basis: "the key changes behind it" };
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
  priorities: {
    plural: "priorities",
    singular: "priority",
    produced:
      "chose the three risks and opportunities from their scenario that most need attention",
    context: "note on why it needs attention",
  },
  outcomes: {
    plural: "desired outcomes",
    singular: "desired outcome",
    produced: "wrote the outcomes they want to see for each of their priorities",
    context: "priority it was written for",
  },
  responses: {
    plural: "strategic responses",
    singular: "strategic response",
    produced: "wrote the responses that would advance each desired outcome",
    context: "desired outcome it advances",
  },
  moves: {
    plural: "bold moves",
    singular: "bold move",
    produced:
      "recommended three bold moves \u2014 strategic directions, initiatives or actions \u2014 built from their vision",
    context: "part of the vision it advances",
  },
  aspirations: {
    plural: "vision statements",
    singular: "vision statement",
    produced:
      "wrote one statement the whole group agreed on, describing what public health becomes in their scenario and what that makes possible for communities",
    context: "scenario",
  },
};

// Which week a source lives on. Implications are Session 2's tree, risks through fears are
// written in Session 3, and the five Session 4 sources are on the commitments board, so the
// week selector has to follow the source rather than always looking for one render.
const COMMITMENTS_SOURCES = new Set<PoolSource>([
  "priorities",
  "outcomes",
  "responses",
  "moves",
  "aspirations",
]);

export function poolSourceRender(
  source: PoolSource
): "implications" | "synthesis" | "commitments" {
  if (source === "implications") return "implications";
  return COMMITMENTS_SOURCES.has(source) ? "commitments" : "synthesis";
}

const ok = (c: RippleCard) => c.text.trim().length > 0;
const ok2 = (t: string) => t.trim().length > 0;

// Which of a bold move's three fields becomes its context. By KEY, not by position, so
// reordering DIRECTION_FIELDS cannot silently change what the model is grouping against.
// A test asserts the key is still one of the three.
export const PURPOSE_FIELD: DirectionFieldKey = "w4-dir-purpose";

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

  // --- Session 4 ------------------------------------------------------------------------
  // The commitments board, whose material is shaped differently from Session 3's: most of
  // it is cards of a kind in a two-level tree (priority \u2192 outcome \u2192 response), and the
  // vision is not a card of a kind at all.
  if (source === "aspirations") {
    // THE ONE SOURCE THAT IS NOT A CARD KIND. The vision is an authored worksheet section,
    // so its answers are STICKY cards carrying the section key \u2014 which is also why
    // indexCommitmentsBoard cannot find them: it skips STICKY on its first line. Read from
    // the raw cards instead.
    //
    // `w4-role` though the activity is called "Set the vision": the key is the permanent id
    // every answer ever written under it carries. See COMMITMENTS_KEY_VISION.
    //
    // ONE ITEM PER GROUP, normally. That is a different shape from every other source and
    // the grid reads accordingly: a theme spanning all four is not "four rooms raised this"
    // but "all four rooms want the same thing", which is the stronger claim.
    return cards
      .filter(
        (c) =>
          c.order === "STICKY" &&
          c.section === COMMITMENTS_KEY_VISION &&
          !c.parked &&
          ok(c)
      )
      .sort(byAge)
      .map((c) => ({ id: c.id, text: c.text, keyChange: "", groupId }));
  }

  const commitments = indexCommitmentsBoard(cards);

  if (source === "priorities") {
    // THE THREE, via prioritySlots \u2014 the single place that decides which three a board
    // resolves to (confirmed picks first, then the highest-scoring suggestions fill the
    // rest). Reading board.picks directly would pool every issue the group scored, which is
    // a different and much weaker claim than "this is what the room chose".
    return priorities(commitments)
      .filter(ok)
      .map((p) => ({
        id: p.id,
        text: p.text,
        // The group's own note on why it needs attention.
        //
        // NOT the Session 3 theme, which would be the better context and is NOT REACHABLE
        // HERE: a pick cannot say whether its source was a risk or an opportunity, nor
        // which theme it sat under \u2014 the live board builds a whole Session 3 index for
        // exactly those three things. Pooling reads one week, so it uses what is on it.
        // For the same reason these items carry no `polarity`: guessing it would be wrong
        // half the time and the views colour by it.
        keyChange: p.description?.trim() ?? "",
        groupId,
      }));
  }

  if (source === "outcomes") {
    // Under the three priorities first, then under any other pick that still carries
    // outcomes. That second pass is not tidiness: an outcome written for an issue the group
    // later replaced is intact and comes back if that issue is promoted again
    // (`strayOutcomes`), so dropping it would silently lose the room's writing \u2014 and a
    // group whose priorities all moved would pool as having written nothing.
    const out: CohortItem[] = [];
    const seen = new Set<string>();
    for (const pick of [...priorities(commitments), ...commitments.picks.values()]) {
      if (seen.has(pick.id)) continue;
      seen.add(pick.id);
      for (const o of outcomesFor(commitments, pick.id)) {
        if (!ok(o)) continue;
        out.push({ id: o.id, text: o.text, keyChange: pick.text, groupId });
      }
    }
    return out;
  }

  if (source === "responses") {
    // EVERY outcome's text, not just the live priorities', so a response under a demoted
    // priority still names what it was advancing.
    const outcomeText = new Map<string, string>();
    for (const list of commitments.outcomes.values()) {
      for (const o of list) outcomeText.set(o.id, o.text);
    }
    // `board.responses` is already in board order, legacy roots first. A ROOT response came
    // from the untagged wall this week used to have and sits under no outcome, so it pools
    // with no context rather than being dropped.
    return commitments.responses.filter(ok).map((r) => ({
      id: r.id,
      text: r.text,
      keyChange: (r.parentId && outcomeText.get(r.parentId)) || "",
      groupId,
    }));
  }

  if (source === "moves") {
    return commitments.directions.filter(ok).map((d) => ({
      id: d.id,
      text: d.text,
      // The PURPOSE answer. Of the three fields that explain a move, this is the one that
      // says what it is FOR; the other two say how it would work and what it would need,
      // which is not what a move should be grouped by.
      keyChange: sharpenFor(commitments, d.id, PURPOSE_FIELD).map((c) => c.text).find(ok2) ?? "",
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
