"use client";

import { useState } from "react";
import type {
  DriverSource,
  EarlySignal,
  PublicDriverCard,
  Scenario,
} from "@/lib/foresight/types";
import { ScenarioReaderPaged } from "@/components/foresight/ScenarioReaderPaged";
import { SignedImage } from "@/components/foresight/SignedImage";
import { DriverSignals } from "@/components/foresight/DriverSignals";

// The scenario reader with two optional sibling tabs:
//   • Drivers — the model drivers this scenario is built on (scenario.linkedDrivers,
//     enriched with each driver's full card + its source "signals"). Only when the
//     scenario links at least one driver.
//   • Signals — the scenario's own early signals (scenario.earlySignals): real-world
//     evidence this future is already forming. Only when there are any.
// A tab that has nothing to show is not rendered. When neither has anything, we
// return the bare reader (no lonely tab bar).
//
// Client component (tab state); reused by the scenario-sets detail page and the
// Ripples backdrop.
type DriverEntry = {
  id: string;
  name: string;
  shortDescription?: string;
  imageUrl?: string | null;
  tags?: { id: string; name: string }[];
  sources?: DriverSource[];
};

type TabKey = "scenario" | "drivers" | "signals";

export function ScenarioTabs({
  scenario,
  drivers = [],
  hiddenSections,
}: {
  scenario: Scenario;
  drivers?: PublicDriverCard[];
  hiddenSections?: string[];
}) {
  const byId = new Map(drivers.map((d) => [d.id, d] as const));
  const linked: DriverEntry[] = (scenario.linkedDrivers ?? []).map(
    (ld) => byId.get(ld.driverId) ?? { id: ld.driverId, name: ld.name }
  );
  const signals = scenario.earlySignals ?? [];
  const hasDrivers = linked.length > 0;
  const hasSignals = signals.length > 0;

  const [tab, setTab] = useState<TabKey>("scenario");

  // Nothing extra to surface → just the reader.
  if (!hasDrivers && !hasSignals) return <ScenarioReaderPaged scenario={scenario} hiddenSections={hiddenSections} />;

  return (
    <div>
      <div className="mb-6 flex items-center gap-1 border-b border-[var(--rule)]">
        <TabButton active={tab === "scenario"} onClick={() => setTab("scenario")}>
          Scenario
        </TabButton>
        {hasDrivers && (
          <TabButton active={tab === "drivers"} onClick={() => setTab("drivers")}>
            Drivers
          </TabButton>
        )}
        {hasSignals && (
          <TabButton active={tab === "signals"} onClick={() => setTab("signals")}>
            Signals
          </TabButton>
        )}
      </div>

      {tab === "drivers" && hasDrivers ? (
        <DriversPanel drivers={linked} />
      ) : tab === "signals" && hasSignals ? (
        <SignalsPanel signals={signals} />
      ) : (
        <ScenarioReaderPaged scenario={scenario} hiddenSections={hiddenSections} />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "-mb-px inline-flex items-center border-b-2 px-3 py-2 text-[12px] font-bold uppercase tracking-[0.08em] transition-colors " +
        (active ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink")
      }
    >
      {children}
    </button>
  );
}

function DriversPanel({ drivers }: { drivers: DriverEntry[] }) {
  return (
    <div>
      <p className="mb-4 text-[13px] leading-[1.5] text-muted">
        The forces this scenario is built on — drivers from the model that shape how it could unfold.
      </p>
      <div className="grid items-start gap-4 md:grid-cols-2">
        {drivers.map((d) => (
          <article
            key={d.id}
            className="flex flex-col overflow-hidden rounded-[3px] border border-[var(--hairline)] bg-card"
          >
            {d.imageUrl && (
              <div className="aspect-[16/9] w-full overflow-hidden bg-[var(--hairline)]">
                <SignedImage src={d.imageUrl} alt={d.name} className="h-full w-full object-cover" />
              </div>
            )}
            <div className="p-5">
              <h3 className="text-[17px] font-extrabold uppercase leading-[1.1] tracking-tight">
                {d.name}
              </h3>
              {d.shortDescription && (
                <p className="mt-2 text-[13.5px] leading-[1.55] text-muted">{d.shortDescription}</p>
              )}
              {d.tags && d.tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {d.tags.map((t) => (
                    <span
                      key={t.id}
                      className="rounded-[2px] bg-[var(--hairline)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-muted"
                    >
                      {t.name}
                    </span>
                  ))}
                </div>
              )}
              <DriverSignals sources={d.sources} />
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function SignalsPanel({ signals }: { signals: EarlySignal[] }) {
  return (
    <div>
      <p className="mb-4 text-[13px] leading-[1.5] text-muted">
        Early signals — real-world evidence that this future is already forming.
      </p>
      <ul className="flex flex-col gap-4">
        {signals.map((s, i) => (
          <li key={i} className="border-l-2 border-[var(--lime-deep)] pl-4">
            <p className="text-[14px] leading-[1.5]">{s.statement}</p>
            {s.sources.length > 0 && (
              <div className="mt-1.5 flex flex-col gap-1">
                {s.sources.map((src, j) => (
                  <a
                    key={j}
                    href={src.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11.5px] leading-[1.4] text-blue hover:underline"
                  >
                    {src.label || src.url} ↗
                  </a>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
