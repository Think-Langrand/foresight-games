import "server-only";

import Link from "next/link";
import { notFound } from "next/navigation";
import {
  describeForesightFailure,
  foresightConfigured,
  getScenario,
  getScenarioSet,
  getScenarioSets,
} from "@/lib/foresight/client";
import type {
  Scenario,
  ScenarioCard as ScenarioCardData,
  ScenarioSet,
  ScenarioSetSummary,
} from "@/lib/foresight/types";
import {
  ForesightNotConfigured,
  ForesightUnavailable,
} from "@/components/foresight/notice";
import { ScenarioCard } from "@/components/foresight/ScenarioCard";
import {
  MoodBadge,
  ThemeBadge,
  TimeHorizonBadge,
} from "@/components/foresight/badges";
import { ScenarioBody } from "@/components/foresight/ScenarioBody";
import { FigureImage } from "@/components/foresight/FigureImage";
import { normalizeSections } from "@/lib/foresight/sections";

// Shared render for the three scenario-sets views, parametrized so both the
// legacy global routes (/scenario-sets/**) and the per-project routes
// (/project/<slug>/scenario-sets/**) reuse one implementation. The only tenant
// difference is which Foresight `projectRef` resolves the data and which
// `basePath` every internal link is built from.
//
// `projectRef` is undefined for the legacy routes so it falls through to
// DEFAULT_PROJECT_REF in lib/foresight/client.ts — legacy behavior is unchanged.
// (Prop is named `projectRef`, not `ref`, because React reserves `ref`.)

interface ViewCtx {
  projectRef?: string;
  basePath: string; // "/scenario-sets" | "/project/<slug>/scenario-sets"
  homeHref?: string; // "/" | "/project/<slug>"
}

// --- (1) index grid --------------------------------------------------------

export async function ScenarioSetsIndex({
  projectRef,
  basePath,
  homeHref = "/",
}: ViewCtx) {
  return (
    <main className="mx-auto min-h-screen max-w-[1100px] px-6 py-12 md:py-16">
      <Link href={homeHref} className="eyebrow blue">
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
        <SetsGrid projectRef={projectRef} basePath={basePath} />
      )}
    </main>
  );
}

async function SetsGrid({
  projectRef,
  basePath,
}: {
  projectRef?: string;
  basePath: string;
}) {
  let sets: ScenarioSetSummary[];
  try {
    sets = await getScenarioSets(projectRef);
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
          href={`${basePath}/${set.id}`}
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

// --- (2) one set + its scenario grid ---------------------------------------

export async function ScenarioSetDetail({
  setId,
  projectRef,
  basePath,
}: ViewCtx & { setId: string }) {
  const shell = (children: React.ReactNode) => (
    <main className="mx-auto min-h-screen max-w-[1100px] px-6 py-12 md:py-16">
      <Link href={basePath} className="eyebrow blue">
        ← Scenario sets
      </Link>
      {children}
    </main>
  );

  if (!foresightConfigured()) return shell(<ForesightNotConfigured />);

  let set: ScenarioSet | null;
  try {
    set = await getScenarioSet(setId, projectRef);
  } catch (err) {
    return shell(<ForesightUnavailable detail={describeForesightFailure(err)} />);
  }
  if (!set) notFound();

  const scenarios = [...set.scenarios].sort((a, b) => a.position - b.position);

  return (
    <main className="mx-auto min-h-screen max-w-[1100px] px-6 py-12 md:py-16">
      <Link href={basePath} className="eyebrow blue">
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
              href={`${basePath}/${set.id}/${card.id}`}
            />
          ))}
        </div>
      )}
    </main>
  );
}

// --- (3) full scenario detail ----------------------------------------------

