"use client";

import { useState } from "react";
import type { RippleCard } from "@/lib/ripples-types";
import {
  implicationKey,
  twinIndex,
  type SynthesisBoard,
} from "@/lib/synthesis-shape";
import {
  GROUPING_PRESETS,
  membershipCounts,
  type AdminTools,
  type ClusterMethod,
  type ImplicationClusterResponse,
  type SuggestedTheme,
} from "@/lib/analysis/implication-cluster-shape";
import { requestClustering } from "@/lib/analysis/implication-cluster-client";

// The facilitator's clustering tool, on the live board. The admin answers page has the
// full panel (components/admin/ImplicationClusterPanel.tsx); this is the same request and
// the same result, laid out for a rail and read beside the real tray — which is where the
// question "how else could these go together?" actually comes up.
//
// The route stays read-only. "Use this" is the one write, and it goes through the board's
// own create-theme path, so the group sees the new theme land live like any other and can
// rename, empty or delete it the same way.
//
// A suggestion's members are WEEK 2 ids. The board's tray cards point at those through
// sourceCardId (a copy through its twin), so a suggestion is resolved against the tray at
// render time: what is still in the tray can be used, what has already been placed is
// named rather than moved.

const btn =
  "rounded-[2px] border border-ink bg-paper px-2 py-1 text-[10px] font-bold uppercase tracking-[0.05em] hover:bg-lime disabled:opacity-40";

