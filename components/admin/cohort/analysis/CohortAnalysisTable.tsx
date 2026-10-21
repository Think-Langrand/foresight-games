"use client";

import { poolSourceLabel } from "@/lib/analysis/cohort-pool-shape";
import type { CohortAnalysis } from "@/lib/analysis/cohort-analysis";
import { EMPTY_LABEL, shortName } from "./chrome";

// The table view every chart here is obliged to have. Not a fallback and not a debug
// panel: it is how a screen reader, a printout, and anyone who wants the actual numbers
// reads the same run, and it is the thing a colour-only encoding could never be.

export function CohortAnalysisTable({ analysis }: { analysis: CohortAnalysis }) {
  const { run, grid, weights } = analysis;
  const total = run.groups.filter((g) => g.state === "ok").length;
  const itemById = new Map(run.items.map((i) => [i.id, i]));

  return (
    <div className="space-y-8">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-left text-[12px]">
          <caption className="mb-2 text-left text-[11px] text-muted">
            Every theme, how many of the {total} contributing rooms raised it, each room&rsquo;s
            count, and the mean plausibility and impact behind it.
          </caption>
          <thead>
            <tr className="border-b border-ink">
              <th scope="col" className="py-2 pr-3 text-[10px] font-bold uppercase tracking-[0.07em] text-muted">Theme</th>
              <th scope="col" className="px-2 py-2 text-[10px] font-bold uppercase tracking-[0.07em] text-muted">Rooms</th>
              {run.groups.map((g) => (
                <th key={g.id} scope="col" className="px-2 py-2 text-right text-[10px] font-bold uppercase tracking-[0.07em] text-muted">
                  {shortName(g.name)}
                </th>
              ))}
              <th scope="col" className="px-2 py-2 text-right text-[10px] font-bold uppercase tracking-[0.07em] text-muted">Items</th>
              <th scope="col" className="px-2 py-2 text-right text-[10px] font-bold uppercase tracking-[0.07em] text-muted">Plaus.</th>
              <th scope="col" className="px-2 py-2 text-right text-[10px] font-bold uppercase tracking-[0.07em] text-muted">Impact</th>
              <th scope="col" className="px-2 py-2 text-right text-[10px] font-bold uppercase tracking-[0.07em] text-muted">Scored</th>
              <th scope="col" className="px-2 py-2 text-right text-[10px] font-bold uppercase tracking-[0.07em] text-muted">Cohesion</th>
            </tr>
          </thead>
          <tbody>
            {run.themes.map((t, i) => (
              <tr key={i} className="border-b border-[var(--rule)]/15">
                <th scope="row" className="max-w-[300px] py-1.5 pr-3 font-semibold">{t.label}</th>
                <td className="px-2 py-1.5 tabular-nums">{t.groupCount}/{total}</td>
                {/* Three states, three glyphs. A room that had no board and a room that
                    contributed nothing both have zero items in this theme, and printing a
                    bare 0 for the second made it indistinguishable from a room that simply
                    did not put anything in THIS theme. The table is the screen-reader and
                    printout path, so it is the worst place to lose that. */}
                {grid[i].cells.map((c) => (
                  <td key={c.groupId} className="px-2 py-1.5 text-right tabular-nums">
                    {c.state === "missing" ? (
                      <abbr title={EMPTY_LABEL.missing} className="text-muted no-underline">n/a</abbr>
                    ) : c.state === "empty" ? (
                      <abbr title={EMPTY_LABEL.empty} className="text-muted no-underline">—</abbr>
                    ) : (
                      c.count
                    )}
                  </td>
                ))}
                <td className="px-2 py-1.5 text-right tabular-nums">{t.memberIds.length}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{weights[i].plausibility ?? "—"}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{weights[i].impact ?? "—"}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-muted">
                  {weights[i].n}/{weights[i].n + weights[i].missing}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-muted">
                  {t.cohesion === null ? "—" : t.cohesion.toFixed(3)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {run.ungrouped.length > 0 ? (
        <section>
          <h3 className="text-[11px] font-bold uppercase tracking-[0.07em] text-muted">
            Claimed by no theme ({run.ungrouped.length})
          </h3>
          <ul className="mt-1.5 space-y-0.5">
            {run.ungrouped.map((id) => {
              const it = itemById.get(id);
              const g = run.groups.find((x) => x.id === it?.groupId);
              return (
                <li key={id} className="text-[11.5px] leading-[1.4]">
                  {it?.text}
                  <span className="text-muted"> — {shortName(g?.name ?? "")}</span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section>
        <h3 className="text-[11px] font-bold uppercase tracking-[0.07em] text-muted">
          What this run pooled
        </h3>
        <p className="mt-1.5 max-w-[640px] text-[11.5px] leading-[1.5]">
          {poolSourceLabel(run.source)} from {run.week.title}, {run.items.length} items,{" "}
          {run.method === "llm" ? "grouped by one model call" : "clustered by embedding similarity"}
          {run.minSimilarity !== null ? ` at ${run.minSimilarity}` : ""}, named by {run.model}.{" "}
          {analysis.scoredItems} of {run.items.length} items carried a plausibility/impact score.
        </p>
        {run.notes.length > 0 ? (
          <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
            {run.notes.map((n, i) => (
              <li key={i} className="text-[11px] text-muted">{n}</li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
