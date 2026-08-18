import { notFound } from "next/navigation";
import { getProjectBySlug } from "@/lib/projects";
import { ScenarioSetsIndex } from "@/components/foresight/scenario-views";

export const dynamic = "force-dynamic";

export default async function ProjectScenarioSetsPage({
  params,
}: {
  params: Promise<{ title: string }>;
}) {
  const { title } = await params;
  const project = await getProjectBySlug(title);
  if (!project) notFound();

  return (
    <ScenarioSetsIndex
      projectRef={project.carmelitaProjectRef}
      basePath={`/project/${title}/scenario-sets`}
      homeHref={`/project/${title}`}
    />
  );
}
