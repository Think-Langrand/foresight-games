import { notFound } from "next/navigation";
import { getProjectBySlug } from "@/lib/projects";
import { SoloWorlds } from "@/components/play/SoloWorlds";

export const dynamic = "force-dynamic";

export default async function ProjectPlayPage({
  params,
}: {
  params: Promise<{ title: string }>;
}) {
  const { title } = await params;
  const project = await getProjectBySlug(title);
  if (!project) notFound();
  return <SoloWorlds basePath={`/project/${title}`} projectSlug={title} />;
}
