"use client";

import { useState } from "react";
import {
  GROUPING_PRESETS,
  membershipCounts,
  type ClusterMethod,
  type ImplicationClusterResponse,
} from "@/lib/analysis/implication-cluster-shape";
import { download } from "@/components/admin/exportUtils";

// Facilitator tool: propose how a group's Week 2 implications could be clustered, so
// Session 3 does not start on a blank board.
//
// READ-ONLY. Nothing here touches the Week 3 board — run it as often as you like, on real
// group material, and nothing changes until someone decides what to do with the output.
//
// Two methods, side by side so they can be compared before either is trusted. The
// difference is stated on the page rather than left to be inferred, because it is the one
// thing that will mislead a facilitator: criteria decide the GROUPING in one and only the
// NAMES in the other.

const btn =
  "rounded-[2px] border border-ink bg-paper px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.06em] hover:bg-lime disabled:opacity-40";

export function ImplicationClusterPanel({
  projectId,
  groupId,
  sources,
}: {
  projectId: string;
  groupId: string;
  // The group's implications weeks, newest-relevant first. Empty when there are none.
  sources: { exerciseId: string; title: string; count: number }[];
}) {
  const [sourceId, setSourceId] = useState(sources[0]?.exerciseId ?? "");
  const [method, setMethod] = useState<ClusterMethod>("llm");
  const [criteria, setCriteria] = useState("");
  const [preset, setPreset] = useState(GROUPING_PRESETS[1].key);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImplicationClusterResponse | null>(null);

  const source = sources.find((s) => s.exerciseId === sourceId) ?? sources[0];

  if (sources.length === 0) {
    return (
      <details className="rounded-[3px] border border-[var(--hairline)] bg-card p-3">
        <summary className="cursor-pointer list-none text-[12px] font-bold uppercase tracking-[0.08em]">
          ▸ Suggest themes
        </summary>
        <p className="mt-2 text-[12.5px] italic text-muted">
          This group has no implications week to cluster yet.
        </p>
      </details>
    );
  }

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/projects/${projectId}/design-groups/${groupId}/cluster`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourceExerciseId: sourceId,
            method,
            criteria: criteria.trim() || undefined,
            minSimilarity:
              method === "embedding"
                ? GROUPING_PRESETS.find((p) => p.key === preset)?.minSimilarity
                : undefined,
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Clustering failed (${res.status}).`);
      setResult(data as ImplicationClusterResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Clustering failed.");
    } finally {
      setBusy(false);
    }
  }

  const byId = new Map((result?.items ?? []).map((i) => [i.id, i]));
  // An implication in more than one theme is usually the interesting one in the room, so
  // it is marked rather than left to be spotted by reading every list.
  const inThemes = membershipCounts(result?.themes ?? []);

  return (
    <details className="rounded-[3px] border border-[var(--hairline)] bg-card p-3" open={false}>
      <summary className="cursor-pointer list-none text-[12px] font-bold uppercase tracking-[0.08em]">
        ▸ Suggest themes {result && <span className="text-muted">({result.themes.length} proposed)</span>}
      </summary>

      <p className="mt-2 max-w-[70ch] text-[12.5px] leading-[1.5] text-muted">
        Propose how this group&rsquo;s implications could cluster, to offer as starter ideas.
        An implication can land in more than one theme, and one that fits nowhere is left as
        an outlier. Nothing is written to the Week 3 board — this only shows you a grouping.
      </p>

      <div className="mt-3 flex flex-col gap-3">
        {sources.length > 1 && (
          <label className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
            From
            <select
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
              className="rounded-[2px] border border-ink bg-paper px-2 py-1 text-[12px] font-normal normal-case tracking-normal"
            >
              {sources.map((s) => (
                <option key={s.exerciseId} value={s.exerciseId}>
                  {s.title} ({s.count})
                </option>
              ))}
            </select>
          </label>
        )}

        {/* Method. The two produce the same shape, so the result below reads identically
            whichever is picked — only the honesty note changes. */}
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["llm", "Ask the model"],
              ["embedding", "Cluster by similarity"],
            ] as const
          ).map(([key, label]) => (
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
              {label}
            </button>
          ))}
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
            Criteria {method === "embedding" && <span className="normal-case">(names only)</span>}
          </span>
          <textarea
            value={criteria}
            onChange={(e) => setCriteria(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder={
              method === "llm"
                ? "e.g. Group by who has to act, not by topic. Aim for 4–6 themes."
                : "e.g. Name these from the point of view of the health department."
            }
            className="w-full max-w-[60rem] rounded-[2px] border border-ink bg-paper p-2 text-[13px] leading-[1.45]"
          />
          {/* The thing most likely to mislead, said plainly rather than left to be worked out. */}
          <span className="text-[11.5px] italic leading-[1.4] text-muted">
            {method === "llm"
              ? "The model reads every implication and groups them against this."
              : "Cosine similarity decides the groups here — your criteria only steer what each one is called."}
          </span>
        </label>

        {method === "embedding" && (
          <label className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
            Grouping
            <select
              value={preset}
              onChange={(e) => setPreset(e.target.value)}
              className="rounded-[2px] border border-ink bg-paper px-2 py-1 text-[12px] font-normal normal-case tracking-normal"
            >
              {GROUPING_PRESETS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button onClick={run} disabled={busy} className={btn}>
            {busy ? "Thinking…" : result ? "Run again" : `Suggest themes from ${source?.count ?? 0} implications`}
          </button>
          {result && (
            <button
              onClick={() =>
                download(
                  JSON.stringify(result, null, 2),
                  `implication-themes-${new Date().toISOString().slice(0, 10)}.json`,
                  "application/json"
                )
              }
              className={btn}
            >
              Export JSON
            </button>
          )}
          {error && <span className="text-[12px] font-bold text-coral">{error}</span>}
        </div>
      </div>

      {result && (
        <div className="mt-4 border-t border-[var(--hairline)] pt-3">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[11px] uppercase tracking-[0.06em] text-muted">
            <span className="font-bold text-ink">
              {result.themes.length} theme{result.themes.length === 1 ? "" : "s"}
            </span>
            <span>
              {result.method === "llm" ? "asked the model" : `by similarity · ${result.minSimilarity}`}
            </span>
            {[...inThemes.values()].filter((n) => n > 1).length > 0 && (
              <span>
                {[...inThemes.values()].filter((n) => n > 1).length} in more than one
              </span>
            )}
            <span>{result.model}</span>
          </div>

          {/* What had to be corrected. Shown, never swallowed — a run that quietly lost a
              third of the board should look different from a clean one. */}
          {result.notes.length > 0 && (
            <ul className="mt-2 flex flex-col gap-0.5">
              {result.notes.map((n, i) => (
                <li key={i} className="text-[11.5px] italic text-coral">
                  {n}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 flex flex-col gap-2.5">
            {result.themes.map((t, i) => (
              <details key={i} className="rounded-[3px] border border-black/15 bg-paper p-2.5">
                <summary className="cursor-pointer list-none">
                  <span className="text-[13.5px] font-bold">{t.label}</span>
                  <span className="ml-2 text-[11px] uppercase tracking-[0.06em] text-muted">
                    {t.memberIds.length} implication{t.memberIds.length === 1 ? "" : "s"}
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
                    const item = byId.get(id);
                    return (
                      <li
                        key={id}
                        className={
                          "border-l-2 pl-2.5 " +
                          ((inThemes.get(id) ?? 0) > 1 ? "border-blue" : "border-black/15")
                        }
                      >
                        <span className="text-[12.5px] leading-[1.45]">{item?.text ?? id}</span>
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

          {result.ungrouped.length > 0 && (
            <details className="mt-2.5 rounded-[3px] border border-dashed border-black/25 p-2.5">
              <summary className="cursor-pointer list-none text-[12px] font-bold uppercase tracking-[0.06em] text-muted">
                ▸ Outliers — in no theme ({result.ungrouped.length})
              </summary>
              <ul className="mt-2 flex flex-col gap-1.5">
                {result.ungrouped.map((id) => (
                  <li key={id} className="border-l-2 border-black/15 pl-2.5 text-[12.5px] leading-[1.45]">
                    {byId.get(id)?.text ?? id}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </details>
  );
}
