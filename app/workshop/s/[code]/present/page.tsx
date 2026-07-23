import { PresentView } from "@/components/workshop/PresentView";
import { CardsPresentView } from "@/components/workshop/CardsPresentView";
import { getModel, getScenarioList } from "@/lib/model";
import { getDeck } from "@/lib/cards";
import { getDrivers } from "@/lib/drivers";
import { getSessionByCode } from "@/lib/workshop";

export const dynamic = "force-dynamic";

export default async function PresentPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const upper = code.toUpperCase();

  const session = await getSessionByCode(upper).catch(() => null);
  if (session?.scope === "Cards") {
    const [{ deck }, drivers] = await Promise.all([getDeck(), getDrivers()]);
    return <CardsPresentView code={upper} deck={deck.cards} drivers={drivers} />;
  }

  const { model, driverNameBySlug } = await getModel();
  const scenarios = getScenarioList(model, driverNameBySlug);
  return <PresentView code={upper} scenarios={scenarios} />;
}
