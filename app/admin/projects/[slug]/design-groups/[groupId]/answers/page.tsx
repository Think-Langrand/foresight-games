import { notFound } from "next/navigation";
import { supabaseConfigured } from "@/lib/workshop";
import { getProjectBySlugAny } from "@/lib/projects";
import { getDesignGroup, listDesignGroups } from "@/lib/design-groups";
import { listExercises } from "@/lib/design-group-exercises";
import { shapeExerciseAnswers } from "@/lib/group-answers";
import { AdminGroupAnswers } from "@/components/admin/AdminGroupAnswers";

export const dynamic = "force-dynamic";

// Admin: a design group's answers, one tab per exercise (week), each rendered in its
// natural shape — worksheet Q&A, implication futures-wheel + brainstorm, or "not built
// yet". `?exercise=<id>` deep-links a specific week's tab.
//
// `?week=<n>` (1-based) deep-links the same tab by POSITION instead. Exercise ids differ
// per group — each group owns its own rows — so a link that means "this same week, but
// the next group" can only travel by index. That's what the group switcher sends.
export default async function GroupAnswersPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; groupId: string }>;
  searchParams: Promise<{ exercise?: string; week?: string }>;
}) {
  const { slug, groupId } = await params;
  const { exercise, week } = await searchParams;
  if (!supabaseConfigured()) notFound();

  const project = await getProjectBySlugAny(slug);
  if (!project) notFound();
  const group = await getDesignGroup(groupId);
  if (!group || group.projectId !== project.id) notFound();

  const [exercises, siblings] = await Promise.all([
    listExercises(groupId), // all weeks, sort order
    listDesignGroups(project.id), // for the group switcher
  ]);
  const shaped = await Promise.all(
    exercises.map((ex) => shapeExerciseAnswers(ex, { scenarioTitle: group.scenarioTitle, includeRemoved: true }))
  );

  // An explicit ?exercise wins; otherwise resolve ?week by position, ignoring junk.
  const weekNo = Number(week);
  const initialExerciseId =
    exercise ??
    (Number.isInteger(weekNo) && weekNo >= 1 ? exercises[weekNo - 1]?.id : undefined);

  return (
    <AdminGroupAnswers
      data={{ groupName: group.name, scenarioTitle: group.scenarioTitle, exercises: shaped }}
      backHref={`/admin/projects/${slug}`}
      slug={slug}
      projectId={project.id}
      groupId={groupId}
      siblings={siblings.map((g) => ({ id: g.id, name: g.name, color: g.color }))}
      initialExerciseId={initialExerciseId}
    />
  );
}
