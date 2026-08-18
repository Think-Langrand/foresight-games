// Shared, self-contained render of a single scenario's editorial content —
// header (theme/mood/horizon + title + headline), overview (hero + teaser),
// rules, open question, and lived moment. Extracted from ScenarioDetailView so
// the exact same viewer is reused by the scenario-sets pages AND the Ripples game
// (where the scenario is the backdrop and the implications work slides out over it).
//
// A "shared" component (no "use client"): it renders on the server for the
// scenario-sets pages and in the client bundle for the Ripples play surface. All
// of its dependencies are client-safe (badges are plain, ScenarioBody is a pure
// react-markdown component, FigureImage is a client component, sections is pure).

import type { Scenario } from "@/lib/foresight/types";
import { MoodBadge, ThemeBadge, TimeHorizonBadge } from "@/components/foresight/badges";
import { ScenarioBody } from "@/components/foresight/ScenarioBody";
import { FigureImage } from "@/components/foresight/FigureImage";
import { normalizeSections } from "@/lib/foresight/sections";

export function ScenarioReader({ scenario }: { scenario: Scenario }) {
  const horizon = scenario.timeHorizon.label ?? String(scenario.timeHorizon.year);
  // Drop a blank theme label so the eyebrow doesn't render a dangling "· 2035".
  const themeLabel = scenario.theme.label?.trim();
  const eyebrow = themeLabel ? `${themeLabel} · ${horizon}` : horizon;

  // Order the signed images by `position` (not 0-indexed — real data uses 2,3,4),
  // then fill the layout slots in that order. Each slot is undefined if there's no
  // image; FigureImage collapses cleanly.
  const orderedImages = scenario.images
    .filter((im) => im.url)
    .sort((a, b) => a.position - b.position);
  const heroImage = orderedImages[0];
  const livedImage = orderedImages[1];
  const questionImage = orderedImages[2];

  const sections = (scenario.sections ?? {}) as Record<string, unknown>;
  const asProse = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
  const livedMoment = asProse(sections.lived_moment);
  const ruleSection = Array.isArray(sections.rules)
    ? normalizeSections({ rules: sections.rules })[0]
    : null;
  const ruleItems = ruleSection && ruleSection.kind === "list" ? ruleSection.items : [];

  return (
    <div>
      <header className="border-b border-[var(--rule)] pb-6">
        <span className="eyebrow ink">{eyebrow}</span>
        <h1 className="mt-2 max-w-[900px] text-[30px] font-extrabold uppercase leading-[1.02] tracking-tight md:text-[44px]">
          {scenario.title}
        </h1>
        {scenario.headline && (
          <p className="serif mt-3 max-w-[760px] text-[20px] italic leading-[1.3] text-ink md:text-[24px]">
            {scenario.headline}
          </p>
        )}
        <div className="mt-5 flex flex-wrap gap-2">
          <ThemeBadge theme={scenario.theme} />
          <MoodBadge mood={scenario.mood} />
          <TimeHorizonBadge timeHorizon={scenario.timeHorizon} />
        </div>
      </header>

      {/* Overview — hero image left, standfirst (teaser) right. Skip entirely when
          the scenario has neither, so a sparse scenario leaves no empty gap. */}
      {(heroImage || scenario.teaser) && (
        <section className="mt-8 grid items-start gap-8 lg:grid-cols-2 lg:gap-12">
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
      )}

      {/* Rules — two columns, full width. Collapses to one column on mobile. */}
      {ruleItems.length > 0 && (
        <section className="mt-12 border-t border-[var(--rule)] pt-8">
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
        <section className="mt-12 grid items-center gap-8 border-t border-[var(--rule)] pt-8 lg:grid-cols-2 lg:gap-12">
          {scenario.openQuestion ? (
            <div>
              <span className="eyebrow ink">Open question</span>
              <blockquote className="serif mt-3 border-l-2 border-ink pl-5 text-[20px] italic leading-[1.35] text-ink md:text-[24px]">
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
        <section className="mt-12 grid items-start gap-8 border-t border-[var(--rule)] pt-8 lg:grid-cols-2 lg:gap-12">
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
    </div>
  );
}
