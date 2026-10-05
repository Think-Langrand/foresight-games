import { getExerciseType, resolveEffectiveSections, type WorksheetSection } from "@/lib/exercise-types";
import type { RippleCard, RipplesView } from "@/lib/ripples-types";
import type {
  AnswerRow,
  ChainRow,
  ExerciseAnswers,
  StakeRow,
  QuestionBlock,
  SynthesisTheme,
  ThemeAnswerRow,
} from "@/components/design-groups/AnswerPanels";
import {
  ANSWER_LABELS,
  answerOf,
  answersOf,
  boardAnswersOf,
  indexSynthesisBoard,
  isHopeFear,
  themeAnswers,
  READING_FIELDS,
  ROLE_FIELDS,
  VALUES_FIELDS,
  type ThemeAnswerKind,
} from "@/lib/synthesis-shape";

// Pure shaping of one design-group week's board into its read-only answers — worksheet
// Q&A, an implications map (+ brainstorm / question blocks), or a placeholder. No I/O:
// lib/group-answers.ts loads the board and calls this (split out so it can be unit-tested).
//   includeRemoved — also surface answers whose question was deleted from the spec
//                    (admin-only; members just don't see them).

export interface ShapeableExercise {
  id: string;
  title: string;
  type: string;
  sections: WorksheetSection[];
}

