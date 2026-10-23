import "server-only";

import { getSessionByCode } from "@/lib/workshop";
import { getDesignGroup } from "@/lib/design-groups";
import { listExercises } from "@/lib/design-group-exercises";
import { getExerciseType } from "@/lib/exercise-types";
import { shapeExerciseAnswers } from "@/lib/group-answers";
import { buildGroupSummary, type GroupSummary } from "@/lib/group-summary";
import { coerceExecSummary, type ExecSummaryOverride } from "@/lib/exec-summary-shape";
import type { ImplicationsExercise } from "@/components/design-groups/AnswerPanels";

// Everything the handoff deck needs, loaded once.
//
// TWO PAGES RENDER THIS DECK and they must not drift: the group's own copy under
// /project/<slug>/design-groups/<id>/summary, which can be edited, and the public reader at
// /h/<slug>/<id>, which cannot. A shared loader is what keeps "what the committee sees" and
// "what the group edits" the same document. The pages differ only in who may write and in
// which switch gates them.
export interface HandoffData {
  summary: GroupSummary;
  // Handed through unshaped: the map slide mounts the real Session 2 panel, which builds
  // the tree and its filters from these cards rather than from the projection.
  implications: ImplicationsExercise | null;
  // The Week 4 board, which is where an edit of the lead is stored and authenticated.
  // Null when the group has no Session 4 yet — then there is nothing to edit.
  week4Code: string | null;
  execOverride: ExecSummaryOverride | null;
}

export async function loadHandoff(
  projectId: string,
  groupId: string
): Promise<HandoffData | null> {
  const group = await getDesignGroup(groupId);
  if (!group || group.projectId !== projectId) return null;

  const exercises = await listExercises(groupId);
  const weeks = await Promise.all(
    exercises.map((ex) => shapeExerciseAnswers(ex, { scenarioTitle: group.scenarioTitle }))
  );

  const week4 = exercises.find((ex) => getExerciseType(ex.type)?.render === "commitments");
  const week4Code = week4?.sessionCode ?? null;

  // One extra session read on an already force-dynamic page. shapeExerciseAnswers reads the
  // same row, but returns only the shaped projection — threading raw config out of a shared
  // projection to serve one slide is the worse trade.
  //
  // The RAW config, not resolveConfig(): execSummary is deliberately outside that whitelist
  // so it never ships in the /ripples payload every member's board fetches.
  let execOverride: ExecSummaryOverride | null = null;
  if (week4Code) {
    const session = await getSessionByCode(week4Code);
    const raw = (session?.config ?? {}) as Record<string, unknown>;
    execOverride = coerceExecSummary(raw.execSummary);
  }

  return {
    summary: buildGroupSummary(weeks, {
      name: group.name,
      scenarioTitle: group.scenarioTitle,
    }),
    implications:
      (weeks.find((w) => w.kind === "implications") as ImplicationsExercise | undefined) ?? null,
    week4Code,
    execOverride,
  };
}
