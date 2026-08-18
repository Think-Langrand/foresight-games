import Link from "next/link";
import { notFound } from "next/navigation";
import { getProjectBySlug } from "@/lib/projects";
import { listAllTeams } from "@/lib/teams";
import { getDeck } from "@/lib/cards";
import { MoleculesGrid } from "@/components/workshop/MoleculesGrid";
import { ForesightUnavailable } from "@/components/foresight/notice";
import { describeForesightFailure } from "@/lib/foresight/client";
import type { Card } from "@/lib/workshop-types";

export const dynamic = "force-dynamic";

// This project's submitted worlds only, rendered against its Carmelita deck.
export default async function ProjectMoleculesPage({
  params,
}: {
  params: Promise<{ title: string }>;
}) {
  const { title } = await params;
  const project = await getProjectBySlug(title);
  if (!project) notFound();

  const teams = await listAllTeams({ onlySubmitted: true, projectId: project.id });

  let cards: Card[] | null = null;
  let failure: string | null = null;
  try {
    cards = (await getDeck(project.carmelitaProjectRef)).deck.cards;
  } catch (err) {
    failure = describeForesightFailure(err);
  }

  return (
    <main className="mx-auto min-h-screen max-w-[1100px] px-6 py-12 md:py-16">
      <Link href={`/project/${title}`} className="eyebrow blue">
        ← Home
      </Link>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-b border-[var(--rule)] pb-5">
        <div>
          <span className="eyebrow ink">Built in the room</span>
          <h1 className="mt-2 text-[34px] font-extrabold uppercase leading-[1.03] tracking-tight md:text-[44px]">
            Scenario-blocks
          </h1>
        </div>
        <span className="text-[12px] text-muted">{teams.length} worlds</span>
      </div>
      <p className="serif mt-4 max-w-[720px] text-[19px] leading-[1.35] text-ink">
        Every future scenario built for this project by combining outcome cards.
      </p>

      {failure ? (
        <ForesightUnavailable detail={failure} />
      ) : teams.length === 0 ? (
        <p className="mt-12 text-[15px] text-muted">
          No finished scenarios yet. Play a card game and submit a world to see it here.
        </p>
      ) : (
        <MoleculesGrid teams={teams} cards={cards ?? []} basePath={`/project/${title}`} />
      )}
    </main>
  );
}
