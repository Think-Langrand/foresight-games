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

  // Cards + Solo sessions get the team/card surface; everything else the
  // uncertainty view. Solo swaps the lobby/code chrome for a "my worlds" flow.
  const session = await getSessionByCode(upper).catch(() => null);
  if (session?.scope === "Cards" || session?.scope === "Solo") {
    const [{ deck }, drivers] = await Promise.all([getDeck(), getDrivers()]);
    return (
      <CardsTeamView code={upper} deck={deck} drivers={drivers} solo={session.scope === "Solo"} />
    );
  }

  const [{ model, driverNameBySlug }, drivers] = await Promise.all([getModel(), getDrivers()]);
  const scenarios = getScenarioList(model, driverNameBySlug);
  return <ParticipantView code={upper} scenarios={scenarios} drivers={drivers} />;
}
