import { notFound } from "next/navigation";
import { getProjectBySlug } from "@/lib/projects";
import { getSessionByCode } from "@/lib/workshop";
import { getDeckForProjectId, getDriversForProjectRef } from "@/lib/cards";
import { CardsTeamView } from "@/components/workshop/CardsTeamView";
import { ForesightUnavailable } from "@/components/foresight/notice";
import { describeForesightFailure } from "@/lib/foresight/client";
import type { Deck } from "@/lib/workshop-types";
import type { DriverLite } from "@/lib/drivers-shared";

export const dynamic = "force-dynamic";

// The per-project play surface. Deck comes from the SESSION's project (its
// Carmelita model). A project workshop route only hosts sessions belonging to
// that project (isolation guard).
export default async function ProjectSessionPage({
  params,
}: {
  params: Promise<{ title: string; code: string }>;
}) {
  const { title, code } = await params;
  const upper = code.toUpperCase();
  const project = await getProjectBySlug(title);
  if (!project) notFound();

  const session = await getSessionByCode(upper).catch(() => null);
  if (!session || session.projectId !== project.id) notFound();

  // A project deck has no seed fallback — resolve it, surfacing the platform being
  // down rather than crashing. (Fetch in try/catch, render outside it.)
  let deck: Deck | null = null;
  let drivers: DriverLite[] = [];
  let failure: string | null = null;
  try {
    const resolved = await getDeckForProjectId(session.projectId);
    deck = resolved.deck;
    drivers = await getDriversForProjectRef(resolved.ref);
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

  return (
    <CardsTeamView
      code={upper}
      deck={deck}
      drivers={drivers}
      solo={session.scope === "Solo"}
      basePath={`/project/${title}`}
    />
  );
}
