import Link from "next/link";
import { notFound } from "next/navigation";
import { RipplesLauncher, type LauncherScenario } from "@/components/RipplesLauncher";
import { getProjectBySlug } from "@/lib/projects";
import { getScenarios, foresightConfigured } from "@/lib/foresight/client";

export const dynamic = "force-dynamic";

// Per-project solo Ripples: a participant picks one of THIS project's scenarios
// and works through its implications on their own. Gated by the project layout.
// The created session is stamped with the project (projectSlug) so it plays under
// the project's route with the project's scenario art.
export default async function ProjectPlayRipplesPage({
  params,
}: {
  params: Promise<{ title: string }>;
}) {
  const { title } = await params;
  const project = await getProjectBySlug(title);
  if (!project) notFound();

  const configured = foresightConfigured();
  let scenarios: LauncherScenario[] = [];
  if (configured) {
    try {
      const cards = await getScenarios({ ref: project.carmelitaProjectRef });
      scenarios = cards.map((s) => ({ id: s.id, title: s.title, headline: s.headline }));
    } catch (err) {
      console.error("[project play/ripples] failed to load scenarios", err);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-[720px] px-5 py-12 md:py-16">
      <Link href={`/project/${project.slug}`} className="eyebrow blue">
        ← {project.name}
      </Link>
      <span className="eyebrow ink mt-4 block">Play solo</span>
      <h1 className="mt-2 text-[34px] font-extrabold uppercase leading-[1.03] tracking-tight md:text-[40px]">
        Implication mapping
      </h1>
      <p className="serif mt-4 max-w-[560px] text-[18px] leading-[1.35] text-ink">
        Step into one of this project&rsquo;s futures and work out what follows. Map its implications
        in three rounds, then answer four questions about what it means.
      </p>
      <div className="mt-6">
        <RipplesLauncher
          scenarios={scenarios}
          configured={configured}
          solo
          projectSlug={project.slug}
          basePath={`/project/${project.slug}`}
        />
      </div>
    </main>
  );
}