export async function ScenarioDetailView({
  setId,
  scenarioRef,
  projectRef,
  basePath,
}: ViewCtx & { setId: string; scenarioRef: string }) {
  const shell = (children: React.ReactNode) => (
    <main className="mx-auto min-h-screen max-w-[1100px] px-6 py-12 md:py-16">
      <Link href={`${basePath}/${setId}`} className="eyebrow blue">
        ← Back to set
      </Link>
      {children}
    </main>
  );

  if (!foresightConfigured()) return shell(<ForesightNotConfigured />);

  // Scenario is resolved by ref alone; the set gives the back link + prev/next.
  let scenario: Scenario | null;
  let set: ScenarioSet | null;
  try {
    [scenario, set] = await Promise.all([
      getScenario(scenarioRef, projectRef),
      getScenarioSet(setId, projectRef),
    ]);
  } catch (err) {
    return shell(<ForesightUnavailable detail={describeForesightFailure(err)} />);
  }
  if (!scenario) notFound();

  // Prev/next within the set, in reading order.
  const ordered: ScenarioCardData[] = set
    ? [...set.scenarios].sort((a, b) => a.position - b.position)
    : [];
  const idx = ordered.findIndex((s) => s.id === scenario.id);
  const prev = idx > 0 ? ordered[idx - 1] : null;
  const next = idx >= 0 && idx < ordered.length - 1 ? ordered[idx + 1] : null;

  const horizon = scenario.timeHorizon.label ?? String(scenario.timeHorizon.year);
  // Drop a blank theme label so the eyebrow doesn't render a dangling "· 2035".
  const themeLabel = scenario.theme.label?.trim();
  const eyebrow = themeLabel ? `${themeLabel} · ${horizon}` : horizon;
  // Order the signed images by `position` (which is not 0-indexed — real data
  // uses values like 2,3,4), then fill the layout slots in that order. Sorting
  // rather than indexing the raw array keeps the order deterministic; each slot
  // is undefined if there's no image for it, and FigureImage collapses cleanly.
  const orderedImages = scenario.images
    .filter((im) => im.url)
    .sort((a, b) => a.position - b.position);
  const heroImage = orderedImages[0];
  const livedImage = orderedImages[1];
  const questionImage = orderedImages[2];

  // Pull just the sections this layout surfaces; everything else is omitted.
  const sections = (scenario.sections ?? {}) as Record<string, unknown>;
  const asProse = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
  const livedMoment = asProse(sections.lived_moment);
  const ruleSection = Array.isArray(sections.rules)
    ? normalizeSections({ rules: sections.rules })[0]
    : null;
  const ruleItems =
    ruleSection && ruleSection.kind === "list" ? ruleSection.items : [];

  return (
    <main className="mx-auto min-h-screen max-w-[1100px] px-6 py-12 md:py-16">
      <Link href={`${basePath}/${setId}`} className="eyebrow blue">
        ← {set?.domain ?? "Back to set"}
      </Link>

      <header className="mt-4 border-b border-[var(--rule)] pb-6">
        <span className="eyebrow ink">{eyebrow}</span>
        <h1 className="mt-2 max-w-[900px] text-[34px] font-extrabold uppercase leading-[1.02] tracking-tight md:text-[52px]">
          {scenario.title}
        </h1>
        {scenario.headline && (
          <p className="serif mt-3 max-w-[760px] text-[22px] italic leading-[1.3] text-ink md:text-[26px]">
            {scenario.headline}
          </p>
        )}
        <div className="mt-5 flex flex-wrap gap-2">
          <ThemeBadge theme={scenario.theme} />
          <MoodBadge mood={scenario.mood} />
          <TimeHorizonBadge timeHorizon={scenario.timeHorizon} />
        </div>
      </header>

      {/* Overview — hero image left, standfirst (teaser) right. */}
      <section className="mt-10 grid items-start gap-8 lg:grid-cols-2 lg:gap-12">
        <FigureImage image={heroImage} alt={scenario.title} ratio="aspect-[4/3]" />
        {scenario.teaser && (
          <div className={heroImage ? undefined : "lg:col-span-2"}>
            <span className="eyebrow ink">Overview</span>
            <p className="mt-3 max-w-[560px] text-[17px] leading-[1.65] text-ink">
              {scenario.teaser}
            </p>
          </div>
        )}
      </section>

      {/* Rules — two columns, full width. Collapses to one column on mobile. */}
      {ruleItems.length > 0 && (
        <section className="mt-14 border-t border-[var(--rule)] pt-10">
          <span className="eyebrow ink">Rules</span>
          <div className="mt-5 gap-x-12 sm:columns-2">
            {ruleItems.map((r) => (
              <div key={r.id} className="mb-7 break-inside-avoid">
                <h3 className="text-[17px] font-extrabold uppercase leading-[1.12] tracking-tight text-ink">
                  {r.title}
                </h3>
                {r.body && (
                  <p className="mt-1.5 whitespace-pre-wrap text-[14px] leading-[1.6] text-muted">
                    {r.body}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Open question — question left, third image right. */}
      {(scenario.openQuestion || questionImage) && (
        <section className="mt-14 grid items-center gap-8 border-t border-[var(--rule)] pt-10 lg:grid-cols-2 lg:gap-12">
          {scenario.openQuestion ? (
            <div>
              <span className="eyebrow ink">Open question</span>
              <blockquote className="serif mt-3 border-l-2 border-ink pl-5 text-[22px] italic leading-[1.35] text-ink md:text-[26px]">
                {scenario.openQuestion}
              </blockquote>
            </div>
          ) : (
            <div />
          )}
          <FigureImage
            image={questionImage}
            alt={`${scenario.title} — image 3`}
            ratio="aspect-[4/3]"
          />
        </section>
      )}

      {/* Lived moment — second image on the left, prose on the right. */}
      {(livedMoment || livedImage) && (
        <section className="mt-14 grid items-start gap-8 border-t border-[var(--rule)] pt-10 lg:grid-cols-2 lg:gap-12">
          <div className="lg:sticky lg:top-8">
            <FigureImage
              image={livedImage}
              alt={`${scenario.title} — image 2`}
              ratio="aspect-[4/5]"
            />
          </div>
          {livedMoment ? (
            <div>
              <span className="eyebrow ink">Lived moment</span>
              <div className="mt-3">
                <ScenarioBody body={livedMoment} />
              </div>
            </div>
          ) : (
            <div />
          )}
        </section>
      )}

      {/* Prev/next within the set. */}
      {(prev || next) && (
        <nav className="mt-12 flex items-stretch justify-between gap-4 border-t border-[var(--rule)] pt-6">
          {prev ? (
            <Link
              href={`${basePath}/${setId}/${prev.id}`}
              className="group flex max-w-[48%] flex-col rounded-[3px] border border-[var(--hairline)] bg-card p-3 hover:border-ink"
            >
              <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
                ← Previous
              </span>
              <span className="mt-1 line-clamp-1 text-[14px] font-bold text-ink group-hover:underline">
                {prev.title}
              </span>
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link
              href={`${basePath}/${setId}/${next.id}`}
              className="group flex max-w-[48%] flex-col items-end rounded-[3px] border border-[var(--hairline)] bg-card p-3 text-right hover:border-ink"
            >
              <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
                Next →
              </span>
              <span className="mt-1 line-clamp-1 text-[14px] font-bold text-ink group-hover:underline">
                {next.title}
              </span>
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </main>
  );
}
