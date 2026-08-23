import { notFound } from "next/navigation";
import { getProjectBySlug } from "@/lib/projects";
import { listDesignGroups, implicationCountsByCode } from "@/lib/design-groups";
import { DesignGroupsIndex, type DesignGroupCard } from "@/components/project/DesignGroupsIndex";

export const dynamic = "force-dynamic";

// Per-project "Design Groups" tab: members self-select their group and land on its
// shared implication-mapping board. Config-driven home item (lib/project-home.ts).
export default async function ProjectDesignGroupsPage({
  params,
}: {
  params: Promise<{ title: string }>;
}) {
  const { title } = await params;
  const project = await getProjectBySlug(title);
  if (!project) notFound();

  const groups = await listDesignGroups(project.id);
  const counts = await implicationCountsByCode(
    groups.map((g) => g.sessionCode ?? "").filter(Boolean)
  );
  const cards: DesignGroupCard[] = groups.map((g) => ({
    id: g.id,
    name: g.name,
    color: g.color,
    scenarioTitle: g.scenarioTitle,
    sessionCode: g.sessionCode,
    status: g.status,
    implications: g.sessionCode ? counts.get(g.sessionCode.toUpperCase()) ?? 0 : 0,
  }));

  return <DesignGroupsIndex slug={project.slug} groups={cards} />;
}
