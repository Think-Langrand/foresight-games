"use client";

import { Fragment, useState } from "react";
import {
  OTHER_GROUP_COLOR,
  POLARITY_COLOR,
  convergenceStep,
} from "@/lib/analysis/cohort-palette";
import { bucketByGroup } from "@/lib/analysis/cohort-cluster-shape";
import { poolSourceLabel } from "@/lib/analysis/cohort-pool-shape";
import type { CohortAnalysis } from "@/lib/analysis/cohort-analysis";
import {
  EMPTY_LABEL,
  Figure,
  GroupLegend,
  MISSING_FILL,

  Tooltip,
  shortName,
  useTip,
} from "./chrome";

// VIEW 1 — what held across every future.
//
// Themes down, groups across, ordered by how many groups raised each one. The groups each
// worked a DIFFERENT scenario, so the top of this list is the part of the cohort's thinking
// that does not depend on which future arrives, and the bottom is what one room saw because
// of the scenario it was given. That ordering is the whole argument; everything else here
// is support for it.
//
// Cell colour is MAGNITUDE (one hue, light to dark), not group identity: the column header
// carries which group it is. Using four hues at four intensities would be two colour jobs
// in one mark.

export function RobustnessSpine({ analysis, colors }: { analysis: CohortAnalysis; colors: Map<string, string> }) {
  const { run, grid } = analysis;
  const { tip, show, hide } = useTip();
  const [open, setOpen] = useState<number | null>(null);

  const total = run.groups.filter((g) => g.state === "ok").length;
  const itemById = new Map(run.items.map((i) => [i.id, i]));
  const groupById = new Map(run.groups.map((g) => [g.id, g]));

  // Most-converged first; a tie goes to the bigger theme, then to its label so the same run
  // reads the same way twice.
  const order = run.themes
    .map((t, i) => ({ t, i }))
    .sort(
      (a, b) =>
        b.t.groupCount - a.t.groupCount ||
        b.t.memberIds.length - a.t.memberIds.length ||
        a.t.label.localeCompare(b.t.label)
    );

  const robust = order.filter((r) => r.t.groupCount === total && total > 1).length;
  const lone = order.filter((r) => r.t.groupCount === 1).length;

  // Implications carry no polarity, so for an implications run the risk/opportunity column
  // would be a column of em-dashes. Dropped rather than shown empty: a column that is always
  // blank teaches a reader to stop looking at it on the runs where it is not.
  const hasPolarity = run.items.some((i) => i.polarity);

  const polarityOf = (ids: string[]) => {
    let risk = 0;
    let opp = 0;
    for (const id of ids) {
      const p = itemById.get(id)?.polarity;
      if (p === "risk" || p === "fear") risk += 1;
      if (p === "opportunity" || p === "hope") opp += 1;
    }
    return { risk, opp, any: risk + opp > 0 };
  };

  return (
    <Figure
      title="What held across every future"
      lede={
        `Each group worked a different scenario, so a theme raised in all ${total} is robust to ` +
        `which future arrives; one raised in a single group is contingent on that group's scenario. ` +
        `${robust} of ${run.themes.length} themes ran through every room` +
        (lone > 0 ? `, and ${lone} belonged to one.` : ".")
      }
      legend={
        <>
          <GroupLegend groups={run.groups} colors={colors} />
          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted">
            <span
              aria-hidden
              className="inline-block h-[10px] w-[10px] rounded-[2px] border border-[var(--rule)]"
              style={{ background: MISSING_FILL }}
            />
            no board at this week
          </span>
        </>
      }
      footnote={
        `Cell shade is how many ${poolSourceLabel(run.source).toLowerCase()} that group put in the theme; ` +
        `the number is always printed, so the shade never carries a value on its own. ` +
        `An empty cell means that room never went there — a hatched one means it had no board to go there on.` +
        (hasPolarity ? "" : ` These items carry no risk/opportunity side, so that column is not shown.`)
      }
    >
      <Tooltip tip={tip} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left">
          <caption className="sr-only">
            Themes by how many design groups raised them, with each group&rsquo;s item count.
          </caption>
          <thead>
            <tr className="border-b border-ink">
              <th scope="col" className="py-2 pr-3 text-[10px] font-bold uppercase tracking-[0.08em] text-muted">
                Theme
              </th>
              {run.groups.map((g) => (
                <th
                  key={g.id}
                  scope="col"
                  className="w-[62px] px-1 py-2 text-center text-[10px] font-bold uppercase tracking-[0.06em]"
                >
                  <span className="flex flex-col items-center gap-1">
                    <span
                      aria-hidden
                      className="inline-block h-[3px] w-5 rounded-[2px]"
                      style={{ background: colors.get(g.id) ?? OTHER_GROUP_COLOR }}
                    />
                    <span className="text-ink">{shortName(g.name)}</span>
                  </span>
                </th>
              ))}
              <th scope="col" className="w-[66px] px-1 py-2 text-center text-[10px] font-bold uppercase tracking-[0.08em] text-muted">
                Rooms
              </th>
              {hasPolarity ? (
                <th scope="col" className="w-[132px] px-1 py-2 text-[10px] font-bold uppercase tracking-[0.08em] text-muted">
                  Risk / opp
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {order.map(({ t, i }, row) => {
              const prev = order[row - 1]?.t.groupCount;
              // One rule, drawn: the line between "robust across futures" and the rest.
              const boundary = prev !== undefined && prev > 1 && t.groupCount === 1;
              const pol = polarityOf(t.memberIds);
              const isOpen = open === i;
              return (
                <Fragment key={i}>
                  <tr
                    className={`border-b border-[var(--rule)]/15 align-middle ${
                      boundary ? "border-t-2 border-t-ink" : ""
                    }`}
                  >
                    <th scope="row" className="py-2 pr-3 font-normal">
                      <button
                        type="button"
                        onClick={() => setOpen(isOpen ? null : i)}
                        aria-expanded={isOpen}
                        className="text-left text-[12.5px] font-semibold leading-[1.35] text-ink hover:text-blue"
                      >
                        {t.label}
                        <span className="ml-1.5 text-[10px] font-bold text-muted">
                          {isOpen ? "▾" : "▸"}
                        </span>
                      </button>
                      {t.summary ? (
                        <p className="mt-0.5 max-w-[420px] text-[11px] leading-[1.4] text-muted">{t.summary}</p>
                      ) : null}
                    </th>

                    {/* Shade is the cell's share of the BIGGEST cell in its own row. Scaling
                        against the group count instead made 5 and 41 the same darkest step,
                        so a row of wildly uneven contributions read as evenly shared. */}
                    {(() => {
                      const rowMax = Math.max(...grid[i].cells.map((c) => c.count), 1);
                      return grid[i].cells.map((c) => {
                      const g = groupById.get(c.groupId);
                      const absent = c.state === "missing";
                      return (
                        <td key={c.groupId} className="px-1 py-1.5">
                          <div
                            tabIndex={0}
                            onMouseEnter={(e) =>
                              show(
                                e,
                                <>
                                  <strong>{shortName(g?.name ?? "")}</strong>
                                  {g?.scenarioTitle ? ` · ${g.scenarioTitle}` : ""}
                                  <br />
                                  {absent || c.count === 0
                                    ? EMPTY_LABEL[c.state]
                                    : `${c.count} in “${t.label}”`}
                                </>
                              )
                            }
                            onMouseLeave={hide}
                            onFocus={(e) =>
                              show(
                                { clientX: e.currentTarget.getBoundingClientRect().left, clientY: e.currentTarget.getBoundingClientRect().bottom },
                                `${shortName(g?.name ?? "")}: ${absent || c.count === 0 ? EMPTY_LABEL[c.state] : c.count}`
                              )
                            }
                            onBlur={hide}
                            className="mx-auto flex h-7 w-12 items-center justify-center rounded-[3px] border border-[var(--rule)]/25 text-[11.5px] font-bold tabular-nums"
                            style={{
                              background: absent
                                ? MISSING_FILL
                                : convergenceStep(
                                    c.count > 0 ? Math.round((c.count / rowMax) * 4) : 0,
                                    4
                                  ),
                              color: c.count / rowMax > 0.62 ? "var(--paper)" : "var(--ink)",
                            }}
                          >
                            {absent ? "" : c.count || ""}
                          </div>
                        </td>
                      );
                      });
                    })()}

                    <td className="px-1 py-1.5 text-center">
                      <span
                        className={`inline-block rounded-[2px] px-1.5 py-0.5 text-[11px] font-extrabold tabular-nums ${
                          t.groupCount === total && total > 1
                            ? "bg-ink text-paper"
                            : t.groupCount === 1
                              ? "border border-coral text-coral"
                              : "text-ink"
                        }`}
                      >
                        {t.groupCount}/{total}
                      </span>
                    </td>

                    {hasPolarity ? (
                    <td className="px-1 py-1.5">
                      {pol.any ? (
                        <span className="flex items-center gap-1.5">
                          <span className="flex h-[9px] w-[72px] overflow-hidden rounded-[2px]">
                            {pol.risk > 0 ? (
                              <span
                                style={{
                                  background: POLARITY_COLOR.risk,
                                  width: `${(pol.risk / (pol.risk + pol.opp)) * 100}%`,
                                  marginRight: pol.opp > 0 ? 2 : 0,
                                }}
                              />
                            ) : null}
                            {pol.opp > 0 ? (
                              <span style={{ background: POLARITY_COLOR.opportunity, flex: 1 }} />
                            ) : null}
                          </span>
                          <span className="text-[10.5px] font-bold tabular-nums text-muted">
                            {pol.risk}/{pol.opp}
                          </span>
                        </span>
                      ) : (
                        <span className="text-[10.5px] text-muted">—</span>
                      )}
                    </td>
                    ) : null}
                  </tr>

                  {isOpen ? (
                    <tr className="border-b border-[var(--rule)]/15 bg-card">
                      <td colSpan={run.groups.length + (hasPolarity ? 3 : 2)} className="px-3 py-3">
                        <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                          {bucketByGroup(
                            t.memberIds,
                            new Map(run.items.map((it) => [it.id, it.groupId])),
                            t.byGroup.map((b) => b.groupId)
                          ).map((b) => {
                            const g = groupById.get(b.groupId);
                            return (
                              <div key={b.groupId || "unattributed"}>
                                <p className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.07em]">
                                  <span
                                    aria-hidden
                                    className="inline-block h-[3px] w-4 rounded-[2px]"
                                    style={{ background: colors.get(b.groupId) ?? OTHER_GROUP_COLOR }}
                                  />
                                  {g ? shortName(g.name) : "unattributed"} ({b.ids.length})
                                </p>
                                <ul className="space-y-1">
                                  {b.ids.map((id) => {
                                    const it = itemById.get(id);
                                    if (!it) return null;
                                    return (
                                      <li key={id} className="text-[11.5px] leading-[1.4] text-ink">
                                        {it.polarity ? (
                                          <span
                                            aria-hidden
                                            className="mr-1 inline-block h-[7px] w-[7px] rounded-full align-[1px]"
                                            style={{ background: POLARITY_COLOR[it.polarity] }}
                                          />
                                        ) : null}
                                        {it.text}
                                        {it.keyChange ? (
                                          <span className="text-muted"> — {it.keyChange}</span>
                                        ) : null}
                                      </li>
                                    );
                                  })}
                                </ul>
                              </div>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {run.ungrouped.length > 0 ? (
        <p className="mt-3 text-[11px] text-muted">
          {run.ungrouped.length} item{run.ungrouped.length === 1 ? "" : "s"} no theme claimed. Shown
          in the table view rather than hidden — a loose item is worth seeing as loose.
        </p>
      ) : null}
    </Figure>
  );
}
