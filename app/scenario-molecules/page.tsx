import Link from "next/link";
import { listAllTeams } from "@/lib/teams";
import { getDeck } from "@/lib/cards";
import { MoleculesGrid } from "@/components/workshop/MoleculesGrid";

export const dynamic = "force-dynamic";

export default async function ScenarioMoleculesPage() {
  // The global gallery shows only global-game worlds (project_id null); each
  // project's worlds live behind its own gated gallery.
  const [teams, { deck }] = await Promise.all([
    listAllTeams({ onlySubmitted: true, projectId: null }),
    getDeck(),
  ]);

  return (
    <main className="mx-auto min-h-screen max-w-[1100px] px-6 py-12 md:py-16">
      <Link href="/" className="eyebrow blue">
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
        Every future scenario teams have built by combining outcome cards — the drivers and
        uncertainties bound together into a small world.
      </p>

      {teams.length === 0 ? (
        <p className="mt-12 text-[15px] text-muted">
          No finished scenarios yet. Play a card game and submit a world to see it here.
        </p>
      ) : (
        <MoleculesGrid teams={teams} cards={deck.cards} />
      )}
    </main>
  );
}
