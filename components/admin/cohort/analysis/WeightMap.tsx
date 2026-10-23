"use client";

import { POLARITY_COLOR } from "@/lib/analysis/cohort-palette";
import { axisSpan, axisTicks } from "@/lib/analysis/cohort-scatter-shape";
import type { CohortAnalysis } from "@/lib/analysis/cohort-analysis";
import { Figure, Swatch, Tooltip, useTip } from "./chrome";

// VIEW 3 — where the cohort put its weight.
//
// Themes plotted on the plausibility and impact the groups actually assigned in Session 2,
// dot size = how many rooms raised the theme, fill = its risk/opportunity balance. The
// top-right is "likely and consequential, and more than one room got there".
//
// Two honesty problems this view has to solve, because neither is visible once it is drawn:
//
// 1. The axes are ZOOMED TO THE DATA, not to the 1-5 scale the groups scored on. A theme's
//    position is the mean of several key changes, and means regress to the centre: on real
//    data the spread was plausibility 3.85-4.90 and impact 4.52-5.00, which on a full 1-5
//    grid is eight dots in one corner. The axis labels say the real range so the zoom
//    cannot be mistaken for the cohort having scored everything a 4.
//
// 2. A theme NOBODY scored is not at the origin. It is listed underneath, unplotted.
//    Drawing it at (0,0) would read as "the cohort thought this implausible and harmless",
//    which is the opposite of "nobody scored it".

const W = 640;
const H = 340;
const PAD = { t: 22, r: 212, b: 46, l: 54 };

