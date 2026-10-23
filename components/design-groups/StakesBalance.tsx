// Risks and opportunities, together: what each theme puts at stake, and which way it leans.
//
// ONE SHARED SCALE, SYMMETRIC. Risks run left from the centre, opportunities right, both
// against the same per-count width, so the bars are comparable across themes and the lean of
// a theme is the asymmetry. A per-row scale would make a 2-vs-3 theme look like a 5-vs-5 one.
//
// COLOUR IS POLARITY, NOT DECORATION. lib/analysis/cohort-palette's warm/cool pair, which
// validated at 13.7 ΔE under deuteranopia — the app's own --coral and --lime are decorative
// accents that fail contrast as data marks, which is why that module exists. Every bar also
// carries its count, so the reading never depends on colour alone.
//
// ORDERED BY HOW MUCH IS AT STAKE, most first, via lib/group-summary.themesByStakes — the
// same comparator the themes slide uses, so the two cannot disagree. The LETTER comes from
// board order and travels with the theme, so position carries the finding and the letter
// carries the identity.

import { themesByStakes, type SummaryTheme } from "@/lib/group-summary";
import { POLARITY_COLOR } from "@/lib/analysis/cohort-palette";

export default function StakesBalance({ themes }: { themes: SummaryTheme[] }) {
  // themesByStakes orders every theme; this slide shows only the ones with stakes to show.
  const worked = themesByStakes(themes)
    .map(({ theme, letter }) => ({ t: theme, letter }))
    .filter(({ t }) => t.risks.length > 0 || t.opportunities.length > 0);
  if (!worked.length) return null;

  const risks = worked.reduce((n, { t }) => n + t.risks.length, 0);
  const opps = worked.reduce((n, { t }) => n + t.opportunities.length, 0);
  // The widest half-bar any theme needs, so both sides share one scale.
  const peak = Math.max(1, ...worked.flatMap(({ t }) => [t.risks.length, t.opportunities.length]));

  return (
    <div>
      {/* Legend: two series, so one is always present, and both are direct-labelled below. */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-[var(--hairline)] pb-3">
        {(
          [
            ["Risks", POLARITY_COLOR.risk, risks],
            ["Opportunities", POLARITY_COLOR.opportunity, opps],
          ] as const
        ).map(([label, color, n]) => (
          <span key={label} className="flex items-center gap-2">
            <span
              className="inline-block h-3 w-3 rounded-[2px]"
              style={{ background: color }}
              aria-hidden="true"
            />
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
              {label} <b className="font-semibold tabular-nums text-ink">{n}</b>
            </span>
          </span>
        ))}
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
          Across {worked.length} of {themes.length} {themes.length === 1 ? "theme" : "themes"}
        </span>
      </div>

      {/* The chart. A CSS grid rather than SVG: the marks are plain rectangles on one scale
          and the labels are real text, so there is nothing an SVG would buy. */}
      <ul className="m-0 mt-4 list-none p-0">
        {worked.map(({ t, letter }) => {
          const r = t.risks.length;
          const o = t.opportunities.length;
          return (
            <li key={t.id} className="border-b border-[var(--hairline)] py-3 last:border-b-0">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3">
                {/* The whole theme name, wrapped. Group 3's longest runs 208 characters, so
                    this is three or four lines — the names ARE the group's own wording and a
                    clipped one makes a reader guess. No title attribute either: a tooltip
                    that repeats fully visible text is noise. */}
                <p className="m-0 max-w-[76ch] text-[14px] leading-[1.4]">
                  <span className="mr-2 font-mono text-[10px] font-bold text-blue">{letter}</span>
                  {t.text}
                </p>
                <p className="m-0 shrink-0 font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                  {r} risk{r === 1 ? "" : "s"} · {o} opp{o === 1 ? "" : "s"}
                </p>
              </div>

              <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-1">
                {/* risks, growing leftwards from the centre line */}
                <div className="flex justify-end">
                  <span
                    title={`${r} ${r === 1 ? "risk" : "risks"}`}
                    className="flex h-5 items-center justify-end rounded-l-[2px] pr-1.5 text-[10px] font-bold tabular-nums"
                    style={{
                      width: `${(r / peak) * 100}%`,
                      background: r > 0 ? POLARITY_COLOR.risk : "transparent",
                      color: "var(--paper)",
                    }}
                  >
                    {r > 0 ? r : ""}
                  </span>
                </div>
                <span className="h-5 w-px bg-ink" aria-hidden="true" />
                <div className="flex justify-start">
                  <span
                    title={`${o} ${o === 1 ? "opportunity" : "opportunities"}`}
                    className="flex h-5 items-center justify-start rounded-r-[2px] pl-1.5 text-[10px] font-bold tabular-nums"
                    style={{
                      width: `${(o / peak) * 100}%`,
                      background: o > 0 ? POLARITY_COLOR.opportunity : "transparent",
                      color: "var(--paper)",
                    }}
                  >
                    {o > 0 ? o : ""}
                  </span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {/* The cards themselves, so the slide carries the group's words and not only a shape. */}
      <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-2">
        {(
          [
            ["Risks", POLARITY_COLOR.risk, worked.flatMap(({ t, letter }) => t.risks.map((r) => ({ r, letter })))],
            [
              "Opportunities",
              POLARITY_COLOR.opportunity,
              worked.flatMap(({ t, letter }) => t.opportunities.map((r) => ({ r, letter }))),
            ],
          ] as const
        ).map(([label, color, rows]) => (
          <div key={label}>
            <p className="m-0 flex items-center gap-2 border-b border-ink pb-2">
              <span
                className="inline-block h-3 w-3 rounded-[2px]"
                style={{ background: color }}
                aria-hidden="true"
              />
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em]">
                {label} <span className="tabular-nums text-muted">{rows.length}</span>
              </span>
            </p>
            <ul className="m-0 list-none p-0">
              {rows.map(({ r, letter }) => (
                <li
                  key={r.id}
                  className="flex gap-3 border-b border-[var(--hairline)] py-[9px] last:border-b-0"
                >
                  <span className="shrink-0 pt-[2px] font-mono text-[10px] font-bold text-blue">
                    {letter}
                  </span>
                  <span className="min-w-0">
                    <span className="block max-w-[52ch] text-[14px] leading-[1.45]">{r.text}</span>
                    {r.mechanism && (
                      <span className="mt-[2px] block text-[13px] italic text-muted">
                        {r.mechanism}
                      </span>
                    )}
                  </span>
                  {r.shortlisted && (
                    <span className="ml-auto shrink-0 text-[12px] text-amber" title="Shortlisted">
                      ★
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
