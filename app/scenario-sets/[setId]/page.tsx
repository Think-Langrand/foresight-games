import Link from "next/link";
import { notFound } from "next/navigation";
import {
  describeForesightFailure,
  foresightConfigured,
  getScenarioSet,
} from "@/lib/foresight/client";
import type { ScenarioSet } from "@/lib/foresight/types";
import {
  ForesightNotConfigured,
  ForesightUnavailable,
} from "@/components/foresight/notice";
import { ScenarioCard } from "@/components/foresight/ScenarioCard";

// Cards carry signed, expiring coverImageUrls — always render fresh.
export const dynamic = "force-dynamic";

function SetShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-screen max-w-[1100px] px-6 py-12 md:py-16">
      <Link href="/scenario-sets" className="eyebrow blue">
        ← Scenario sets
      </Link>
      {children}
    </main>
  );
}

export default async function ScenarioSetPage({
  params,
}: {
  params: Promise<{ setId: string }>;
}) {
  const { setId } = await params;

  if (!foresightConfigured()) {
    return (
      <SetShell>
        <ForesightNotConfigured />
      </SetShell>
    );
  }

  let set: ScenarioSet | null;
  try {
    set = await getScenarioSet(setId);
  } catch (err) {
    return (
      <SetShell>
        <ForesightUnavailable detail={describeForesightFailure(err)} />
      </SetShell>
    );
  }
  if (!set) notFound();

  const scenarios = [...set.scenarios].sort((a, b) => a.position - b.position);

  return (
    <main className="mx-auto min-h-screen max-w-[1100px] px-6 py-12 md:py-16">
      <Link href="/scenario-sets" className="eyebrow blue">
        ← Scenario sets
      </Link>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-b border-[var(--rule)] pb-5">
        <div>
          <span className="eyebrow ink">
            {set.format} · {set.horizonYear}
          </span>
          <h1 className="mt-2 text-[34px] font-extrabold uppercase leading-[1.03] tracking-tight md:text-[44px]">
            {set.domain}
          </h1>
        </div>
        <span className="text-[12px] text-muted">
          {scenarios.length} {scenarios.length === 1 ? "scenario" : "scenarios"}
        </span>
      </div>

      {set.sharedUncertainties.length > 0 && (
        <div className="mt-6">
          <span className="eyebrow ink">Shared uncertainties</span>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            {set.sharedUncertainties.map((u, i) => (
              <div
                key={i}
                className="rounded-[3px] border border-[var(--hairline)] bg-card p-3"
              >
                <dt className="text-[14px] font-bold leading-[1.25] text-ink">
                  {u.axis}
                </dt>
                {u.outcomes.length > 0 && (
                  <dd className="serif mt-1.5 text-[14px] italic leading-[1.3] text-muted">
                    {u.outcomes.join("  ·  ")}
                  </dd>
                )}
              </div>
            ))}
          </dl>
        </div>
      )}

      {scenarios.length === 0 ? (
        <p className="mt-12 text-[15px] text-muted">
          This set has no published scenarios.
        </p>
      ) : (
        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {scenarios.map((card, i) => (
            <ScenarioCard
              key={card.id}
              card={card}
              index={i}
              href={`/scenario-sets/${set.id}/${card.id}`}
            />
          ))}
        </div>
      )}
    </main>
  );
}
