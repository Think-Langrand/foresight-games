"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { type ClusterMethod } from "@/lib/analysis/implication-cluster-shape";
import { composeClusterPrompt, FULL_GUIDANCE } from "@/lib/analysis/theme-guidance";
import {
  fetchCohortPreview,
  runCohortCluster,
  type CohortPreview,
} from "@/lib/analysis/cohort-cluster-client";
import {
  COHORT_PRESETS,
  DEFAULT_COHORT_PRESET,
  type CohortClusterResponse,
  type ContextMode,
} from "@/lib/analysis/cohort-cluster-shape";
import { CohortRunView } from "./CohortRunView";

// The cohort playground. Pool every group's implications for one project, theme them, and
// compare runs until something is worth keeping.
//
// READ-ONLY: no run touches a board. That is what makes it safe to try a dozen prompts on
// real group material.
//
// Runs are kept in CLIENT STATE, not the database. Two reasons, and the second is the
// point: comparing two runs costs nothing once both have been fetched, and a facilitator
// tuning a threshold should not pay a model call to look back at what the last setting
// did. The cost is that runs are gone on reload — deliberate for this round.
//
// LABEL STABILITY, said here because it will otherwise look like a bug: the GROUPINGS are
// deterministic (same pool, same threshold, same clusters, same grid), but the names are
// model output at default temperature and reword between runs. Two runs of identical
// settings can therefore show identical membership under different theme names.

const btn =
  "rounded-[2px] border border-ink bg-paper px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.06em] hover:bg-lime disabled:opacity-40";
const label = "text-[11px] font-bold uppercase tracking-[0.06em] text-muted";
const field =
  "rounded-[2px] border border-ink bg-paper px-2 py-1 text-[12px] font-normal normal-case tracking-normal";

// Above this, the single LLM grouping call is slow and starts leaving more implications
// unclaimed as its attention thins. Measured reference: 43 implications took 25–41s.
const LLM_COMFORT = 120;

interface Run {
  id: number;
  response: CohortClusterResponse;
}

