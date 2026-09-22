import { getExerciseType, resolveEffectiveSections, type WorksheetSection } from "@/lib/exercise-types";
import type { RippleCard, RipplesView } from "@/lib/ripples-types";
import type { AnswerRow, ExerciseAnswers, QuestionBlock } from "@/components/design-groups/AnswerPanels";

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

  return { kind: "placeholder", exerciseId: ex.id, title: ex.title };
}
