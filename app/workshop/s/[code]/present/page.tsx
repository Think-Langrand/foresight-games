import { PresentView } from "@/components/workshop/PresentView";
import { getModel, getScenarioList } from "@/lib/model";

export const dynamic = "force-dynamic";

export default async function PresentPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const { model } = await getModel();
  const scenarios = getScenarioList(model);
  return <PresentView code={code.toUpperCase()} scenarios={scenarios} />;
}
