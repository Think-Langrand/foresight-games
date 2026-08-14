import { notFound } from "next/navigation";
import { getProjectBySlug } from "@/lib/projects";
import { ScenarioSetDetail } from "@/components/foresight/scenario-views";

export const dynamic = "force-dynamic";

export default async function ProjectScenarioSetPage({
  params,
}: {
  params: Promise<{ title: string; setId: string }>;
}) {
  const { title, setId } = await params;
  const project = await getProjectBySlug(title);
  if (!project) notFound();

  return (
    <ScenarioSetDetail
      setId={setId}
      projectRef={project.carmelitaProjectRef}
      basePath={`/project/${title}/scenario-sets`}
    />
  );
}
