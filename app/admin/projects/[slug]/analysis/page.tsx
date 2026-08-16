import { notFound } from "next/navigation";
import { listAllTeams } from "@/lib/teams";
import { getDeck } from "@/lib/cards";
import { getProjectBySlugAny } from "@/lib/projects";
import { getSessionUser } from "@/lib/supabase-auth";
import { teamsToKernelEntries } from "@/lib/analysis/from-teams";
import { buildAnalysisData } from "@/lib/analysis/view-data";
import { AnalysisView } from "@/components/analysis/AnalysisView";
import { ForesightUnavailable } from "@/components/foresight/notice";
import { describeForesightFailure } from "@/lib/foresight/client";
import type { Deck } from "@/lib/workshop-types";

export const dynamic = "force-dynamic";

// Kernels/analysis for one project — same AnalysisView, scoped to this project's
// submitted worlds and rendered against its Carmelita deck.
export default async function ProjectAnalysisPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const project = await getProjectBySlugAny(slug);
  if (!project) notFound();

  const [teams, user] = await Promise.all([
    listAllTeams({ onlySubmitted: true, projectId: project.id }),
    getSessionUser(),
  ]);

  let deck: Deck | null = null;
  let failure: string | null = null;
  try {
    deck = (await getDeck(project.carmelitaProjectRef)).deck;
  } catch (err) {
    failure = describeForesightFailure(err);
  }

  if (!deck) {
    return (
      <main className="mx-auto min-h-screen max-w-[1100px] px-6 py-12 md:py-16">
        <ForesightUnavailable detail={failure ?? "The deck could not be loaded."} />
      </main>
    );
  }

  const entries = teamsToKernelEntries(teams, deck);
  const data = buildAnalysisData(entries, { allDimensions: deck.dimensions });
  const scope = `${project.name} — ${data.kept.length} submitted kernel${
    data.kept.length === 1 ? "" : "s"
  }.`;

  return (
    <AnalysisView
      data={data}
      canEdit={Boolean(user)}
      scope={scope}
      backHref={`/admin/projects/${slug}`}
    />
  );
}
