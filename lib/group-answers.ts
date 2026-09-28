import "server-only";

import { getSessionByCode } from "@/lib/workshop";
import { getRipplesView } from "@/lib/ripples";
import { getExerciseType } from "@/lib/exercise-types";
import { shapeFromView } from "@/lib/group-answers-shape";
import type { DesignGroupExercise } from "@/lib/design-group-exercises";
import type { RipplesView } from "@/lib/ripples-types";
import type { ExerciseAnswers } from "@/components/design-groups/AnswerPanels";

// Load one design-group week's board and shape it into read-only answers (see
// lib/group-answers-shape.ts). Used by the admin answers viewer and by the member session
// page's earlier-week tabs.
export async function shapeExerciseAnswers(
  ex: DesignGroupExercise,
  opts: { scenarioTitle?: string | null; includeRemoved?: boolean } = {}
): Promise<ExerciseAnswers> {
  const render = getExerciseType(ex.type)?.render;
  let view: RipplesView | null = null;
  // Every board-backed render must be listed here. A missing one leaves `view` null, so
  // shapeFromView falls through to "placeholder" and the admin viewer reports an empty week
  // over a board full of work — with no error anywhere.
  if (
    ex.sessionCode &&
    (render === "worksheet" || render === "implications" || render === "synthesis")
  ) {
    const session = await getSessionByCode(ex.sessionCode);
    if (session) view = await getRipplesView(session);
  }
  return shapeFromView(ex, view, opts);
}
