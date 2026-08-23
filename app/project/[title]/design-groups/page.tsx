import { notFound } from "next/navigation";
import { getProjectBySlug } from "@/lib/projects";
import { listDesignGroups } from "@/lib/design-groups";
import { listExercises } from "@/lib/design-group-exercises";
import { DesignGroupsIndex, type DesignGroupCard } from "@/components/project/DesignGroupsIndex";

export const dynamic = "force-dynamic";

// Per-project "Design Groups" tab: members self-select their group, then open its
// program of weekly exercises. Config-driven home item (lib/project-home.ts).
export default async function ProjectDesignGroupsPage({
  params,
}: {
  params: Promise<{ title: string }>;
}) {
  const { title } = await params;
  const project = await getProjectBySlug(title);
  if (!project) notFound();

  const groups = await listDesignGroups(project.id);
  const exercisesByGroup = await Promise.all(groups.map((g) => listExercises(g.id)));
  const cards: DesignGroupCard[] = groups.map((g, i) => ({
    id: g.id,
    name: g.name,
    color: g.color,
    scenarioTitle: g.scenarioTitle,
    weekCount: exercisesByGroup[i].length,
    ready: Boolean(g.scenarioRef && exercisesByGroup[i].length > 0),
  }));

  return <DesignGroupsIndex slug={project.slug} groups={cards} />;
}
