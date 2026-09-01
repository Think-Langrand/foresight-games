import { notFound } from "next/navigation";
import { getProjectBySlug } from "@/lib/projects";
import { ScenarioDetailView } from "@/components/foresight/scenario-views";

export const dynamic = "force-dynamic";

export default async function ProjectScenarioDetailPage({
  params,
}: {
  params: Promise<{ title: string; setId: string; scenarioRef: string }>;
}) {
  const { title, setId, scenarioRef } = await params;
  const project = await getProjectBySlug(title);
  if (!project) notFound();

  return (
    <ScenarioDetailView
      setId={setId}
      scenarioRef={scenarioRef}
      projectRef={project.carmelitaProjectRef}
      basePath={`/project/${title}/scenario-sets`}
      hiddenSections={project.homeConfig.hiddenScenarioSections}
    />
  );
}
