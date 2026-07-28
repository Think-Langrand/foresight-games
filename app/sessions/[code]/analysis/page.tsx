import { getTeams } from "@/lib/teams";
import { getDeck } from "@/lib/cards";
import { getSessionUser } from "@/lib/supabase-auth";
import { teamsToKernelEntries } from "@/lib/analysis/from-teams";
import { buildAnalysisData } from "@/lib/analysis/view-data";
import { AnalysisView } from "@/components/analysis/AnalysisView";

export const dynamic = "force-dynamic";

// Single-session analysis — same component, pre-filtered to one code.
export default async function SessionAnalysisPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const upper = code.toUpperCase();

  const [teams, { deck }, user] = await Promise.all([
    getTeams(upper),
    getDeck(),
    getSessionUser(),
  ]);

  const entries = teamsToKernelEntries(teams, deck);
  const data = buildAnalysisData(entries, { allDimensions: deck.dimensions });

  const submitted = teams.filter((t) => t.status === "Submitted").length;
  const scope =
    submitted === 0
      ? `Session ${upper} has no submitted kernels yet.`
      : data.kept.length === 0
        ? `Session ${upper}: all ${submitted} submitted entries were excluded (see below).`
        : `Session ${upper} — ${data.kept.length} of ${submitted} submitted kernels analysed.`;

  return (
    <AnalysisView data={data} canEdit={Boolean(user)} scope={scope} backHref="/admin/analysis" />
  );
}
