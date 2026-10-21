"use client";

import { useState, type ReactNode } from "react";
import { OTHER_GROUP_COLOR } from "@/lib/analysis/cohort-palette";
import type { CohortGroupInfo, GroupState } from "@/lib/analysis/cohort-cluster-shape";

// The pieces every analysis view is made of: a legend, a hover tooltip, a figure frame and
// the one rule all four views share about what an empty cell means.
//
// Shared rather than copied because the alternative is four views that disagree about
// whether a dark cell means "this room never went there" or "this room had no board" --
// which is the single distinction the whole feature is read for.

export const EMPTY_LABEL: Record<GroupState, string> = {
  ok: "none here",
  empty: "contributed nothing at this week",
  missing: "no board at this week",
};

// A group that could not contribute is hatched, not blank. Blank reads as zero, and zero is
// a finding ("Group 4 never raised legitimacy") that this is not.
export const MISSING_FILL =
  "repeating-linear-gradient(45deg, var(--muted) 0 1px, transparent 1px 5px)";

export function Figure({
  title,
  lede,
  children,
  legend,
  footnote,
}: {
  title: string;
  lede: string;
  children: ReactNode;
  legend?: ReactNode;
  footnote?: ReactNode;
}) {
  return (
    <figure className="m-0">
      <figcaption className="mb-3">
        <h2 className="text-[15px] font-extrabold uppercase tracking-[0.04em]">{title}</h2>
        <p className="mt-1 max-w-[640px] text-[12px] leading-[1.5] text-muted">{lede}</p>
      </figcaption>
      {legend ? <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">{legend}</div> : null}
      {children}
      {footnote ? (
        <p className="mt-3 max-w-[640px] text-[11px] leading-[1.5] text-muted">{footnote}</p>
      ) : null}
    </figure>
  );
}

export function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[11px] font-semibold text-ink">
      <span
        aria-hidden
        className="inline-block h-[10px] w-[10px] shrink-0 rounded-[2px]"
        style={{ background: color }}
      />
      {label}
    </span>
  );
}

// Group identity in a legend: the colour is beside the name, never instead of it.
export function GroupLegend({
  groups,
  colors,
}: {
  groups: CohortGroupInfo[];
  colors: Map<string, string>;
}) {
  return (
    <>
      {groups.map((g) => (
        <Swatch
          key={g.id}
          color={colors.get(g.id) ?? OTHER_GROUP_COLOR}
          label={g.scenarioTitle ? `${shortName(g.name)} · ${g.scenarioTitle}` : shortName(g.name)}
        />
      ))}
    </>
  );
}

// "Group 2 | The Known and Unknown" is the group's full name, and the scenario is already
// shown beside it, so the half after the pipe is the same string twice.
export function shortName(name: string): string {
  return name.split("|")[0].trim() || name;
}

export interface Tip {
  x: number;
  y: number;
  body: ReactNode;
}

// One tooltip per view, positioned over the whole figure. Every mark in all four views is
// hoverable: an HTML chart that cannot be interrogated is a picture of data.
export function useTip() {
  const [tip, setTip] = useState<Tip | null>(null);
  const show = (e: { clientX: number; clientY: number }, body: ReactNode) =>
    setTip({ x: e.clientX, y: e.clientY, body });
  const hide = () => setTip(null);
  return { tip, show, hide };
}

export function Tooltip({ tip }: { tip: Tip | null }) {
  if (!tip) return null;
  return (
    <div
      role="tooltip"
      className="pointer-events-none fixed z-50 max-w-[300px] rounded-[3px] border border-ink bg-card px-2.5 py-2 text-[11px] leading-[1.45] shadow-[3px_3px_0_var(--ink)]"
      style={{ left: Math.min(tip.x + 14, window.innerWidth - 320), top: tip.y + 14 }}
    >
      {tip.body}
    </div>
  );
}
