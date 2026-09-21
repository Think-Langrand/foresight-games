import { notFound } from "next/navigation";
import { supabaseConfigured } from "@/lib/workshop";
import { getProjectBySlugAny } from "@/lib/projects";
import { getDesignGroup } from "@/lib/design-groups";
import { listExercises } from "@/lib/design-group-exercises";
import { shapeExerciseAnswers } from "@/lib/group-answers";
import { AdminGroupAnswers } from "@/components/admin/AdminGroupAnswers";

export const dynamic = "force-dynamic";

// Admin: a design group's answers, one tab per exercise (week), each rendered in its
// natural shape — worksheet Q&A, implication futures-wheel + brainstorm, or "not built
// yet". `?exercise=<id>` deep-links a specific week's tab.
export default async function GroupAnswersPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; groupId: string }>;
  searchParams: Promise<{ exercise?: string }>;
}) {
  const { slug, groupId } = await params;
  const { exercise: initialExerciseId } = await searchParams;
  if (!supabaseConfigured()) notFound();

  const project = await getProjectBySlugAny(slug);
  if (!project) notFound();
  const group = await getDesignGroup(groupId);
  if (!group || group.projectId !== project.id) notFound();

  const exercises = await listExercises(groupId); // all weeks, sort order
  const shaped = await Promise.all(
    exercises.map((ex) => shapeExerciseAnswers(ex, { scenarioTitle: group.scenarioTitle, includeRemoved: true }))
  );

  return (
    <AdminGroupAnswers
      data={{ groupName: group.name, scenarioTitle: group.scenarioTitle, exercises: shaped }}
      backHref={`/admin/projects/${slug}`}
      projectId={project.id}
      groupId={groupId}
      initialExerciseId={initialExerciseId}
    />
  );
}
