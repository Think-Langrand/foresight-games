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
  if (ex.sessionCode && (render === "worksheet" || render === "implications")) {
    const session = await getSessionByCode(ex.sessionCode);
    if (session) view = await getRipplesView(session);
  }
  return shapeFromView(ex, view, opts);
}
