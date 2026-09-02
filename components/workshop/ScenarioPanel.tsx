import { ScenarioBody } from "@/components/foresight/ScenarioBody";
import { ScenarioTabs } from "@/components/foresight/ScenarioTabs";
import type { PublicDriverCard, Scenario } from "@/lib/foresight/types";

// Card-less scenario for the design-group exercise views: a structured scenario renders
// bare (ScenarioTabs → paged reader, no surrounding box); a plain premise falls back to a
// lightly-boxed body. Shared by WorksheetView + RipplesTeamView so the scenario is framed
// identically every week.
export function ScenarioPanel({
  scenario,
  drivers = [],
  hiddenSections,
  premise,
}: {
  scenario: Scenario | null;
  drivers?: PublicDriverCard[];
  hiddenSections?: string[];
  premise?: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      {scenario ? (
        <ScenarioTabs scenario={scenario} drivers={drivers} hiddenSections={hiddenSections} />
      ) : premise ? (
        <div className="rounded-[3px] border border-[var(--hairline)] bg-card p-5">
          <ScenarioBody body={premise} />
        </div>
      ) : (
        <p className="text-[14px] italic text-muted">No scenario text.</p>
      )}
    </div>
  );
}
