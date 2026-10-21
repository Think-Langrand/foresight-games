import { notFound } from "next/navigation";
import { getProjectBySlug } from "@/lib/projects";
import { getDesignGroup } from "@/lib/design-groups";
import { listExercises } from "@/lib/design-group-exercises";
import { shapeExerciseAnswers } from "@/lib/group-answers";
import { buildGroupSummary } from "@/lib/group-summary";
import GroupSummaryView from "@/components/design-groups/GroupSummary";

export const dynamic = "force-dynamic";

// A group's HANDOFF: the whole program folded onto one read-only page. Sibling of the
// [exerciseId] board route — `summary` is a static segment, so it wins over the dynamic one
// (exercise ids are uuids, so nothing collides).
//
// Reads through shapeExerciseAnswers, the same projection the admin viewer uses, so the page
// cannot disagree with the answers tab about what is on a board.
export default async function DesignGroupSummaryPage({
  params,
}: {
  params: Promise<{ title: string; groupId: string }>;
}) {
  const { title, groupId } = await params;
  const project = await getProjectBySlug(title);
  if (!project) notFound();
  const group = await getDesignGroup(groupId);
  if (!group || group.projectId !== project.id) notFound();

  const exercises = await listExercises(groupId);
  const weeks = await Promise.all(
    exercises.map((ex) => shapeExerciseAnswers(ex, { scenarioTitle: group.scenarioTitle }))
  );
  const summary = buildGroupSummary(weeks, {
    name: group.name,
    scenarioTitle: group.scenarioTitle,
  });
  // Handed through unshaped: section 02 mounts the real Session 2 map (ImplicationsPanel),
  // which builds the tree, the key-change chips and the order filters from these cards.
  const implications = weeks.find((w) => w.kind === "implications") ?? null;

  return (
    <GroupSummaryView
      s={summary}
      implications={implications}
      projectSlug={title}
      groupId={groupId}
    />
  );
}
