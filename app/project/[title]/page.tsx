import { notFound } from "next/navigation";
import { getProjectBySlug } from "@/lib/projects";
import { ProjectHome } from "@/components/project/ProjectHome";

export const dynamic = "force-dynamic";

// The project home. The layout has already resolved + gated this project; we
// re-resolve through the cached getProjectBySlug (same in-process entry).
export default async function ProjectHomePage({
  params,
}: {
  params: Promise<{ title: string }>;
}) {
  const { title } = await params;
  const project = await getProjectBySlug(title);
  if (!project) notFound();

  return (
    <ProjectHome
      projectName={project.name}
      slug={project.slug}
      items={project.homeConfig.items}
    />
  );
}
