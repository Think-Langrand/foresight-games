import { notFound } from "next/navigation";
import { supabaseConfigured } from "@/lib/workshop";
import { getProjectBySlugAny } from "@/lib/projects";
import { poolCohortItems } from "@/lib/analysis/cohort-pool";
import { poolSourceLabel } from "@/lib/analysis/cohort-pool-shape";
import { CohortAnalysisWorkbench } from "@/components/admin/cohort/analysis/CohortAnalysisWorkbench";

export const dynamic = "force-dynamic";

// Admin: the cohort analysis — every design group's material pooled, themed, and read four
// ways from one run. The proxy gates /admin; the route the page calls re-checks the session
// server-side regardless.
//
// Renders the pool preview only (which groups contribute, how many items, which week), so
// the controls are correct on first paint and the size of a run is visible before paying
// for one. No model call happens here.
export default async function CohortAnalysisPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!supabaseConfigured()) notFound();

  const project = await getProjectBySlugAny(slug);
  if (!project) notFound();

  const pool = await poolCohortItems(project.id, { source: "implications" });

  return (
    <CohortAnalysisWorkbench
      projectId={project.id}
      slug={slug}
      initial={{
        projectName: project.name,
        source: pool.source,
        sourceLabel: poolSourceLabel(pool.source),
        weeks: pool.weeks,
        week: pool.week,
        groups: pool.groups,
        itemCount: pool.items.length,
      }}
    />
  );
}
