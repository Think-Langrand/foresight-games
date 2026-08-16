import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTeamById } from "@/lib/teams";
import { getDeck } from "@/lib/cards";
import { getDrivers } from "@/lib/drivers";
import { getProjectById } from "@/lib/projects";
import { teamTriadIds, type Card } from "@/lib/workshop-types";
import { TeamResult } from "@/components/workshop/TeamResult";

export const dynamic = "force-dynamic";

export default async function ScenarioMoleculePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const team = await getTeamById(id);
  if (!team) notFound();

  // A project world lives behind its project's gate + renders against its own
  // deck — send it to the per-project detail route.
  if (team.projectId) {
    const project = await getProjectById(team.projectId);
    if (project) redirect(`/project/${project.slug}/scenario-molecules/${id}`);
  }

  const [{ deck }, drivers] = await Promise.all([getDeck(), getDrivers()]);
  const byId = new Map(deck.cards.map((c) => [c.id, c]));
  const driversBySlug = new Map(drivers.map((d) => [d.slug, d]));

  const triad = teamTriadIds(team)
    .map((cid) => byId.get(cid))
    .filter((c): c is Card => Boolean(c));
  const wildcard = team.wildcardId ? byId.get(team.wildcardId) ?? null : null;

  return (
    <main className="mx-auto min-h-screen max-w-[1160px] px-6 py-10 md:py-14">
      <div className="flex items-center justify-between">
        <Link href="/scenario-molecules" className="eyebrow blue">
          ← All scenario-blocks
        </Link>
      </div>
      <div className="mt-8">
        <TeamResult
          team={team}
          triad={triad}
          wildcard={wildcard}
          driversBySlug={driversBySlug}
          size="lg"
        />
      </div>
    </main>
  );
}
