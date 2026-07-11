import { ParticipantView } from "@/components/workshop/ParticipantView";
import { getModel, getScenarioList } from "@/lib/model";

export const dynamic = "force-dynamic";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const { model } = await getModel();
  const scenarios = getScenarioList(model);
  return <ParticipantView code={code.toUpperCase()} scenarios={scenarios} />;
}
