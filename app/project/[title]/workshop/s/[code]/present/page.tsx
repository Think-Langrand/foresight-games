import { notFound } from "next/navigation";
import { getProjectBySlug } from "@/lib/projects";
import { getSessionByCode } from "@/lib/workshop";
import { getRippleArt } from "@/lib/ripples";
import { getDeckForProjectId, getDriversForProjectRef } from "@/lib/cards";
import { CardsPresentView } from "@/components/workshop/CardsPresentView";
import { RipplesPresentView } from "@/components/workshop/RipplesPresentView";
import { ForesightUnavailable } from "@/components/foresight/notice";
import { describeForesightFailure } from "@/lib/foresight/client";
import type { Deck } from "@/lib/workshop-types";
import type { DriverLite } from "@/lib/drivers-shared";

export const dynamic = "force-dynamic";

// The per-project facilitator projector (facilitated Cards only).
export default async function ProjectPresentPage({
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

  // Ripples projector — no deck needed.
  if (session.scope === "Ripples") {
    const art = await getRippleArt(session);
    return <RipplesPresentView code={upper} art={art} basePath={`/project/${title}`} />;
  }

  if (session.scope !== "Cards") notFound();

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
    <CardsPresentView
      code={upper}
      deck={deck}
      drivers={drivers}
      basePath={`/project/${title}`}
    />
  );
}