export function CohortWorkbench({
  projectId,
  slug,
  initial,
}: {
  projectId: string;
  slug: string;
  initial: CohortPreview;
}) {
  const [preview, setPreview] = useState(initial);
  const [weekSort, setWeekSort] = useState<number | undefined>(initial.week?.sort);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [method, setMethod] = useState<ClusterMethod>("embedding");
  const [context, setContext] = useState<ContextMode>("blind");
  const [criteria, setCriteria] = useState("");
  const [prompt, setPrompt] = useState("");
  const [preset, setPreset] = useState(DEFAULT_COHORT_PRESET);
  const [bridging, setBridging] = useState(false);
  const [narrative, setNarrative] = useState(false);
  const [runs, setRuns] = useState<Run[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [compareId, setCompareId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const nextId = useRef(1);

  // A cohort LLM run can take minutes. Without a ticking number a facilitator cannot tell
  // a slow run from a broken one, and will reload the page halfway through.
  // The counter is reset in run() rather than here: resetting inside the effect body
  // would be a setState during render, and the lint rule that flags it is right.
  useEffect(() => {
    if (!busy) return;
    const started = Date.now();
    const t = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 500);
    return () => clearInterval(t);
  }, [busy]);

  async function changeWeek(sort: number) {
    setWeekSort(sort);
    setError(null);
    try {
      setPreview(await fetchCohortPreview(projectId, sort));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read the cohort.");
    }
  }

  const contributing = preview.groups.filter((g) => g.state === "ok");
  const included = contributing.filter((g) => !excluded.has(g.id));
  const poolSize = included.reduce((n, g) => n + g.itemCount, 0);

  async function run() {
    setElapsed(0);
    setBusy(true);
    setError(null);
    try {
      const response = await runCohortCluster(projectId, {
        method,
        context,
        weekSort,
        criteria: criteria.trim() || undefined,
        promptOverride: method === "llm" && prompt.trim() ? prompt.trim() : undefined,
        groupIds: excluded.size > 0 ? included.map((g) => g.id) : undefined,
        minSimilarity:
          method === "embedding"
            ? COHORT_PRESETS.find((p) => p.key === preset)?.minSimilarity
            : undefined,
        bridging: method === "embedding" ? bridging : undefined,
        narrative,
      });
      const id = nextId.current++;
      setRuns((prev) => [...prev, { id, response }]);
      setActiveId(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Clustering failed.");
    } finally {
      setBusy(false);
    }
  }

  const active = runs.find((r) => r.id === activeId) ?? null;
  const compare = runs.find((r) => r.id === compareId) ?? null;
  const runLabel = (r: Run) =>
    `Run ${r.id} · ${r.response.method === "llm" ? "model" : `sim ${r.response.minSimilarity}`}`;

  return (
    <main className="mx-auto min-h-screen max-w-[1400px] px-6 py-10">
      <Link href={`/admin/projects/${slug}`} className="text-[11px] uppercase tracking-[0.08em] text-muted hover:text-ink">
        ← {preview.projectName}
      </Link>
      <h1 className="mt-2 text-[26px] font-bold leading-[1.15]">Implications across the cohort</h1>
      <p className="mt-2 max-w-[80ch] text-[13px] leading-[1.55] text-muted">
        Pool every group&rsquo;s implications and propose the themes that run across all of
        them, with the groups each theme came from. Nothing is written to any board — run it
        as often as you like. Runs are kept on this page only, so they are gone on reload.
      </p>

      {/* --- controls --- */}
      <div className="mt-5 flex flex-col gap-3 rounded-[3px] border border-[var(--hairline)] bg-card p-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2">
            <span className={label}>Week</span>
            <select value={weekSort ?? ""} onChange={(e) => changeWeek(Number(e.target.value))} className={field}>
              {preview.weeks.map((w) => (
                <option key={w.sort} value={w.sort}>
                  {w.title} — in {w.groupCount} group{w.groupCount === 1 ? "" : "s"}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ["embedding", "Cluster by similarity"],
                ["llm", "Ask the model"],
              ] as const
            ).map(([key, text]) => (
              <button
                key={key}
                onClick={() => setMethod(key)}
                aria-pressed={method === key}
                className={
                  "rounded-[2px] border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.06em] " +
                  (method === key
                    ? "border-ink bg-ink text-paper"
                    : "border-[var(--rule)] bg-paper text-muted hover:border-ink hover:text-ink")
                }
              >
                {text}
              </button>
            ))}
          </div>

          {method === "embedding" && (
            <label className="flex items-center gap-2">
              <span className={label}>Grouping</span>
              <select value={preset} onChange={(e) => setPreset(e.target.value)} className={field}>
                {COHORT_PRESETS.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="flex items-center gap-2" title={method === "embedding" ? "Only the model-grouping method has a prompt to add context to." : undefined}>
            <span className={label + (method === "embedding" ? " opacity-40" : "")}>Context</span>
            <select
              value={context}
              onChange={(e) => setContext(e.target.value as ContextMode)}
              disabled={method === "embedding"}
              className={field + (method === "embedding" ? " opacity-40" : "")}
            >
              <option value="blind">Blind — no group names</option>
              <option value="full">Full — groups, scenarios, project</option>
            </select>
          </label>

          {method === "embedding" && (
            <label
              className="flex items-center gap-1.5 text-[11.5px]"
              title="Also file each implication under every other theme it is close to. On a pool this size that adds hundreds of extra placements and pushes every group into every theme, so the rooms-per-theme ratio stops meaning anything."
            >
              <input type="checkbox" checked={bridging} onChange={(e) => setBridging(e.target.checked)} />
              Second-best fits too
            </label>
          )}

          <label className="flex items-center gap-1.5 text-[11.5px]">
            <input type="checkbox" checked={narrative} onChange={(e) => setNarrative(e.target.checked)} />
            Write it up
          </label>
        </div>

        {/* Which rooms are in. A group with nothing to give is listed and disabled rather
            than hidden, so an unopened board reads as an unopened board. */}
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 border-t border-[var(--hairline)] pt-2.5">
          {preview.groups.map((g) => (
            <label
              key={g.id}
              className={"flex items-center gap-1.5 text-[11.5px] " + (g.state === "ok" ? "" : "text-muted")}
            >
              <input
                type="checkbox"
                disabled={g.state !== "ok"}
                checked={g.state === "ok" && !excluded.has(g.id)}
                onChange={(e) =>
                  setExcluded((prev) => {
                    const next = new Set(prev);
                    if (e.target.checked) next.delete(g.id);
                    else next.add(g.id);
                    return next;
                  })
                }
              />
              {g.name}
              <span className="text-muted">
                {g.state === "ok" ? `(${g.itemCount})` : g.state === "empty" ? "(board empty)" : "(no board)"}
              </span>
            </label>
          ))}
        </div>

        <label className="flex flex-col gap-1">
          <span className={label}>
            Criteria {method === "embedding" && <span className="normal-case">(names only)</span>}
          </span>
          <textarea
            value={criteria}
            onChange={(e) => setCriteria(e.target.value)}
            rows={2}
            maxLength={4000}
            placeholder={
              method === "llm"
                ? "e.g. Group by what is shifting in the system, not by who is affected. Aim for 5 themes."
                : "e.g. Name these for a plenary audience of public health leaders."
            }
            className="w-full rounded-[2px] border border-ink bg-paper p-2 text-[13px] leading-[1.45]"
          />
          <span className="text-[11.5px] italic leading-[1.4] text-muted">
            {method === "llm"
              ? "The model reads every implication in the pool and groups them against this."
              : "Cosine similarity decides the groups here — your criteria only steer what each one is called."}
          </span>
        </label>

        {method === "llm" && (
          <details className="rounded-[2px] border border-dashed border-black/25 p-2.5">
            <summary className="cursor-pointer list-none text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
              ▸ Edit the prompt {prompt.trim() && <span className="text-blue">(custom)</span>}
            </summary>
            <p className="mt-1.5 max-w-[80ch] text-[11.5px] italic leading-[1.4] text-muted">
              This replaces the whole system prompt. Start from the real one rather than
              writing from scratch — it carries the instructions the response format depends
              on, including using the implication ids exactly as given.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button onClick={() => setPrompt(composeClusterPrompt("cohort"))} className={btn}>
                Load the default
              </button>
              <button
                onClick={() => setPrompt(`${composeClusterPrompt("cohort")}\n\n${FULL_GUIDANCE}`)}
                className={btn}
              >
                Default + all session guidance
              </button>
              <button onClick={() => setPrompt("")} disabled={!prompt} className={btn}>
                Back to default
              </button>
            </div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={12}
              maxLength={8000}
              placeholder="Empty means the default prompt is used."
              className="mt-2 w-full rounded-[2px] border border-ink bg-paper p-2 font-mono text-[12px] leading-[1.5]"
            />
          </details>
        )}

        <div className="flex flex-wrap items-center gap-3 border-t border-[var(--hairline)] pt-2.5">
          <button onClick={run} disabled={busy || poolSize < 2} className={btn}>
            {busy ? `Thinking… ${elapsed}s` : `Run on ${poolSize} implications from ${included.length} group${included.length === 1 ? "" : "s"}`}
          </button>
          {error && <span className="text-[12px] font-bold text-coral">{error}</span>}
          {method === "llm" && poolSize > LLM_COMFORT && (
            <span className="max-w-[60ch] text-[11.5px] italic text-coral">
              {poolSize} implications is a lot for one grouping call: expect it to take
              minutes and to leave more implications in no theme. Similarity clustering
              handles this size comfortably.
            </span>
          )}
          {narrative && (
            <span className="text-[11.5px] italic text-muted">
              The write-up adds a call per group plus one overall.
            </span>
          )}
        </div>
      </div>

      {/* --- runs --- */}
      {runs.length > 0 && (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className={label}>Runs</span>
          {runs.map((r) => (
            <button
              key={r.id}
              onClick={() => setActiveId(r.id)}
              aria-pressed={activeId === r.id}
              className={
                "rounded-[2px] border px-2 py-1 text-[11px] font-bold uppercase tracking-[0.05em] " +
                (activeId === r.id
                  ? "border-ink bg-ink text-paper"
                  : "border-[var(--rule)] bg-paper text-muted hover:border-ink hover:text-ink")
              }
            >
              {runLabel(r)}
            </button>
          ))}
          {runs.length > 1 && (
            <label className="ml-2 flex items-center gap-2">
              <span className={label}>Compare with</span>
              <select
                value={compareId ?? ""}
                onChange={(e) => setCompareId(e.target.value ? Number(e.target.value) : null)}
                className={field}
              >
                <option value="">—</option>
                {runs
                  .filter((r) => r.id !== activeId)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {runLabel(r)}
                    </option>
                  ))}
              </select>
            </label>
          )}
        </div>
      )}

      {active && (
        <div className="mt-4 flex flex-col gap-8 lg:flex-row lg:gap-6">
          <CohortRunView run={active.response} label={runLabel(active)} />
          {compare && compare.id !== active.id && (
            <div className="border-t border-[var(--hairline)] pt-6 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
              <CohortRunView run={compare.response} label={runLabel(compare)} />
            </div>
          )}
        </div>
      )}

      {runs.length === 0 && !busy && (
        <p className="mt-6 text-[12.5px] italic text-muted">
          No runs yet. Similarity clustering is the cheaper, steadier starting point; the
          model-grouping method is the one worth trying a prompt on.
        </p>
      )}
    </main>
  );
}
