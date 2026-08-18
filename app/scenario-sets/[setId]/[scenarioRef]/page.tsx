import { ScenarioDetailView } from "@/components/foresight/scenario-views";

// Scenario images are signed and expiring — always render fresh.
export const dynamic = "force-dynamic";

export default async function ScenarioDetailPage({
  params,
}: {
  params: Promise<{ setId: string; scenarioRef: string }>;
}) {
  const { setId, scenarioRef } = await params;
  return (
    <ScenarioDetailView
      setId={setId}
      scenarioRef={scenarioRef}
      basePath="/scenario-sets"
    />
  );
}
