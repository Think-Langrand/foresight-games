"use client";

import { useState } from "react";
import { OTHER_GROUP_COLOR } from "@/lib/analysis/cohort-palette";
import { flowLayout, type FlowLink } from "@/lib/analysis/cohort-flow-shape";
import { poolSourceLabel } from "@/lib/analysis/cohort-pool-shape";
import type { CohortAnalysis } from "@/lib/analysis/cohort-analysis";
import { Figure, GroupLegend, Tooltip, shortName, useTip } from "./chrome";

// VIEW 2 — how four futures feed the same concerns.
//
// Scenarios on the left, pooled themes on the right, ribbon thickness = how much of that
// theme came from that room. The grid in view 1 answers "how many rooms" exactly; this
// answers "which rooms, and how much" at a glance, and shows the shape of the overlap.
//
// Identity here is carried by POSITION first — a ribbon physically leaves a labelled
// scenario node — with colour as reinforcement. That is why four hues are safe in the plot
// area: a reader who cannot separate two of them can still follow the ribbon to its end.

const CHART_H = 420;
const NODE_W = 11;
const GAP = 7;
const LABEL_L = 150;
const LABEL_R = 300;

export function ScenarioFlow({ analysis, colors }: { analysis: CohortAnalysis; colors: Map<string, string> }) {
  const { run } = analysis;
  const { tip, show, hide } = useTip();
  const [hot, setHot] = useState<string | null>(null);

  // Themes most-converged first, so the busiest ribbons sit together at the top instead of
  // crossing the whole picture.
  const order = run.themes
    .map((t, i) => ({ t, i }))
    .sort((a, b) => b.t.groupCount - a.t.groupCount || b.t.memberIds.length - a.t.memberIds.length);
  const themeAt = order.map((o) => o.t);
  const groups = run.groups.filter((g) => g.state === "ok");

  const links: FlowLink[] = [];
  themeAt.forEach((t, newIndex) => {
    for (const b of t.byGroup) links.push({ groupId: b.groupId, themeIndex: newIndex, count: b.count });
  });

  const inner = 760;
  const layout = flowLayout(
    groups.map((g) => g.id),
    themeAt.length,
    links,
    { height: CHART_H, nodeWidth: NODE_W, gap: GAP, width: inner }
  );

  const groupById = new Map(run.groups.map((g) => [g.id, g]));
  const dim = (key: string) => hot !== null && hot !== key;

  if (layout.ribbons.length === 0) {
    return (
      <Figure title="How the futures feed the same concerns" lede="Nothing to draw yet.">
        <p className="text-[12px] text-muted">
          No group contributed anything at this week, so there are no flows to show.
        </p>
      </Figure>
    );
  }

  return (
    <Figure
      title="How the futures feed the same concerns"
      lede={`Each scenario on the left, the cohort's themes on the right. A ribbon's thickness is how many of that room's ${poolSourceLabel(run.source).toLowerCase()} landed in that theme.`}
      legend={<GroupLegend groups={groups} colors={colors} />}
      footnote="Hover a ribbon or a node to isolate it. A theme fed by every scenario is one the cohort found whichever future it was given; a theme with a single ribbon is that room's alone."
    >
      <Tooltip tip={tip} />
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${LABEL_L + inner + LABEL_R} ${CHART_H + 24}`}
          className="min-w-[940px] w-full"
          role="img"
          aria-label="Flow from each group's scenario to the cohort's themes. The table view below carries the same numbers."
        >
          <g transform={`translate(${LABEL_L},12)`}>
            {/* Ribbons under the nodes, so a node's own block always reads as solid. */}
            {layout.ribbons.map((r) => {
              const g = groupById.get(r.groupId);
              const t = themeAt[r.themeIndex];
              const key = `${r.groupId}:${r.themeIndex}`;
              return (
                <path
                  key={key}
                  d={r.path}
                  fill={colors.get(r.groupId) ?? OTHER_GROUP_COLOR}
                  opacity={dim(r.groupId) && dim(key) ? 0.08 : 0.42}
                  onMouseEnter={(e) => {
                    setHot(key);
                    show(
                      e,
                      <>
                        <strong>{shortName(g?.name ?? "")}</strong>
                        {g?.scenarioTitle ? ` · ${g.scenarioTitle}` : ""}
                        <br />
                        {r.count} in “{t.label}”
                      </>
                    );
                  }}
                  onMouseLeave={() => {
                    setHot(null);
                    hide();
                  }}
                  style={{ cursor: "pointer" }}
                />
              );
            })}

            {layout.sources.map((n) => {
              const g = groupById.get(n.key);
              return (
                <g key={n.key}>
                  <rect
                    x={0}
                    y={n.y}
                    width={NODE_W}
                    height={Math.max(2, n.h)}
                    rx={2}
                    fill={colors.get(n.key) ?? OTHER_GROUP_COLOR}
                    opacity={dim(n.key) ? 0.25 : 1}
                    onMouseEnter={(e) => {
                      setHot(n.key);
                      show(e, <><strong>{shortName(g?.name ?? "")}</strong><br />{n.value} items placed</>);
                    }}
                    onMouseLeave={() => {
                      setHot(null);
                      hide();
                    }}
                    style={{ cursor: "pointer" }}
                  />
                  <text
                    x={-8}
                    y={n.y + n.h / 2}
                    textAnchor="end"
                    dominantBaseline="middle"
                    className="fill-ink text-[11px] font-bold"
                  >
                    {shortName(g?.name ?? n.key)}
                  </text>
                  <text
                    x={-8}
                    y={n.y + n.h / 2 + 12}
                    textAnchor="end"
                    dominantBaseline="middle"
                    className="fill-[var(--muted)] text-[9.5px]"
                  >
                    {g?.scenarioTitle ?? ""}
                  </text>
                </g>
              );
            })}

            {layout.targets.map((n) => {
              const t = themeAt[Number(n.key)];
              const all = groups.length;
              return (
                <g key={`t${n.key}`}>
                  <rect
                    x={n.x}
                    y={n.y}
                    width={NODE_W}
                    height={Math.max(2, n.h)}
                    rx={2}
                    fill="var(--ink)"
                    opacity={hot ? 0.3 : 0.85}
                  />
                  <text
                    x={n.x + NODE_W + 8}
                    y={n.y + n.h / 2}
                    dominantBaseline="middle"
                    className="fill-ink text-[10.5px] font-semibold"
                  >
                    {t.label.length > 44 ? `${t.label.slice(0, 43)}…` : t.label}
                  </text>
                  <text
                    x={n.x + NODE_W + 8}
                    y={n.y + n.h / 2 + 12}
                    dominantBaseline="middle"
                    className="fill-[var(--muted)] text-[9.5px] font-bold"
                  >
                    {t.groupCount}/{all} rooms · {t.memberIds.length} items
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>
    </Figure>
  );
}
