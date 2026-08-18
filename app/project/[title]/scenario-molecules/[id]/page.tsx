import Link from "next/link";
import { notFound } from "next/navigation";
import { getProjectBySlug } from "@/lib/projects";
import { getTeamById } from "@/lib/teams";
import { getDeckForProjectId, getDriversForProjectRef } from "@/lib/cards";
import { teamTriadIds, type Card } from "@/lib/workshop-types";
import { TeamResult } from "@/components/workshop/TeamResult";
import { ForesightUnavailable } from "@/components/foresight/notice";
import { describeForesightFailure } from "@/lib/foresight/client";
import type { DriverLite } from "@/lib/drivers-shared";

export const dynamic = "force-dynamic";

export default async function ProjectMoleculePage({
  params,
}: {
  params: Promise<{ title: string; id: string }>;
}) {
  const { title, id } = await params;
  const project = await getProjectBySlug(title);
  if (!project) notFound();

  const team = await getTeamById(id);
  // Isolation guard: this world must belong to this project.
  if (!team || team.projectId !== project.id) notFound();

  const back = `/project/${title}/scenario-molecules`;

  // Resolve the project deck (fetch in try/catch, render outside).
  let byId = new Map<string, Card>();
  let driversBySlug = new Map<string, DriverLite>();
  let failure: string | null = null;
  try {
    const resolved = await getDeckForProjectId(team.projectId);
    const drivers = await getDriversForProjectRef(resolved.ref);
    byId = new Map(resolved.deck.cards.map((c) => [c.id, c]));
    driversBySlug = new Map(drivers.map((d) => [d.slug, d]));
  } catch (err) {
    failure = describeForesightFailure(err);
  }

  if (failure) {
    return (
      <main className="mx-auto min-h-screen max-w-[1160px] px-6 py-10 md:py-14">
        <Link href={back} className="eyebrow blue">
          ← All scenario-blocks
        </Link>
        <div className="mt-8">
          <ForesightUnavailable detail={failure} />
        </div>
      </main>
    );
  }

  const triad = teamTriadIds(team)
    .map((cid) => byId.get(cid))
    .filter((c): c is Card => Boolean(c));
  const wildcard = team.wildcardId ? byId.get(team.wildcardId) ?? null : null;

  return (
    <main className="mx-auto min-h-screen max-w-[1160px] px-6 py-10 md:py-14">
      <div className="flex items-center justify-between">
        <Link href={back} className="eyebrow blue">
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
