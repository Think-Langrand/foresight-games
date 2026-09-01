import { notFound } from "next/navigation";
import { getProjectBySlug } from "@/lib/projects";
import { getScenarioSets } from "@/lib/foresight/client";
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

  // The "Scenarios" card opens a set's scenarios directly: the admin-chosen default,
  // else the first set the platform returns; falls back to the sets-list page if neither
  // resolves (no default + platform unreachable/empty).
  const setsBase = `/project/${project.slug}/scenario-sets`;
  let scenariosHref = setsBase;
  const { defaultScenarioSetId } = project.homeConfig;
  const scenarioCardVisible = project.homeConfig.items.some(
    (i) => i.key === "scenario-sets" && i.visible
  );
  if (defaultScenarioSetId) {
    scenariosHref = `${setsBase}/${defaultScenarioSetId}`;
  } else if (scenarioCardVisible) {
    try {
      const sets = await getScenarioSets(project.carmelitaProjectRef);
      if (sets[0]) scenariosHref = `${setsBase}/${sets[0].id}`;
    } catch {
      // platform unreachable → keep the sets-list fallback
    }
  }

  return (
    <ProjectHome
      projectName={project.name}
      slug={project.slug}
      items={project.homeConfig.items}
      scenariosHref={scenariosHref}
    />
  );
}
