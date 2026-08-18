import { notFound } from "next/navigation";
import { getProjectBySlug } from "@/lib/projects";
import { ProjectUncertaintiesView } from "@/components/foresight/model-views";

export const dynamic = "force-dynamic";

export default async function ProjectUncertaintiesPage({
  params,
}: {
  params: Promise<{ title: string }>;
}) {
  const { title } = await params;
  const project = await getProjectBySlug(title);
  if (!project) notFound();

  return (
    <ProjectUncertaintiesView
      projectRef={project.carmelitaProjectRef}
      homeHref={`/project/${title}`}
    />
  );
}
