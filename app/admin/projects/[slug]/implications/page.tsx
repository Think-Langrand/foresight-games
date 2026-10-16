import { notFound } from "next/navigation";
import { supabaseConfigured } from "@/lib/workshop";
import { getProjectBySlugAny } from "@/lib/projects";
import { poolCohortImplications } from "@/lib/analysis/cohort-pool";
import { CohortWorkbench } from "@/components/admin/cohort/CohortWorkbench";

export const dynamic = "force-dynamic";

// Admin: the cohort implications playground — every design group's implications pooled and
// themed together. The proxy gates /admin; the routes the page calls re-check the session
// server-side regardless.
//
// The page renders the pool preview (which groups contribute, how many implications, which
// weeks exist) so the controls are correct on first paint and a facilitator can see the
// size of a run before paying for one. No model call happens here.
export default async function CohortImplicationsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!supabaseConfigured()) notFound();

  const project = await getProjectBySlugAny(slug);
  if (!project) notFound();

  const pool = await poolCohortImplications(project.id);

  return (
    <CohortWorkbench
      projectId={project.id}
      slug={slug}
      initial={{
        projectName: project.name,
        weeks: pool.weeks,
        week: pool.week,
        groups: pool.groups,
        itemCount: pool.items.length,
      }}
    />
  );
}
