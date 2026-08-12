import Link from "next/link";
import { notFound } from "next/navigation";
import {
  describeForesightFailure,
  foresightConfigured,
  getScenario,
  getScenarioSet,
} from "@/lib/foresight/client";
import type { Scenario, ScenarioCard, ScenarioSet } from "@/lib/foresight/types";
import {
  ForesightNotConfigured,
  ForesightUnavailable,
} from "@/components/foresight/notice";
import {
  MoodBadge,
  ThemeBadge,
  TimeHorizonBadge,
} from "@/components/foresight/badges";
import { ScenarioBody } from "@/components/foresight/ScenarioBody";
import { FigureImage } from "@/components/foresight/FigureImage";
import { normalizeSections } from "@/lib/foresight/sections";

// Scenario images are signed and expiring — always render fresh.
export const dynamic = "force-dynamic";

function DetailShell({
  setId,
  children,
}: {
  setId: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto min-h-screen max-w-[1100px] px-6 py-12 md:py-16">
      <Link href={`/scenario-sets/${setId}`} className="eyebrow blue">
        ← Back to set
      </Link>
      {children}
    </main>
  );
}

export default async function ScenarioDetailPage({
  params,
}: {
  params: Promise<{ setId: string; scenarioRef: string }>;
}) {
  const { setId, scenarioRef } = await params;

  if (!foresightConfigured()) {
    return (
      <DetailShell setId={setId}>
        <ForesightNotConfigured />
      </DetailShell>
    );
  }

  // Scenario is resolved by ref alone; the set gives the back link + prev/next.
  let scenario: Scenario | null;
  let set: ScenarioSet | null;
  try {
    [scenario, set] = await Promise.all([
      getScenario(scenarioRef),
      getScenarioSet(setId),
    ]);
  } catch (err) {
    return (
      <DetailShell setId={setId}>
        <ForesightUnavailable detail={describeForesightFailure(err)} />
      </DetailShell>
    );
  }
  if (!scenario) notFound();

  // Prev/next within the set, in reading order.
  const ordered: ScenarioCard[] = set
    ? [...set.scenarios].sort((a, b) => a.position - b.position)
    : [];
  const idx = ordered.findIndex((s) => s.id === scenario.id);
  const prev = idx > 0 ? ordered[idx - 1] : null;
  const next = idx >= 0 && idx < ordered.length - 1 ? ordered[idx + 1] : null;

  const horizon = scenario.timeHorizon.label ?? String(scenario.timeHorizon.year);
  const images = scenario.images.filter((im) => im.url);

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
      <Link href={`/scenario-sets/${setId}`} className="eyebrow blue">
        ← {set?.domain ?? "Back to set"}
      </Link>

      <header className="mt-4 border-b border-[var(--rule)] pb-6">
        <span className="eyebrow ink">
          {scenario.theme.label} · {horizon}
        </span>
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
        <FigureImage image={images[0]} alt={scenario.title} ratio="aspect-[4/3]" />
        {scenario.teaser && (
          <div className={images[0] ? undefined : "lg:col-span-2"}>
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
      {(scenario.openQuestion || images[2]) && (
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
            image={images[2]}
            alt={`${scenario.title} — image 3`}
            ratio="aspect-[4/3]"
          />
        </section>
      )}

      {/* Lived moment — second image on the left, prose on the right. */}
      {(livedMoment || images[1]) && (
        <section className="mt-14 grid items-start gap-8 border-t border-[var(--rule)] pt-10 lg:grid-cols-2 lg:gap-12">
          <div className="lg:sticky lg:top-8">
            <FigureImage
              image={images[1]}
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
              href={`/scenario-sets/${setId}/${prev.id}`}
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
              href={`/scenario-sets/${setId}/${next.id}`}
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
