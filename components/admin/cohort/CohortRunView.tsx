"use client";

import { csvCell, download } from "@/components/admin/exportUtils";
import { membershipCounts } from "@/lib/analysis/implication-cluster-shape";
import { COHORT_CSV_HEADER, cohortCsvRows } from "@/lib/analysis/cohort-csv";
import type { CohortClusterResponse } from "@/lib/analysis/cohort-cluster-shape";
import { CohortGrid } from "./CohortGrid";

// One cohort run, rendered. Read-only: nothing here writes to a board.
//
// The order is deliberate — the grid first, because that is the reading a facilitator came
// for; then the write-up; then the themes in full; then the two views that exist to stop a
// tidy-looking run being believed too easily: the cross-group near-duplicates, and the
// outliers no theme claimed.

const btn =
  "rounded-[2px] border border-ink bg-paper px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.06em] hover:bg-lime disabled:opacity-40";

function seconds(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)}s`;
}

export function CohortRunView({ run, label }: { run: CohortClusterResponse; label: string }) {
  const itemById = new Map(run.items.map((i) => [i.id, i]));
  const groupById = new Map(run.groups.map((g) => [g.id, g]));
  const inThemes = membershipCounts(run.themes);
  const nameOf = (groupId: string) => groupById.get(groupId)?.name ?? groupId;

  const chip = (groupId: string) => {
    const g = groupById.get(groupId);
    return (
      <span
        className="ml-1.5 whitespace-nowrap rounded-[2px] px-1 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em]"
        style={{
          backgroundColor: g?.color
            ? `color-mix(in srgb, ${g.color} 35%, transparent)`
            : "var(--hairline)",
        }}
      >
        {nameOf(groupId)}
      </span>
    );
  };

  function exportCsv() {
    const rows = [COHORT_CSV_HEADER as readonly string[], ...cohortCsvRows(run)];
    download(
      "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n"),
      `cohort-themes-${run.generatedAt.slice(0, 10)}.csv`,
      "text/csv;charset=utf-8"
    );
  }

  return (
    <section className="min-w-0 flex-1">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[11px] uppercase tracking-[0.06em] text-muted">
        <span className="font-bold text-ink">{label}</span>
        <span className="font-bold text-ink">
          {run.themes.length} theme{run.themes.length === 1 ? "" : "s"}
        </span>
        <span>{run.items.length} implications</span>
        <span>
          {run.method === "llm"
            ? `asked the model · ${run.context === "full" ? "with context" : "blind"}`
            : `by similarity · ${run.minSimilarity}${run.bridging ? " · second-best fits on" : ""}`}
        </span>
        <span>{run.week.title}</span>
        <span>{seconds(run.elapsedMs)}</span>
        <span className="normal-case tracking-normal">{run.model}</span>
      </div>

      {run.criteria && (
        <p className="mt-1.5 max-w-[70ch] border-l-2 border-[var(--hairline)] pl-2 text-[11.5px] italic leading-[1.4] text-muted">
          {run.method === "embedding" ? "Names steered by: " : "Grouped by: "}
          {run.criteria}
        </p>
      )}
      {run.promptOverride && (
        <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.06em] text-blue">
          custom prompt
        </p>
      )}

      {/* What had to be corrected, and which groups contributed nothing. Never swallowed:
          a run that lost a third of the pool must not look like a clean one. */}
      {run.notes.length > 0 && (
        <ul className="mt-2 flex flex-col gap-0.5">
          {run.notes.map((n, i) => (
            <li key={i} className="text-[11.5px] italic text-coral">
              {n}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3">
        <CohortGrid run={run} />
      </div>

      {run.narrative && (
        <div className="mt-4 rounded-[3px] border border-[var(--hairline)] bg-paper p-3">
          <h4 className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
            Across the cohort
          </h4>
          {run.narrative.overall && (
            <p className="mt-1.5 max-w-[75ch] text-[13px] leading-[1.55]">
              {run.narrative.overall}
            </p>
          )}
          {run.narrative.perGroup.length > 0 && (
            <div className="mt-3 flex flex-col gap-2.5 border-t border-[var(--hairline)] pt-2.5">
              {run.narrative.perGroup.map((p) => (
                <div key={p.groupId}>
                  <h5 className="text-[11px] font-bold uppercase tracking-[0.06em]">
                    {nameOf(p.groupId)}
                  </h5>
                  <p className="mt-0.5 max-w-[75ch] text-[12.5px] leading-[1.5]">{p.text}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2.5">
        {run.themes.map((t, i) => (
          <details key={i} className="rounded-[3px] border border-black/15 bg-paper p-2.5">
            <summary className="cursor-pointer list-none">
              <span className="text-[13.5px] font-bold">{t.label}</span>
              <span className="ml-2 text-[11px] uppercase tracking-[0.06em] text-muted">
                {t.memberIds.length} implication{t.memberIds.length === 1 ? "" : "s"} ·{" "}
                {t.groupCount} room{t.groupCount === 1 ? "" : "s"}
                {t.cohesion !== null && ` · cohesion ${t.cohesion.toFixed(2)}`}
              </span>
              {t.summary && (
                <span className="mt-0.5 block text-[12px] leading-[1.45] text-muted">
                  {t.summary}
                </span>
              )}
            </summary>
            <ul className="mt-2 flex flex-col gap-1.5">
              {t.memberIds.map((id) => {
                const item = itemById.get(id);
                return (
                  <li
                    key={id}
                    className={
                      "border-l-2 pl-2.5 " +
                      ((inThemes.get(id) ?? 0) > 1 ? "border-blue" : "border-black/15")
                    }
                  >
                    <span className="text-[12.5px] leading-[1.45]">{item?.text ?? id}</span>
                    {item && chip(item.groupId)}
                    {(inThemes.get(id) ?? 0) > 1 && (
                      <span className="ml-1.5 whitespace-nowrap rounded-[2px] bg-blue/15 px-1 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] text-blue">
                        in {inThemes.get(id)} themes
                      </span>
                    )}
                    {item && (
                      <span className="mt-0.5 block text-[10.5px] uppercase tracking-[0.05em] text-muted">
                        from: {item.keyChange}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </details>
        ))}
      </div>

      {run.nearDuplicates.length > 0 && (
        <details className="mt-2.5 rounded-[3px] border border-[var(--hairline)] p-2.5">
          <summary className="cursor-pointer list-none text-[12px] font-bold uppercase tracking-[0.06em]">
            ▸ Said in two rooms ({run.nearDuplicates.length})
          </summary>
          <p className="mt-1.5 max-w-[70ch] text-[11.5px] italic leading-[1.4] text-muted">
            The closest pairs that come from different groups. Two rooms arriving at nearly
            the same sentence independently is the convergence worth quoting; a room
            repeating itself is not, so same-group pairs are never listed.
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {run.nearDuplicates.map((p, i) => {
              const a = itemById.get(p.aId);
              const b = itemById.get(p.bId);
              return (
                <li key={i} className="border-l-2 border-blue pl-2.5">
                  <span className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-blue">
                    {p.similarity.toFixed(2)}
                  </span>
                  <span className="mt-0.5 block text-[12.5px] leading-[1.4]">
                    {a?.text ?? p.aId}
                    {a && chip(a.groupId)}
                  </span>
                  <span className="mt-0.5 block text-[12.5px] leading-[1.4]">
                    {b?.text ?? p.bId}
                    {b && chip(b.groupId)}
                  </span>
                </li>
              );
            })}
          </ul>
        </details>
      )}

      {run.ungrouped.length > 0 && (
        <details className="mt-2.5 rounded-[3px] border border-dashed border-black/25 p-2.5">
          <summary className="cursor-pointer list-none text-[12px] font-bold uppercase tracking-[0.06em] text-muted">
            ▸ Outliers — in no theme ({run.ungrouped.length})
          </summary>
          <ul className="mt-2 flex flex-col gap-1.5">
            {run.ungrouped.map((id) => {
              const item = itemById.get(id);
              return (
                <li key={id} className="border-l-2 border-black/15 pl-2.5 text-[12.5px] leading-[1.45]">
                  {item?.text ?? id}
                  {item && chip(item.groupId)}
                </li>
              );
            })}
          </ul>
        </details>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={exportCsv} className={btn}>
          Export CSV
        </button>
        <button
          onClick={() =>
            download(
              JSON.stringify(run, null, 2),
              `cohort-themes-${run.generatedAt.slice(0, 10)}.json`,
              "application/json"
            )
          }
          className={btn}
        >
          Export JSON
        </button>
      </div>
    </section>
  );
}
