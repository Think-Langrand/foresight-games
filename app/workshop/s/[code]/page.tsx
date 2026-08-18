import { redirect } from "next/navigation";
import { ParticipantView } from "@/components/workshop/ParticipantView";
import { CardsTeamView } from "@/components/workshop/CardsTeamView";
import { RipplesTeamView } from "@/components/workshop/RipplesTeamView";
import { getModel, getScenarioList } from "@/lib/model";
import { getDeck } from "@/lib/cards";
import { getDrivers } from "@/lib/drivers";
import { getSessionByCode } from "@/lib/workshop";
import { getRippleScenario, getRippleDrivers } from "@/lib/ripples";
import { getProjectById } from "@/lib/projects";

export const dynamic = "force-dynamic";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const upper = code.toUpperCase();

  const session = await getSessionByCode(upper).catch(() => null);

  // A project session belongs behind its project's gate: send it to the
  // per-project route (which uses that project's Carmelita deck). The global
  // route only ever renders global (project_id null) sessions.
  if (session?.projectId) {
    const project = await getProjectById(session.projectId);
    if (project) redirect(`/project/${project.slug}/workshop/s/${upper}`);
  }

  // Ripples: the implications-mapping surface (no deck; premise + config live on
  // the session, delivered live via the ripples payload).
  if (session?.scope === "Ripples") {
    const [scenario, drivers] = await Promise.all([
      getRippleScenario(session),
      getRippleDrivers(session),
    ]);
    return <RipplesTeamView code={upper} scenario={scenario} drivers={drivers} />;
  }

  // Cards + Solo sessions get the team/card surface; everything else the
  // uncertainty view. Solo swaps the lobby/code chrome for a "my worlds" flow.
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
