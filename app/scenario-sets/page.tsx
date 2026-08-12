import Link from "next/link";
import {
  describeForesightFailure,
  foresightConfigured,
  getScenarioSets,
} from "@/lib/foresight/client";
import type { ScenarioSetSummary } from "@/lib/foresight/types";
import {
  ForesightNotConfigured,
  ForesightUnavailable,
} from "@/components/foresight/notice";

// Always fresh, so a set just published on the platform appears immediately.
export const dynamic = "force-dynamic";

export default async function ScenarioSetsPage() {
  return (
    <main className="mx-auto min-h-screen max-w-[1100px] px-6 py-12 md:py-16">
      <Link href="/" className="eyebrow blue">
        ← Home
      </Link>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-b border-[var(--rule)] pb-5">
        <div>
          <span className="eyebrow ink">From the foresight platform</span>
          <h1 className="mt-2 text-[34px] font-extrabold uppercase leading-[1.03] tracking-tight md:text-[44px]">
            Scenario sets
          </h1>
        </div>
      </div>
      <p className="serif mt-4 max-w-[720px] text-[19px] leading-[1.35] text-ink">
        Published foresight scenarios pulled from the platform — divergent
        future-worlds grouped into sets, each exploring a shared set of
        uncertainties.
      </p>

      {!foresightConfigured() ? (
        <ForesightNotConfigured />
      ) : (
        <SetsGrid />
      )}
    </main>
  );
}

async function SetsGrid() {
  let sets: ScenarioSetSummary[];
  try {
    sets = await getScenarioSets();
  } catch (err) {
    return <ForesightUnavailable detail={describeForesightFailure(err)} />;
  }

  if (sets.length === 0) {
    return (
      <p className="mt-12 text-[15px] text-muted">
        No published scenario sets yet.
      </p>
    );
  }

  return (
    <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {sets.map((set) => (
        <Link
          key={set.id}
          href={`/scenario-sets/${set.id}`}
          className="group flex flex-col rounded-[3px] border border-[var(--hairline)] bg-card p-5 transition-colors hover:border-ink hover:shadow-[0_2px_0_var(--ink)]"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="eyebrow ink">{set.format}</span>
            <span className="text-[11px] font-semibold text-muted">
              {set.horizonYear}
            </span>
          </div>
          <h2 className="mt-3 text-[22px] font-extrabold uppercase leading-[1.05] tracking-tight text-ink group-hover:underline">
            {set.domain}
          </h2>

          {set.sharedUncertainties.length > 0 && (
            <ul className="mt-4 flex flex-col gap-1.5">
              {set.sharedUncertainties.slice(0, 3).map((u, i) => (
                <li
                  key={i}
                  className="serif line-clamp-1 text-[15px] italic leading-[1.3] text-muted"
                >
                  {u.axis}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-auto flex items-center justify-between border-t border-[var(--hairline)] pt-3">
            <span className="text-[12px] font-semibold text-muted">
              {set.scenarioCount} {set.scenarioCount === 1 ? "scenario" : "scenarios"}
            </span>
            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink group-hover:underline">
              Open →
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}