export function SuggestThemesRail({
  admin,
  board,
  editable,
  busy,
  onCreateThemeFrom,
}: {
  admin: AdminTools;
  board: SynthesisBoard;
  editable: boolean;
  busy: boolean;
  onCreateThemeFrom: (cardIds: string[], text?: string) => void;
}) {
  const sources = admin.clusterSources;
  const [sourceId, setSourceId] = useState(sources[0]?.exerciseId ?? "");
  const [method, setMethod] = useState<ClusterMethod>("llm");
  const [criteria, setCriteria] = useState("");
  const [preset, setPreset] = useState(GROUPING_PRESETS[1].key);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImplicationClusterResponse | null>(null);
  const [open, setOpen] = useState(true);

  const source = sources.find((s) => s.exerciseId === sourceId) ?? sources[0];

  // Week 2 id → the tray card that carries it, and Week 2 id → the themes already holding it.
  const twins = twinIndex(board);
  const sourceIdOf = (c: RippleCard) =>
    c.sourceCardId ?? twins.get(implicationKey(c))?.sourceCardId ?? null;
  const inTray = new Map<string, RippleCard>();
  for (const c of board.unclustered) {
    const sid = sourceIdOf(c);
    if (sid && !inTray.has(sid)) inTray.set(sid, c);
  }
  const placedIn = new Map<string, string[]>();
  for (const t of board.themes) {
    for (const c of board.clusters.get(t.id) ?? []) {
      const sid = sourceIdOf(c);
      if (!sid) continue;
      const arr = placedIn.get(sid);
      if (arr) arr.push(t.text);
      else placedIn.set(sid, [t.text]);
    }
  }

  async function run() {
    if (!source) return;
    setRunning(true);
    setError(null);
    try {
      setResult(
        await requestClustering(admin.projectId, admin.groupId, {
          sourceExerciseId: source.exerciseId,
          method,
          criteria: criteria.trim() || undefined,
          minSimilarity:
            method === "embedding"
              ? GROUPING_PRESETS.find((p) => p.key === preset)?.minSimilarity
              : undefined,
        })
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Clustering failed.");
    } finally {
      setRunning(false);
    }
  }

  const byId = new Map((result?.items ?? []).map((i) => [i.id, i]));
  const inThemes = membershipCounts(result?.themes ?? []);

  const use = (t: SuggestedTheme) => {
    const ids = t.memberIds.map((id) => inTray.get(id)?.id).filter((x): x is string => Boolean(x));
    if (ids.length === 0) return;
    onCreateThemeFrom(ids, t.label);
  };

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-baseline justify-between gap-2 text-left"
      >
        <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">
          {open ? "▾" : "▸"} Suggest themes
        </span>
        <span className="rounded-[2px] bg-blue px-1.5 py-px text-[9px] font-bold uppercase tracking-[0.05em] text-paper">
          Facilitator
        </span>
      </button>

      {open && (
        <div className="mt-2 flex flex-col gap-2.5">
          <p className="text-[11px] italic leading-[1.4] text-muted">
            Example groupings of this group&rsquo;s Week 2 implications, to read beside the
            tray. Nothing is written until you use one.
          </p>

          {sources.length === 0 ? (
            <p className="text-[11.5px] italic text-muted">No implications week to cluster.</p>
          ) : (
            <>
              {sources.length > 1 && (
                <select
                  value={sourceId}
                  onChange={(e) => setSourceId(e.target.value)}
                  className="w-full rounded-[2px] border border-ink bg-paper px-2 py-1 text-[11.5px]"
                >
                  {sources.map((s) => (
                    <option key={s.exerciseId} value={s.exerciseId}>
                      {s.title} ({s.count})
                    </option>
                  ))}
                </select>
              )}

              <div className="flex gap-1">
                {(
                  [
                    ["llm", "Ask the model"],
                    ["embedding", "By similarity"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setMethod(key)}
                    aria-pressed={method === key}
                    className={
                      "flex-1 rounded-[2px] border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.05em] " +
                      (method === key
                        ? "border-ink bg-ink text-paper"
                        : "border-[var(--rule)] bg-paper text-muted hover:border-ink hover:text-ink")
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>

              <textarea
                value={criteria}
                onChange={(e) => setCriteria(e.target.value)}
                rows={2}
                maxLength={2000}
                placeholder={
                  method === "llm"
                    ? "Criteria — e.g. group by who has to act. Aim for 4–6."
                    : "How to name them — e.g. from the health department's view."
                }
                className="w-full rounded-[2px] border border-ink bg-paper p-1.5 text-[11.5px] leading-[1.4]"
              />
              {/* The thing most likely to mislead, said plainly. */}
              <p className="text-[10.5px] italic leading-[1.4] text-muted">
                {method === "llm"
                  ? "The model groups against your criteria."
                  : "Similarity decides the groups; criteria only steer the names."}
              </p>

              {method === "embedding" && (
                <select
                  value={preset}
                  onChange={(e) => setPreset(e.target.value)}
                  className="w-full rounded-[2px] border border-ink bg-paper px-2 py-1 text-[11.5px]"
                >
                  {GROUPING_PRESETS.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label}
                    </option>
                  ))}
                </select>
              )}

              <button onClick={run} disabled={running} className={btn}>
                {running ? "Thinking…" : result ? "Run again" : `Suggest from ${source?.count ?? 0}`}
              </button>
              {error && <p className="text-[11px] font-bold text-coral">{error}</p>}
            </>
          )}

          {result && (
            <div className="border-t border-[var(--hairline)] pt-2.5">
              <div className="text-[10px] uppercase tracking-[0.06em] text-muted">
                <span className="font-bold text-ink">{result.themes.length} proposed</span>
                {" · "}
                {result.method === "llm" ? "asked the model" : "by similarity"}
              </div>
              {result.notes.length > 0 && (
                <ul className="mt-1.5 flex flex-col gap-0.5">
                  {result.notes.map((n, i) => (
                    <li key={i} className="text-[10.5px] italic text-coral">
                      {n}
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-2 flex flex-col gap-2">
                {result.themes.map((t, i) => {
                  const tray = t.memberIds.filter((id) => inTray.has(id));
                  const placed = t.memberIds.filter((id) => !inTray.has(id) && placedIn.has(id));
                  return (
                    <details key={i} className="rounded-[3px] border border-black/15 bg-paper p-2">
                      <summary className="cursor-pointer list-none">
                        <span className="block text-[12px] font-bold leading-[1.3]">{t.label}</span>
                        <span className="mt-0.5 block text-[10px] uppercase tracking-[0.05em] text-muted">
                          {t.memberIds.length} implication{t.memberIds.length === 1 ? "" : "s"}
                          {t.cohesion !== null && ` · ${t.cohesion.toFixed(2)}`}
                          {placed.length > 0 && ` · ${placed.length} already placed`}
                        </span>
                        {t.summary && (
                          <span className="mt-0.5 block text-[11px] leading-[1.4] text-muted">
                            {t.summary}
                          </span>
                        )}
                      </summary>

                      {editable && (
                        <button
                          onClick={() => use(t)}
                          disabled={busy || tray.length === 0}
                          title={
                            tray.length === 0
                              ? "None of these are still in the tray."
                              : `Make a theme named "${t.label}" and move ${tray.length} tray card${tray.length === 1 ? "" : "s"} into it.`
                          }
                          className={"mt-2 w-full " + btn}
                        >
                          Use this · {tray.length} of {t.memberIds.length} in tray
                        </button>
                      )}

                      <ul className="mt-2 flex flex-col gap-1.5">
                        {t.memberIds.map((id) => {
                          const item = byId.get(id);
                          const where = placedIn.get(id);
                          const bridging = (inThemes.get(id) ?? 0) > 1;
                          return (
                            <li
                              key={id}
                              className={
                                "border-l-2 pl-2 text-[11px] leading-[1.4] " +
                                (bridging ? "border-blue " : "border-black/15 ") +
                                (inTray.has(id) ? "" : "text-muted")
                              }
                            >
                              {item?.text ?? id}
                              {bridging && (
                                <span className="ml-1 whitespace-nowrap rounded-[2px] bg-blue/15 px-1 text-[9px] font-bold uppercase tracking-[0.05em] text-blue">
                                  in {inThemes.get(id)}
                                </span>
                              )}
                              {where && (
                                <span className="block text-[9.5px] uppercase tracking-[0.05em] text-muted">
                                  already in {where.join(", ")}
                                </span>
                              )}
                              {!where && !inTray.has(id) && (
                                <span className="block text-[9.5px] uppercase tracking-[0.05em] text-muted">
                                  not on this board
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </details>
                  );
                })}
              </div>

              {result.ungrouped.length > 0 && (
                <details className="mt-2 rounded-[3px] border border-dashed border-black/25 p-2">
                  <summary className="cursor-pointer list-none text-[10px] font-bold uppercase tracking-[0.05em] text-muted">
                    ▸ Outliers ({result.ungrouped.length})
                  </summary>
                  <ul className="mt-1.5 flex flex-col gap-1">
                    {result.ungrouped.map((id) => (
                      <li key={id} className="border-l-2 border-black/15 pl-2 text-[11px] leading-[1.4]">
                        {byId.get(id)?.text ?? id}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
