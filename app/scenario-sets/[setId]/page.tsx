import { ScenarioSetDetail } from "@/components/foresight/scenario-views";

// Cards carry signed, expiring coverImageUrls — always render fresh.
export const dynamic = "force-dynamic";

export default async function ScenarioSetPage({
  params,
}: {
  params: Promise<{ setId: string }>;
}) {
  const { setId } = await params;
  return <ScenarioSetDetail setId={setId} basePath="/scenario-sets" />;
}
