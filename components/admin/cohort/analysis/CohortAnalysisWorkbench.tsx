"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { csvCell, download } from "@/components/admin/exportUtils";
import { type ClusterMethod } from "@/lib/analysis/implication-cluster-shape";
import {
  COHORT_PRESETS,
  DEFAULT_COHORT_PRESET,
  type ContextMode,
} from "@/lib/analysis/cohort-cluster-shape";
import { POOL_SOURCES, poolSourceLabel, type PoolSource } from "@/lib/analysis/cohort-pool-shape";
import { cohortCsvRows, COHORT_CSV_HEADER } from "@/lib/analysis/cohort-csv";
import { groupColors } from "@/lib/analysis/cohort-palette";
import {
  fetchAnalysisPreview,
  runAnalysis,
  type AnalysisPreview,
} from "@/lib/analysis/cohort-analysis-client";
import type { CohortAnalysis } from "@/lib/analysis/cohort-analysis";
import { RobustnessSpine } from "./RobustnessSpine";
import { ScenarioFlow } from "./ScenarioFlow";
import { WeightMap } from "./WeightMap";
import { FlipLedger } from "./FlipLedger";
import { CohortAnalysisTable } from "./CohortAnalysisTable";
import { shortName } from "./chrome";

// The cohort analysis page. Pick what to pool, run it once, then read the same run four
// ways without paying for it again.
//
// ONE PAYLOAD, FOUR VIEWS. Every view below renders from the same CohortAnalysis, so two
// tabs cannot disagree about the same cohort — and switching tabs is free, which is the
// point: these four readings are being compared against each other to find out which one
// actually carries the finding.
//
// READ-ONLY: no run touches a board, which is what makes it safe to re-run on real group
// material. The run lives in client state and is gone on reload, same as the implications
// playground it sits beside.
//
// Group COLOURS are assigned once, from the full group list, and carried into every view.
// Assigning them per view would let a filtered-out group hand its colour to a survivor.

const btn =
  "rounded-[2px] border border-ink bg-paper px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.06em] hover:bg-lime disabled:opacity-40";
const label = "text-[11px] font-bold uppercase tracking-[0.06em] text-muted";
const field =
  "rounded-[2px] border border-ink bg-paper px-2 py-1 text-[12px] font-normal normal-case tracking-normal";

const VIEWS = [
  { key: "spine", label: "Across futures" },
  { key: "flow", label: "Scenario flow" },
  { key: "weight", label: "Weight map" },
  { key: "flips", label: "Flips" },
  { key: "table", label: "Table" },
] as const;
type ViewKey = (typeof VIEWS)[number]["key"];

// Above this, the single LLM grouping call is slow and starts leaving more items unclaimed
// as its attention thins. Same threshold the implications playground uses.
const LLM_COMFORT = 120;

