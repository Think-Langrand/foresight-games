import { redirect } from "next/navigation";
import { PresentView } from "@/components/workshop/PresentView";
import { CardsPresentView } from "@/components/workshop/CardsPresentView";
import { RipplesPresentView } from "@/components/workshop/RipplesPresentView";
import { getModel, getScenarioList } from "@/lib/model";
import { getDeck } from "@/lib/cards";
import { getDrivers } from "@/lib/drivers";
import { getSessionByCode } from "@/lib/workshop";
import { getRippleArt } from "@/lib/ripples";
import { getProjectById } from "@/lib/projects";

export const dynamic = "force-dynamic";

export default async function PresentPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const upper = code.toUpperCase();

  const session = await getSessionByCode(upper).catch(() => null);

  // Project sessions project through their own gated route (their Carmelita deck).
  if (session?.projectId) {
    const project = await getProjectById(session.projectId);
    if (project) redirect(`/project/${project.slug}/workshop/s/${upper}/present`);
  }

  if (session?.scope === "Ripples") {
    const art = await getRippleArt(session);
    return <RipplesPresentView code={upper} art={art} />;
  }

  if (session?.scope === "Cards") {
    const [{ deck }, drivers] = await Promise.all([getDeck(), getDrivers()]);
    return <CardsPresentView code={upper} deck={deck} drivers={drivers} />;
  }

  const { model, driverNameBySlug } = await getModel();
  const scenarios = getScenarioList(model, driverNameBySlug);
  return <PresentView code={upper} scenarios={scenarios} />;
}
