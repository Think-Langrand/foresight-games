import { notFound } from "next/navigation";
import { supabaseConfigured, getSessionByCode } from "@/lib/workshop";
import { getProjectBySlugAny } from "@/lib/projects";
import { getDesignGroup } from "@/lib/design-groups";
import { listExercises } from "@/lib/design-group-exercises";
import { getRipplesView } from "@/lib/ripples";
import { getExerciseType, type WorksheetSection } from "@/lib/exercise-types";
import type { RippleCard } from "@/lib/ripples-types";
import {
  AdminGroupAnswers,
  type ExerciseAnswers,
  type QuestionBlock,
} from "@/components/admin/AdminGroupAnswers";

export const dynamic = "force-dynamic";

// Admin: every question & answer across a design group's worksheet weeks, with export.
// Worksheet answers are STICKY ripple_cards tagged by section key; questions come from the
// exercise's own sections snapshot (or the code template when it was never customized).
export default async function GroupAnswersPage({
  params,
}: {
  params: Promise<{ slug: string; groupId: string }>;
}) {
  const { slug, groupId } = await params;
  if (!supabaseConfigured()) notFound();

  const project = await getProjectBySlugAny(slug);
  if (!project) notFound();
  const group = await getDesignGroup(groupId);
  if (!group || group.projectId !== project.id) notFound();

  const exercises = (await listExercises(groupId)).filter(
    (ex) => getExerciseType(ex.type)?.render === "worksheet"
  );

  const shaped: ExerciseAnswers[] = await Promise.all(
    exercises.map(async (ex): Promise<ExerciseAnswers> => {
      const spec: WorksheetSection[] =
        ex.sections.length > 0 ? ex.sections : getExerciseType(ex.type)?.sections ?? [];

      // Load the board's answer cards (STICKY) grouped by section key, with author names.
      const bySection = new Map<string, RippleCard[]>();
      let names = new Map<string, string>();
      if (ex.sessionCode) {
        const session = await getSessionByCode(ex.sessionCode);
        if (session) {
          const view = await getRipplesView(session);
          names = new Map(view.players.map((p) => [p.id, p.displayName]));
          for (const c of view.cards) {
            if (c.order !== "STICKY" || !c.section) continue;
            const arr = bySection.get(c.section);
            if (arr) arr.push(c);
            else bySection.set(c.section, [c]);
          }
        }
      }

      const toAnswers = (cards: RippleCard[]) =>
        [...cards]
          .sort((a, b) => a.createdTime.localeCompare(b.createdTime))
          .map((c) => ({
            text: c.text,
            author: names.get(c.authorPlayerId ?? "") ?? "",
            createdAt: c.createdTime,
          }));

      const questions: QuestionBlock[] = spec.map((s) => ({
        key: s.key,
        label: s.label,
        kind: s.kind,
        answers: toAnswers(bySection.get(s.key) ?? []),
      }));

      // Surface answers whose section key is no longer in the spec (a deleted question) so
      // the data is never silently lost.
      const known = new Set(spec.map((s) => s.key));
      for (const [key, cards] of bySection) {
        if (known.has(key)) continue;
        questions.push({ key, label: key, kind: "question", removed: true, answers: toAnswers(cards) });
      }

      return { exerciseId: ex.id, title: ex.title, questions };
    })
  );

  return (
    <AdminGroupAnswers
      data={{ groupName: group.name, scenarioTitle: group.scenarioTitle, exercises: shaped }}
      backHref={`/admin/projects/${slug}`}
    />
  );
}
