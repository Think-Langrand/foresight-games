import "server-only";

import { getSessionByCode } from "@/lib/workshop";
import { getRippleScenario } from "@/lib/ripples";
import type { ScenarioImage } from "@/lib/foresight/types";
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
  // The group's own note to the committee — the deck's closing slide — written on Session
  // 4's "Build handoff guide" step and stored on that board's session config. Null when
  // nobody has written one, and the slide is simply absent.
  execOverride: ExecSummaryOverride | null;
  // The scenario's own artwork, at most three, in `position` order.
  //
  // RESOLVED LIVE, NEVER SNAPSHOTTED. These URLs are signed with a short TTL (§7), so a
  // copy kept anywhere is a 403 waiting to happen. Both pages that render this deck are
  // force-dynamic, which is what makes asking on every request the right answer rather
  // than an expense.
  //
  // NON-FATAL. Foresight being down, a group with no scenario ref, or a scenario with no
  // art all end here as an empty list, and the slides simply render without pictures.
  images: ScenarioImage[];
  // The scenario itself, as the scenario overview slide needs it: its own title and the
  // `teaser` — which is the prose the house calls the Overview everywhere else it is read
  // (ScenarioReader's standfirst, the Session 4 rail's scenario context).
  //
  // THE TITLE IS A FALLBACK, not the preferred one. `summary.scenarioTitle` — the string
  // copied onto the design group at setup — is what the cover prints, and the two really do
  // diverge in live data, so the slide uses the group's copy first and reaches for this one
  // only when there is none. See the slide for why one name beats the better name.
  //
  // Null on the same three non-fatal conditions as `images`, and the slide is skipped.
  scenario: { title: string; overview: string } | null;
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

  // ANY of the group's boards will do: every week of a group runs against the same
  // scenario, so the first one with a code answers. Week 4 is tried first only because it
  // is the week most likely to exist by the time anyone reads a handoff.
  const artCode = week4Code ?? exercises.find((ex) => ex.sessionCode)?.sessionCode ?? null;
  let images: ScenarioImage[] = [];
  let scenarioOverview: HandoffData["scenario"] = null;
  if (artCode) {
    const session = await getSessionByCode(artCode);
    const scenario = session ? await getRippleScenario(session) : null;
    images = (scenario?.images ?? [])
      .filter((im) => im.url)
      // Real data numbers `position` from 2, so sort rather than trusting array order —
      // the same rule ScenarioReader and Week3Reference use to pick their hero.
      .sort((a, b) => a.position - b.position)
      .slice(0, 3);
    // One fetch, two uses: the artwork and the overview come off the same record, so the
    // scenario slide costs nothing beyond what the figures already paid for.
    if (scenario?.title) {
      scenarioOverview = { title: scenario.title, overview: scenario.teaser?.trim() ?? "" };
    }
  }

  return {
    summary: buildGroupSummary(weeks, {
      name: group.name,
      scenarioTitle: group.scenarioTitle,
    }),
    implications:
      (weeks.find((w) => w.kind === "implications") as ImplicationsExercise | undefined) ?? null,
    execOverride,
    images,
    scenario: scenarioOverview,
  };
}