export function shapeFromView(
  ex: ShapeableExercise,
  view: RipplesView | null,
  opts: { scenarioTitle?: string | null; includeRemoved?: boolean } = {}
): ExerciseAnswers {
  const render = getExerciseType(ex.type)?.render;
  const names = new Map((view?.players ?? []).map((p) => [p.id, p.displayName]));
  const toRow = (c: RippleCard): AnswerRow => ({
    id: c.id,
    text: c.text,
    author: names.get(c.authorPlayerId ?? "") ?? "",
    createdAt: c.createdTime,
  });

  // Section-tagged Q&A blocks — worksheet weeks, and implications weeks that carry blocks.
  const buildQuestions = (spec: WorksheetSection[]): QuestionBlock[] => {
    const bySection = new Map<string, RippleCard[]>();
    for (const c of view?.cards ?? []) {
      if (c.order !== "STICKY" || !c.section) continue;
      const arr = bySection.get(c.section);
      if (arr) arr.push(c);
      else bySection.set(c.section, [c]);
    }
    const toAnswers = (cards: RippleCard[]) =>
      [...cards].sort((a, b) => a.createdTime.localeCompare(b.createdTime)).map(toRow);
    const questions: QuestionBlock[] = spec.map((s) => ({
      key: s.key,
      label: s.label,
      kind: s.kind,
      answers: toAnswers(bySection.get(s.key) ?? []),
    }));
    if (opts.includeRemoved) {
      // Surface answers whose section key is no longer in the spec (deleted question).
      const known = new Set(spec.map((s) => s.key));
      for (const [key, cards] of bySection) {
        if (known.has(key)) continue;
        questions.push({ key, label: key, kind: "question", removed: true, answers: toAnswers(cards) });
      }
    }
    return questions;
  };

  if (render === "worksheet") {
    const spec: WorksheetSection[] = resolveEffectiveSections(ex.type, ex.sections);
    return { kind: "worksheet", exerciseId: ex.id, title: ex.title, questions: buildQuestions(spec) };
  }

  if (render === "implications" && view) {
    const cards = view.cards; // one shared team → all cards drive the wheel/tree/list
    const brainstorm = cards
      .filter((c) => c.order === "STICKY" && !c.section) // the freeform brainstorm pad
      .sort((a, b) => a.sort - b.sort)
      .map(toRow);
    return {
      kind: "implications",
      exerciseId: ex.id,
      title: ex.title,
      scenarioTitle: view.config.scenarioTitle || opts.scenarioTitle || "",
      cards,
      brainstorm,
      // resolveEffectiveSections, not the raw column: an implications week that was never
      // customized stores [] and must fall back to the type's template, or its risks /
      // opportunities blocks are invisible here.
      questions: buildQuestions(resolveEffectiveSections(ex.type, ex.sections)),
    };
  }

  if (render === "synthesis" && view) {
    const board = indexSynthesisBoard(view.cards);

    const toStake = (c: RippleCard): StakeRow => ({
      ...toRow(c),
      mechanism: c.description,
      shortlisted: c.shortlisted,
    });

    // A hope or fear as a row. Who it concerns and the older boards' assumptions ride ON
    // the row rather than becoming rows of their own.
    const toChainRow = (c: RippleCard, depth: number, kind: "hope" | "fear"): ChainRow => ({
      ...toRow(c),
      cardKind: kind,
      depth,
      concerns: answerOf(board, c.id, "concerns")?.text ?? null,
      value: c.description,
      assumptions: (board.assumptions.get(c.id) ?? []).map(toRow),
    });

    // Everything chained under `parentId`, flattened depth-first so the panel's
    // indentation reads as the chain itself.
    const flattenChain = (parentId: string, out: ChainRow[] = []): ChainRow[] => {
      for (const c of board.chains.get(parentId) ?? []) {
        const depth = board.chainDepth.get(c.id);
        // Absent from chainDepth = unreachable from any root, so drawn by no view.
        // Skipped here too, so the answer sheet matches what the group actually sees.
        if (depth === undefined || !isHopeFear(c.cardKind)) continue;
        out.push(toChainRow(c, depth, c.cardKind));
        flattenChain(c.id, out);
      }
      return out;
    };

    // The board's own hopes and fears (step 3), each followed by what was flipped from it.
    const hopesFears: ChainRow[] = [];
    for (const root of board.hopesFears) {
      const depth = board.chainDepth.get(root.id);
      if (depth === undefined || !isHopeFear(root.cardKind)) continue;
      hopesFears.push(toChainRow(root, depth, root.cardKind));
      flattenChain(root.id, hopesFears);
    }

    // Every answered question on a theme, in the order the week asks them: the Themes
    // step's four (with an old reading's answers standing in — themeAnswers), then part B,
    // then the role, then the two retired questions older boards may still carry. One
    // list, so the viewer and the CSV can never disagree about what was answered.
    const answersFor = (themeId: string): ThemeAnswerRow[] => {
      const found: Partial<Record<ThemeAnswerKind, RippleCard>> = {
        ...themeAnswers(board, themeId),
        ...answersOf(board, themeId, VALUES_FIELDS),
        ...answersOf(board, themeId, ROLE_FIELDS),
        ...answersOf(board, themeId, ["assumed_role", "question"] as const),
      };
      const order: readonly ThemeAnswerKind[] = [
        ...READING_FIELDS,
        ...VALUES_FIELDS,
        ...ROLE_FIELDS,
        "assumed_role",
        "question",
      ];
      const out: ThemeAnswerRow[] = [];
      for (const kind of order) {
        const c = found[kind];
        if (!c || !c.text.trim()) continue;
        out.push({ ...toRow(c), kind, label: ANSWER_LABELS[kind] });
      }
      return out;
    };

    const themes: SynthesisTheme[] = board.themes.map((t) => ({
      id: t.id,
      text: t.text,
      description: t.description,
      implications: (board.clusters.get(t.id) ?? []).map(toRow),
      answers: answersFor(t.id),
      risks: (board.risks.get(t.id) ?? []).map(toStake),
      opportunities: (board.opportunities.get(t.id) ?? []).map(toStake),
      chain: flattenChain(t.id),
      tensions: (board.tensions.get(t.id) ?? []).map(toStake),
    }));

    // LEGACY — the retired role step's answers: one set for the board, in question order.
    const boardRole = boardAnswersOf(board);
    const role: ThemeAnswerRow[] = ROLE_FIELDS.flatMap((kind) => {
      const c = boardRole[kind];
      return c && c.text.trim() ? [{ ...toRow(c), kind, label: ANSWER_LABELS[kind] }] : [];
    });

    return {
      kind: "synthesis",
      exerciseId: ex.id,
      title: ex.title,
      cards: view.cards,
      themes,
      hopesFears,
      role,
      unclustered: board.unclustered.map(toRow),
      parked: board.parked.map(toRow),
      orphans: board.orphans.map(toRow),
      // resolveEffectiveSections, not the raw column: a synthesis week that was never
      // customized stores [] and must fall back to the type's template, or its Sandbox
      // notes are invisible here.
      questions: buildQuestions(resolveEffectiveSections(ex.type, ex.sections)),
    };
  }

  return { kind: "placeholder", exerciseId: ex.id, title: ex.title };
}
