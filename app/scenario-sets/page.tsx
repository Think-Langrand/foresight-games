import { ScenarioSetsIndex } from "@/components/foresight/scenario-views";

// Always fresh, so a set just published on the platform appears immediately.
export const dynamic = "force-dynamic";

// Legacy global route — the single default project (FORESIGHT_PROJECT_REF).
// Per-project versions live under /project/[title]/scenario-sets.
export default function ScenarioSetsPage() {
  return <ScenarioSetsIndex basePath="/scenario-sets" homeHref="/" />;
}
