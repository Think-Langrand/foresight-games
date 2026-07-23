import { ParticipantView } from "@/components/workshop/ParticipantView";
import { CardsTeamView } from "@/components/workshop/CardsTeamView";
import { getModel, getScenarioList } from "@/lib/model";
import { getDeck } from "@/lib/cards";
import { getDrivers } from "@/lib/drivers";
import { getSessionByCode } from "@/lib/workshop";

export const dynamic = "force-dynamic";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const upper = code.toUpperCase();

  // Cards sessions get the team/card surface; everything else the uncertainty view.
  const session = await getSessionByCode(upper).catch(() => null);
  if (session?.scope === "Cards") {
    const [{ deck }, drivers] = await Promise.all([getDeck(), getDrivers()]);
    return <CardsTeamView code={upper} deck={deck} drivers={drivers} />;
  }

  const { model } = await getModel();
  const scenarios = getScenarioList(model);
  return <ParticipantView code={upper} scenarios={scenarios} />;
}
