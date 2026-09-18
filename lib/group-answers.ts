import "server-only";

import { getSessionByCode } from "@/lib/workshop";
import { getRipplesView } from "@/lib/ripples";
import { getExerciseType, type WorksheetSection } from "@/lib/exercise-types";
import type { DesignGroupExercise } from "@/lib/design-group-exercises";
import type { RippleCard, RipplesView } from "@/lib/ripples-types";
import type { AnswerRow, ExerciseAnswers, QuestionBlock } from "@/components/design-groups/AnswerPanels";

// Shape one design-group week's board into its read-only answers — worksheet Q&A, an
// implications map (+ brainstorm / question blocks), or a placeholder. Used by the admin
// answers viewer and by the member session page's earlier-week tabs.
//   includeRemoved — also surface answers whose question was deleted from the spec
//                    (admin-only; members just don't see them).
export async function shapeExerciseAnswers(
  ex: DesignGroupExercise,
  opts: { scenarioTitle?: string | null; includeRemoved?: boolean } = {}
): Promise<ExerciseAnswers> {
  const render = getExerciseType(ex.type)?.render;

  // Load the board once — both worksheet and implications read from it.
  let view: RipplesView | null = null;
  if (ex.sessionCode && (render === "worksheet" || render === "implications")) {
    const session = await getSessionByCode(ex.sessionCode);
    if (session) view = await getRipplesView(session);
  }
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
    const spec: WorksheetSection[] =
      ex.sections.length > 0 ? ex.sections : getExerciseType(ex.type)?.sections ?? [];
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
      questions: buildQuestions(ex.sections),
    };
  }

  return { kind: "placeholder", exerciseId: ex.id, title: ex.title };
}
