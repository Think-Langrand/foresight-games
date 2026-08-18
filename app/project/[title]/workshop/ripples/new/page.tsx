import Link from "next/link";
import { notFound } from "next/navigation";
import { RipplesLauncher, type LauncherScenario } from "@/components/RipplesLauncher";
import { getProjectBySlugAny } from "@/lib/projects";
import { getScenarios, foresightConfigured } from "@/lib/foresight/client";

export const dynamic = "force-dynamic";

// Per-project RIPPLES setup: scenarios come from THIS project's Carmelita tenant,
// and the created session is stamped with the project (projectSlug), so it plays
// under the project's gated route.
export default async function ProjectNewRipplesPage({
  params,
}: {
  params: Promise<{ title: string }>;
}) {
  const { title } = await params;
  const project = await getProjectBySlugAny(title);
  if (!project) notFound();

  const configured = foresightConfigured();
  let scenarios: LauncherScenario[] = [];
  if (configured) {
    try {
      const cards = await getScenarios({ ref: project.carmelitaProjectRef });
      scenarios = cards.map((s) => ({ id: s.id, title: s.title, headline: s.headline }));
    } catch (err) {
      console.error("[project ripples/new] failed to load scenarios", err);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-[720px] px-5 py-10">
      <Link href={`/admin/projects/${title}`} className="text-[12px] font-semibold text-blue underline">
        ← {project.name}
      </Link>
      <span className="eyebrow blue mt-4 block">New game</span>
      <h1 className="mt-2 text-[30px] font-extrabold uppercase leading-[1.05] tracking-tight">
        Implication mapping
      </h1>
      <p className="serif mt-1 text-[18px] italic text-muted">
        Map a {project.name} scenario&rsquo;s implications in three rounds, then reflect.
      </p>
      <div className="mt-6">
        <RipplesLauncher
          scenarios={scenarios}
          configured={configured}
          projectSlug={project.slug}
          basePath={`/project/${project.slug}`}
        />
      </div>
    </main>
  );
}
