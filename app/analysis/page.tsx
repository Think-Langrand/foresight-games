import { listAllTeams } from "@/lib/teams";
import { getDeck } from "@/lib/cards";
import { getSessionUser } from "@/lib/supabase-auth";
import { teamsToKernelEntries } from "@/lib/analysis/from-teams";
import { buildAnalysisData } from "@/lib/analysis/view-data";
import { AnalysisView } from "@/components/analysis/AnalysisView";

export const dynamic = "force-dynamic";

// All-sessions analysis, optionally filtered to ?codes=6SJB,QR26.
export default async function AnalysisPage({
  searchParams,
}: {
  searchParams: Promise<{ codes?: string | string[] }>;
}) {
  const { codes } = await searchParams;
  const codesParam = Array.isArray(codes) ? codes.join(",") : codes;
  const wanted = (codesParam ?? "")
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);

  const [teams, { deck }, user] = await Promise.all([
    // Analysis runs over submitted worlds only; cleanEntries also enforces this.
    listAllTeams({ onlySubmitted: true }),
    getDeck(),
    getSessionUser(),
  ]);

  const filteredTeams = wanted.length
    ? teams.filter((t) => wanted.includes(t.code.toUpperCase()))
    : teams;

  const entries = teamsToKernelEntries(filteredTeams, deck);
  const data = buildAnalysisData(entries, { allDimensions: deck.dimensions });

  const scope = wanted.length
    ? `Sessions ${wanted.join(", ")} — ${data.kept.length} submitted kernels.`
    : `Every submitted kernel across all sessions — ${data.kept.length} kept.`;

  return (
    <AnalysisView data={data} canEdit={Boolean(user)} scope={scope} backHref="/" />
  );
}
