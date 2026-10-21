import "server-only";

import { getProgramActivity } from "@/lib/design-activity";
import { getExerciseType } from "@/lib/exercise-types";
import { shapeExerciseAnswers } from "@/lib/group-answers";
import { getCanvasLayout } from "@/lib/ripples";
import { getSessionByCode } from "@/lib/workshop";
import { coerceSummary } from "@/lib/synthesis-summary-shape";
import { coerceThemeIdeas } from "@/lib/theme-ideas-shape";
import { buildExportPayload, type BoardExtras, type ProjectExport } from "@/lib/cohort-export-shape";
import type { ExerciseAnswers } from "@/components/design-groups/AnswerPanels";

// Load a whole project for export: every design group, every week, shaped the same way the
// admin answers viewer shapes one week. The pure assembly is in lib/cohort-export-shape.ts.
//
// Built on getProgramActivity rather than re-walking groups and exercises, so the week
// alignment across groups -- the subtle part, since groups own their own exercise rows and
// a facilitator can rename one -- stays defined in exactly one place. It also already pages
// its reads past PostgREST's silent 1000-row cap, which a hand-rolled loop here would not.
//
// Cost: one board read per (group x board-backed week), plus one canvas read per synthesis
// board. For four groups over four weeks that is a dozen or so reads, which is why this is
// a button and not something a page does on every render.

export type { ProjectExport };

export async function buildProjectExport(project: {
  id: string;
  slug: string;
  name: string;
}): Promise<ProjectExport> {
  const { program, groups, exercisesByGroup, peopleByCode, rosterByCode } =
    await getProgramActivity(project.id);

  // Every exercise the program actually points at. Reading from the program's slots rather
  // than from exercisesByGroup directly means a stray row outside the canonical program is
  // not exported as if it were a week -- and a week with no row for a group is still a week.
  const slotted = program.weeks.flatMap((w) =>
    groups
      .map((g) => exercisesByGroup[g.id]?.find((e) => e.id === w.slots[g.id]))
      .filter((e): e is NonNullable<typeof e> => Boolean(e))
  );

  const scenarioByGroup = new Map(groups.map((g) => [g.id, g.scenarioTitle]));

  // includeRemoved: an answer under a retired question is still the group's work, and an
  // export is the one place it must not be dropped.
  const shaped = await Promise.all(
    slotted.map(async (ex) => ({
      id: ex.id,
      answers: await shapeExerciseAnswers(ex, {
        scenarioTitle: scenarioByGroup.get(ex.groupId) ?? null,
        includeRemoved: true,
      }),
    }))
  );
  const answersByExerciseId: Record<string, ExerciseAnswers> = {};
  for (const s of shaped) answersByExerciseId[s.id] = s.answers;

  // Per-board extras the shaped answers do not carry. The canvas is Session 3 only; the
  // summary and theme-name ideas live on the session config rather than on cards, so both
  // were invisible to every export before this one.
  const boards = slotted
    .filter((ex) => ex.sessionCode)
    .map((ex) => ({
      code: ex.sessionCode!.trim().toUpperCase(),
      synthesis: getExerciseType(ex.type)?.render === "synthesis",
    }));

  const extrasByCode: Record<string, BoardExtras> = {};
  await Promise.all(
    boards.map(async ({ code, synthesis }) => {
      // The canvas, the saved summary and the theme-name ideas are all Session 3 things, so
      // only a synthesis board is worth two extra reads. Every other board's extras come
      // from rows getProgramActivity already fetched.
      const [session, canvas] = synthesis
        ? await Promise.all([getSessionByCode(code), getCanvasLayout(code)])
        : [null, null];
      const config = (session?.config ?? {}) as Record<string, unknown>;
      extrasByCode[code] = {
        players: peopleByCode[code]?.players ?? 0,
        submitted: peopleByCode[code]?.submitted ?? 0,
        roster: rosterByCode[code] ?? [],
        canvas,
        themeIdeas: coerceThemeIdeas(config.themeIdeas),
        summary: coerceSummary(config.summary),
      };
    })
  );

  return buildExportPayload({
    project: { slug: project.slug, name: project.name },
    exportedAt: new Date().toISOString(),
    program,
    groups,
    exercisesByGroup,
    answersByExerciseId,
    extrasByCode,
  });
}