export function CohortAnalysisWorkbench({
  projectId,
  slug,
  initial,
}: {
  projectId: string;
  slug: string;
  initial: AnalysisPreview;
}) {
  const [source, setSource] = useState<PoolSource>(initial.source);
  const [preview, setPreview] = useState(initial);
  const [method, setMethod] = useState<ClusterMethod>("embedding");
  const [context, setContext] = useState<ContextMode>("blind");
  const [preset, setPreset] = useState(DEFAULT_COHORT_PRESET);
  const [criteria, setCriteria] = useState("");
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [analysis, setAnalysis] = useState<CohortAnalysis | null>(null);
  const [view, setView] = useState<ViewKey>("spine");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  // Colours are keyed to the project's full group list ONCE, so they survive every filter:
  // assigning them from the filtered list would let an excluded group hand its colour to a
  // survivor, and the same room would change colour as you toggled a checkbox. Held in
  // state with a lazy initializer rather than a ref, because it is read during render.
  const [colors] = useState<Map<string, string>>(() => groupColors(initial.groups));

  // Re-preview when the source changes: a different source lives on a different week and
  // pools a different amount, and a facilitator should see the size before paying for a run.
  useEffect(() => {
    let live = true;
    fetchAnalysisPreview(projectId, source)
      .then((p) => {
        if (live) setPreview(p);
      })
      .catch((e: unknown) => {
        if (live) setError(e instanceof Error ? e.message : "Could not read the cohort.");
      });
    return () => {
      live = false;
    };
  }, [projectId, source]);

  useEffect(() => {
    if (!busy) return;
    const t = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [busy]);

  const groupIds = preview.groups.filter((g) => !excluded.has(g.id)).map((g) => g.id);
  const poolable = preview.groups.filter((g) => g.state === "ok" && !excluded.has(g.id));
  const itemsInRun = poolable.reduce((n, g) => n + g.itemCount, 0);

  async function run() {
    setBusy(true);
    setElapsed(0);
    setError(null);
    try {
      const got = await runAnalysis(projectId, {
        source,
        method,
        context,
        criteria: criteria.trim() || undefined,
        minSimilarity: COHORT_PRESETS.find((p) => p.key === preset)?.minSimilarity,
        weekSort: preview.week?.sort,
        groupIds: groupIds.length === preview.groups.length ? undefined : groupIds,
      });
      setAnalysis(got);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The run failed — please try again.");
    } finally {
      setBusy(false);
    }
  }

  const stamp = () => new Date().toISOString().slice(0, 10);
  const exportJson = () => {
    if (!analysis) return;
    download(
      JSON.stringify(analysis, null, 2),
      `cohort-analysis-${source}-${stamp()}.json`,
      "application/json"
    );
  };
  const exportCsv = () => {
    if (!analysis) return;
    const lines = [COHORT_CSV_HEADER.map(csvCell).join(",")];
    for (const row of cohortCsvRows(analysis.run)) lines.push(row.map(csvCell).join(","));
    download("﻿" + lines.join("\r\n"), `cohort-analysis-${source}-${stamp()}.csv`, "text/csv;charset=utf-8;");
  };

  return (
    <main className="mx-auto min-h-screen max-w-[1180px] px-5 py-6">
      <header className="mb-5 border-b border-ink pb-3">
        <Link href={`/admin/projects/${slug}`} className="eyebrow blue">
          ← {preview.projectName}
        </Link>
        <h1 className="mt-1 text-[24px] font-extrabold uppercase tracking-tight">
          Across the cohort
        </h1>
        <p className="mt-1.5 max-w-[680px] text-[12.5px] leading-[1.5] text-muted">
          Every design group&rsquo;s material pooled and themed together. Because each group
          worked a <span className="font-semibold text-ink">different scenario</span>, a theme
          that shows up in all of them is robust to whichever future actually arrives — and one
          that shows up in a single group is contingent on that group&rsquo;s scenario. Nothing
          here writes to a board.
        </p>
      </header>

      {/* --- controls: one row, above the charts ------------------------------- */}
      <section className="mb-5 space-y-3 border border-ink bg-card p-3">
        <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
          <label className={label}>
            <span className="mb-1 block">Pool</span>
            <select
              className={field}
              value={source}
              onChange={(e) => {
                setSource(e.target.value as PoolSource);
                // The previous run was about different material; keeping it on screen under
                // a new source label would be the one wrong thing this page could show.
                setAnalysis(null);
                setError(null);
              }}
              disabled={busy}
            >
              {POOL_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {poolSourceLabel(s)}
                </option>
              ))}
            </select>
          </label>

          <label className={label}>
            <span className="mb-1 block">Method</span>
            <select
              className={field}
              value={method}
              onChange={(e) => setMethod(e.target.value as ClusterMethod)}
              disabled={busy}
            >
              <option value="embedding">Embedding similarity</option>
              <option value="llm">One model call</option>
            </select>
          </label>

          {method === "embedding" ? (
            <label className={label}>
              <span className="mb-1 block">Grain</span>
              <select className={field} value={preset} onChange={(e) => setPreset(e.target.value)} disabled={busy}>
                {COHORT_PRESETS.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className={label}>
            <span className="mb-1 block">Model sees</span>
            <select
              className={field}
              value={context}
              onChange={(e) => setContext(e.target.value as ContextMode)}
              disabled={busy}
            >
              <option value="blind">Nothing about which room (blind)</option>
              <option value="full">The room and its scenario</option>
            </select>
          </label>

          <label className={`${label} min-w-[220px] flex-1`}>
            <span className="mb-1 block">Group them this way (optional)</span>
            <input
              className={`${field} w-full`}
              value={criteria}
              onChange={(e) => setCriteria(e.target.value)}
              placeholder="e.g. cut across the key changes, not along them"
              disabled={busy}
            />
          </label>

          <button type="button" className={btn} onClick={run} disabled={busy || itemsInRun < 2}>
            {busy ? `Running… ${elapsed}s` : analysis ? "Run again" : "Run"}
          </button>
        </div>

        {/* What a run would pool, before paying for one. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--rule)]/20 pt-2.5">
          <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
            {preview.week ? preview.week.title : "no week carries this"} · {itemsInRun} items
          </span>
          {preview.groups.map((g) => {
            const off = excluded.has(g.id);
            return (
              <label
                key={g.id}
                className={`flex items-center gap-1.5 text-[11px] ${off ? "opacity-40" : ""}`}
                title={
                  g.state === "missing"
                    ? "no board at this week"
                    : g.state === "empty"
                      ? "has a board but nothing on it at this week"
                      : `${g.itemCount} items`
                }
              >
                <input
                  type="checkbox"
                  checked={!off}
                  disabled={busy}
                  onChange={() =>
                    setExcluded((prev) => {
                      const next = new Set(prev);
                      if (next.has(g.id)) next.delete(g.id);
                      else next.add(g.id);
                      return next;
                    })
                  }
                />
                <span aria-hidden className="inline-block h-[3px] w-4 rounded-[2px]" style={{ background: colors.get(g.id) }} />
                <span className="font-semibold">{shortName(g.name)}</span>
                <span className="tabular-nums text-muted">
                  {g.state === "ok" ? g.itemCount : g.state === "missing" ? "no board" : "empty"}
                </span>
              </label>
            );
          })}
        </div>

        {method === "llm" && itemsInRun > LLM_COMFORT ? (
          <p className="text-[11px] text-coral">
            {itemsInRun} items is past where one model call holds its attention — it gets slow and
            leaves more items unclaimed. Embedding similarity is the better choice at this size.
          </p>
        ) : null}
        {itemsInRun < 2 ? (
          <p className="text-[11px] text-muted">
            Fewer than two items to pool. Pick another source, or re-include a group.
          </p>
        ) : null}
        {error ? <p className="text-[11.5px] font-semibold text-coral">{error}</p> : null}
      </section>

      {/* --- the run, four ways ------------------------------------------------ */}
      {analysis ? (
        <>
          <nav className="mb-5 flex flex-wrap items-center gap-2 border-b border-[var(--rule)]/25 pb-3">
            {VIEWS.map((v) => (
              <button
                key={v.key}
                type="button"
                onClick={() => setView(v.key)}
                aria-current={view === v.key}
                className={`rounded-[2px] border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.06em] ${
                  view === v.key
                    ? "border-ink bg-ink text-paper"
                    : "border-[var(--rule)]/40 bg-paper hover:bg-lime"
                }`}
              >
                {v.label}
              </button>
            ))}
            <span className="ml-auto flex gap-2">
              <button type="button" className={btn} onClick={exportJson}>
                JSON
              </button>
              <button type="button" className={btn} onClick={exportCsv}>
                CSV
              </button>
            </span>
          </nav>

          {view === "spine" ? <RobustnessSpine analysis={analysis} colors={colors} /> : null}
          {view === "flow" ? <ScenarioFlow analysis={analysis} colors={colors} /> : null}
          {view === "weight" ? <WeightMap analysis={analysis} /> : null}
          {view === "flips" ? <FlipLedger analysis={analysis} colors={colors} /> : null}
          {view === "table" ? <CohortAnalysisTable analysis={analysis} /> : null}

          <p className="mt-8 border-t border-[var(--rule)]/20 pt-3 text-[11px] leading-[1.5] text-muted">
            The groupings are deterministic — same pool, same grain, same clusters — but the theme
            NAMES are model output and reword between runs. Two runs of identical settings can
            show the same membership under different names.
          </p>
        </>
      ) : (
        <p className="text-[12.5px] text-muted">
          Pick what to pool and run it. The same run then reads four ways, for free.
        </p>
      )}
    </main>
  );
}