export function WeightMap({ analysis }: { analysis: CohortAnalysis }) {
  const { run, weights } = analysis;
  const { tip, show, hide } = useTip();

  const total = run.groups.filter((g) => g.state === "ok").length;
  const itemById = new Map(run.items.map((i) => [i.id, i]));

  const plotted = run.themes
    .map((t, i) => ({ t, w: weights[i], i }))
    .filter((d) => d.w.plausibility !== null && d.w.impact !== null);
  const unplotted = run.themes
    .map((t, i) => ({ t, w: weights[i], i }))
    .filter((d) => d.w.plausibility === null || d.w.impact === null);

  if (plotted.length === 0) {
    return (
      <Figure
        title="Where the cohort put its weight"
        lede="Nothing on this board carries a plausibility or impact score."
      >
        <p className="max-w-[560px] text-[12px] leading-[1.5] text-muted">
          These scores are assigned in Session 2, on each key change, and a theme inherits
          them through the implications behind it. No theme in this run reached one, so there
          is nothing to position. The other three views do not depend on them.
        </p>
      </Figure>
    );
  }

  // Zoomed to the data, padded OUTSIDE the nominal 1-5 scale. See lib/analysis/
  // cohort-scatter-shape.ts for why clamping the padding back into the scale is what put a
  // theme scoring exactly 5.0 half outside the plot.
  const xs = axisSpan(plotted.map((d) => d.w.plausibility as number));
  const ys = axisSpan(plotted.map((d) => d.w.impact as number));

  const px = (v: number) => PAD.l + ((v - xs.lo) / (xs.hi - xs.lo || 1)) * (W - PAD.l - PAD.r);
  const py = (v: number) => H - PAD.b - ((v - ys.lo) / (ys.hi - ys.lo || 1)) * (H - PAD.t - PAD.b);
  const r = (groupCount: number) => 7 + (total > 1 ? ((groupCount - 1) / (total - 1)) * 11 : 5);

  const hasPolarity = run.items.some((i) => i.polarity);

  const mix = (ids: string[]) => {
    let risk = 0;
    let opp = 0;
    for (const id of ids) {
      const p = itemById.get(id)?.polarity;
      if (p === "risk" || p === "fear") risk += 1;
      if (p === "opportunity" || p === "hope") opp += 1;
    }
    return { risk, opp, any: risk + opp > 0 };
  };

  // Thin means few distinct SCORED THINGS behind the dot, not few members. A theme with
  // twenty members off two key changes is positioned by two numbers, however many sentences
  // point at them.
  const thin = plotted.filter((d) => d.w.roots > 0 && d.w.roots < 3).length;

  return (
    <Figure
      title="Where the cohort put its weight"
      lede={`Each theme at the mean plausibility and impact the rooms gave the key changes behind it. Bigger dot = more rooms raised it. ${analysis.scoredItems} of ${run.items.length} pooled items carried a score.`}
      legend={
        <>
          {hasPolarity ? (
            <>
              <Swatch color={POLARITY_COLOR.risk} label="mostly risk" />
              <Swatch color={POLARITY_COLOR.opportunity} label="mostly opportunity" />
            </>
          ) : (
            <Swatch color="#6b6b5e" label="a theme" />
          )}
          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted">
            <span aria-hidden className="inline-block h-[7px] w-[7px] rounded-full bg-[var(--muted)]" />
            <span aria-hidden className="inline-block h-[15px] w-[15px] rounded-full bg-[var(--muted)]" />
            1 room → all {total}
          </span>
        </>
      }
      footnote={
        `AXES ARE ZOOMED to the observed range (plausibility ${xs.lo.toFixed(1)}–${xs.hi.toFixed(1)}, ` +
        `impact ${ys.lo.toFixed(1)}–${ys.hi.toFixed(1)} of a 1–5 scale), not to the full scale. ` +
        `A theme's score is the mean of several key changes, so the real spread is narrow and a ` +
        `full-scale grid would put every dot in one corner. Read the positions as relative, not absolute.` +
        (thin > 0
          ? ` ${thin} theme${thin === 1 ? " is" : "s are"} positioned from fewer than three distinct scored key changes — hover for the count.`
          : "")
      }
    >
      <Tooltip tip={tip} />
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="min-w-[640px] w-full max-w-[900px]" role="img"
          aria-label="Themes positioned by mean plausibility and impact. The table view below carries the same numbers.">
          {/* Recessive grid. */}
          {axisTicks(xs).map((v) => (
            <g key={`x${v}`}>
              <line x1={px(v)} y1={PAD.t} x2={px(v)} y2={H - PAD.b} stroke="var(--rule)" strokeOpacity={0.1} />
              <text x={px(v)} y={H - PAD.b + 16} textAnchor="middle" className="fill-[var(--muted)] text-[10px] tabular-nums">
                {v}
              </text>
            </g>
          ))}
          {axisTicks(ys).map((v) => (
            <g key={`y${v}`}>
              <line x1={PAD.l} y1={py(v)} x2={W - PAD.r} y2={py(v)} stroke="var(--rule)" strokeOpacity={0.1} />
              <text x={PAD.l - 8} y={py(v)} textAnchor="end" dominantBaseline="middle" className="fill-[var(--muted)] text-[10px] tabular-nums">
                {v}
              </text>
            </g>
          ))}
          <line x1={PAD.l} y1={H - PAD.b} x2={W - PAD.r} y2={H - PAD.b} stroke="var(--rule)" strokeOpacity={0.35} />
          <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={H - PAD.b} stroke="var(--rule)" strokeOpacity={0.35} />
          <text x={(PAD.l + W - PAD.r) / 2} y={H - 6} textAnchor="middle" className="fill-[var(--muted)] text-[10px] font-bold uppercase tracking-[0.08em]">
            Plausibility →
          </text>
          <text x={14} y={(PAD.t + H - PAD.b) / 2} textAnchor="middle" transform={`rotate(-90 14 ${(PAD.t + H - PAD.b) / 2})`} className="fill-[var(--muted)] text-[10px] font-bold uppercase tracking-[0.08em]">
            Impact →
          </text>

          {(() => {
            // Biggest first, so a small dot is never hidden under a large one.
            const draw = [...plotted].sort((a, b) => b.t.groupCount - a.t.groupCount);

            // WHICH dots get a direct label. The rule was "every theme all the rooms
            // raised", which on a cohort that converged completely meant all eight, and
            // eight labels in a narrow band overlap into mush. Cap it at the biggest
            // few, and push each label off the one above it so none collide. Everything
            // else is one hover or the table view away.
            // Labels live in a GUTTER to the right of the plot, not beside their dots.
            // Beside the dot, a label runs left-to-right straight across its neighbours --
            // which is what it did, and no amount of vertical nudging fixes a horizontal
            // overlap. In the gutter every label starts at the same x, so de-colliding is
            // one pass down the column and a leader line keeps each tied to its dot.
            const LABEL_MAX = 6;
            const MIN_GAP = 14;
            const GUTTER_X = W - PAD.r + 12;
            const labelled = [...draw]
              .sort((a, b) => b.t.memberIds.length - a.t.memberIds.length)
              .slice(0, LABEL_MAX)
              .map((d) => ({
                i: d.i,
                text: d.t.label,
                cx: px(d.w.plausibility as number) + r(d.t.groupCount),
                cy: py(d.w.impact as number),
                ly: py(d.w.impact as number),
              }))
              .sort((a, b) => a.ly - b.ly);
            for (let k = 1; k < labelled.length; k++) {
              const gap = labelled[k].ly - labelled[k - 1].ly;
              if (gap < MIN_GAP) labelled[k].ly = labelled[k - 1].ly + MIN_GAP;
            }
            // If the stack ran off the bottom, slide the whole column back up.
            const overflow = (labelled[labelled.length - 1]?.ly ?? 0) - (H - PAD.b);
            if (overflow > 0) for (const l of labelled) l.ly -= overflow;
            const labelFor = new Map(labelled.map((l) => [l.i, { ...l, x: GUTTER_X }]));

            return draw.map((d) => {
              const m = mix(d.t.memberIds);
              const fill = !m.any
                ? "var(--muted)"
                : m.risk >= m.opp
                  ? POLARITY_COLOR.risk
                  : POLARITY_COLOR.opportunity;
              return (
                <g key={d.i}>
                  <circle
                    cx={px(d.w.plausibility as number)}
                    cy={py(d.w.impact as number)}
                    r={r(d.t.groupCount)}
                    fill={fill}
                    fillOpacity={0.72}
                    // A surface ring, so two overlapping dots stay two dots.
                    stroke="var(--paper)"
                    strokeWidth={2}
                    onMouseEnter={(e) =>
                      show(
                        e,
                        <>
                          <strong>{d.t.label}</strong>
                          <br />
                          {d.t.groupCount} of {total} rooms · {d.t.memberIds.length} items
                          <br />
                          plausibility {d.w.plausibility} · impact {d.w.impact}
                          <br />
                          <span className="text-[10px]">
                            from {d.w.roots} scored {run.source === "implications" ? "key change" : "theme"}
                            {d.w.roots === 1 ? "" : "s"} ({d.w.n} member{d.w.n === 1 ? "" : "s"}
                            {d.w.missing > 0 ? `, ${d.w.missing} unscored` : ""})
                          </span>
                          {m.any ? (
                            <>
                              <br />
                              <span className="text-[10px]">{m.risk} risk · {m.opp} opportunity</span>
                            </>
                          ) : null}
                        </>
                      )
                    }
                    onMouseLeave={hide}
                    style={{ cursor: "pointer" }}
                  />
                  {(() => {
                    const l = labelFor.get(d.i);
                    if (!l) return null;
                    return (
                      <>
                        <polyline
                          points={`${l.cx + 2},${l.cy} ${l.x - 7},${l.ly} ${l.x - 3},${l.ly}`}
                          fill="none"
                          stroke="var(--muted)"
                          strokeOpacity={0.45}
                        />
                        <text x={l.x} y={l.ly} dominantBaseline="middle" className="fill-ink text-[9.5px] font-semibold">
                          {l.text.length > 34 ? `${l.text.slice(0, 33)}…` : l.text}
                        </text>
                      </>
                    );
                  })()}
                </g>
              );
            });
          })()}
        </svg>
      </div>

      {unplotted.length > 0 ? (
        <div className="mt-3 border-t border-[var(--rule)]/20 pt-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted">
            Not plotted — no scored key change behind them
          </p>
          <ul className="mt-1 space-y-0.5">
            {unplotted.map((d) => (
              <li key={d.i} className="text-[11.5px] text-ink">
                {d.t.label}{" "}
                <span className="text-muted">
                  ({d.t.groupCount}/{total} rooms, {d.w.missing} unscored member
                  {d.w.missing === 1 ? "" : "s"})
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Figure>
  );
}
