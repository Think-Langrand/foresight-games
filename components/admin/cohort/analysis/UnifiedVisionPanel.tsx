"use client";

import { useState } from "react";
import { OTHER_GROUP_COLOR } from "@/lib/analysis/cohort-palette";
import { draftVision } from "@/lib/analysis/unified-vision-client";
import type { UnifiedVision } from "@/lib/analysis/unified-vision-shape";
import type { CohortGroupInfo } from "@/lib/analysis/cohort-cluster-shape";
import { Figure, shortName } from "./chrome";

// Drafting one vision from the groups' several.
//
// NOT A FIFTH TAB on the clustering run. The other views all render the same
// CohortAnalysis, and this reads no clustering at all — four groups produce four
// paragraphs, which is the wrong shape for a convergence grid. See the header of
// lib/analysis/unified-vision-shape.ts. So it is its own panel, its own route and its own
// button, shown only when the pool is the vision statements.
//
// EVERY DRAFT SHOWS ITS SOURCES. A drafted vision is exactly the kind of output that gets
// pasted into a deck and loses its provenance in one hop, so the statements it was read
// from are on screen underneath it, and nothing here is saved to any board: adopting one
// stays a decision a room makes, not something a model did to a project.

const btn =
  "rounded-[2px] border border-ink bg-paper px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.06em] hover:bg-lime disabled:opacity-40";
const label = "text-[11px] font-bold uppercase tracking-[0.06em] text-muted";
const field =
  "rounded-[2px] border border-ink bg-paper px-2 py-1 text-[12px] font-normal normal-case tracking-normal";

function Attribution({
  groupIds,
  byId,
  colors,
}: {
  groupIds: string[];
  byId: Map<string, CohortGroupInfo>;
  colors: Map<string, string>;
}) {
  if (groupIds.length === 0) return null;
  return (
    <span className="ml-1 inline-flex flex-wrap items-center gap-1.5 align-middle">
      {groupIds.map((id) => {
        const g = byId.get(id);
        if (!g) return null;
        return (
          // The colour is BESIDE the name, never instead of it — the same rule the legends
          // follow, and it matters more here because two live groups share one stored hue.
          <span
            key={id}
            className="inline-flex items-center gap-1 rounded-[2px] border border-[var(--rule)]/40 px-1.5 py-[1px] text-[10px] font-semibold text-muted"
          >
            <span
              aria-hidden
              className="inline-block h-[3px] w-3 rounded-[2px]"
              style={{ background: colors.get(id) ?? OTHER_GROUP_COLOR }}
            />
            {shortName(g.name)}
          </span>
        );
      })}
    </span>
  );
}

export function UnifiedVisionPanel({
  projectId,
  groups,
  colors,
  weekSort,
  groupIds,
}: {
  projectId: string;
  groups: CohortGroupInfo[];
  colors: Map<string, string>;
  weekSort?: number;
  groupIds?: string[];
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [criteria, setCriteria] = useState("");
  const [vision, setVision] = useState<UnifiedVision | null>(null);

  const byId = new Map(groups.map((g) => [g.id, g]));

  async function run() {
    setBusy(true);
    setError(null);
    try {
      setVision(
        await draftVision(projectId, {
          criteria: criteria.trim() || undefined,
          weekSort,
          groupIds,
        })
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Drafting a vision failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mb-5 border border-ink bg-card p-3">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <div>
          <h2 className="text-[15px] font-extrabold uppercase tracking-[0.04em]">
            A unified vision
          </h2>
          <p className="mt-1 max-w-[640px] text-[12px] leading-[1.5] text-muted">
            What the rooms&rsquo; visions already agree on, where they genuinely pull apart, and
            drafts of one vision the cohort could stand behind. The rooms worked different
            futures, so a commitment that survives all of them is robust to which future
            arrives. Nothing here is saved to a board.
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-3">
        <label className={`${label} grow`}>
          <span className="mb-1 block">Anything to pay attention to (optional)</span>
          <input
            className={`${field} w-full max-w-[520px]`}
            value={criteria}
            disabled={busy}
            placeholder="e.g. keep the differences about who holds responsibility"
            onChange={(e) => setCriteria(e.target.value)}
          />
        </label>
        <button type="button" className={btn} onClick={run} disabled={busy}>
          {busy ? "Reading…" : vision ? "Draft again" : "Draft a vision"}
        </button>
      </div>

      {busy ? (
        <p className="mt-3 text-[11px] text-muted">
          One model call over the whole cohort&rsquo;s visions. This can take a minute.
        </p>
      ) : null}
      {error ? <p className="mt-3 text-[11.5px] font-semibold text-coral">{error}</p> : null}

      {vision ? (
        <div className="mt-5 space-y-5">
          {/* Said FIRST, not in a footnote: a "unified" vision drafted from three of four
              rooms is a different object from one drafted from all four. */}
          {vision.missing.length > 0 ? (
            <ul className="space-y-1 border-l-2 border-coral bg-paper px-3 py-2">
              {vision.missing.map((m) => (
                <li key={m.groupId} className="text-[11.5px] leading-[1.45] text-ink">
                  {shortName(m.groupName)} is not in this reading &mdash;{" "}
                  {m.reason === "missing" ? "no Session 4 board" : "no vision written yet"}.
                </li>
              ))}
            </ul>
          ) : null}

          <Figure
            title="What they already share"
            lede={`Read from ${vision.sources.length} vision statements.`}
          >
            {vision.shared.length === 0 ? (
              <p className="text-[12px] text-muted">
                The model found no commitment common to these visions.
              </p>
            ) : (
              <ul className="space-y-2">
                {vision.shared.map((s, i) => (
                  <li key={i} className="text-[13px] leading-[1.5]">
                    {s.text}
                    <Attribution groupIds={s.groupIds} byId={byId} colors={colors} />
                  </li>
                ))}
              </ul>
            )}
          </Figure>

          <Figure
            title="Where they pull apart"
            lede="Real differences in what public health becomes or who acts — not differences of wording. These are the most useful thing on this screen: the rooms worked different futures, so a difference is evidence about which future, not noise."
          >
            {vision.tensions.length === 0 ? (
              <p className="text-[12px] text-muted">
                The model found no genuine difference between these visions. With statements
                this short that is worth distrusting — read them yourself below.
              </p>
            ) : (
              <ul className="space-y-2">
                {vision.tensions.map((t, i) => (
                  <li key={i} className="text-[13px] leading-[1.5]">
                    {t.text}
                    <Attribution groupIds={t.groupIds} byId={byId} colors={colors} />
                  </li>
                ))}
              </ul>
            )}
          </Figure>

          <Figure
            title="Drafts to react to"
            lede="Each is a different way of holding these statements together, and says what it did with the differences. They are prompts for the cohort to argue with, not an answer."
          >
            <div className="space-y-3">
              {vision.candidates.map((c, i) => (
                <article key={i} className="border border-ink bg-paper p-3">
                  <h3 className={label}>Draft {i + 1}</h3>
                  <p className="mt-1.5 text-[14px] leading-[1.55]">{c.text}</p>
                  {c.keeps ? (
                    <p className="mt-2 border-t border-[var(--rule)]/25 pt-2 text-[11.5px] leading-[1.45] text-muted">
                      <span className="font-bold uppercase tracking-[0.06em]">Keeps: </span>
                      {c.keeps}
                    </p>
                  ) : null}
                </article>
              ))}
            </div>
          </Figure>

          <Figure
            title="What it read"
            lede="The rooms' own words, so every line above can be checked against them."
          >
            <div className="space-y-3">
              {vision.sources.map((s) => (
                <article key={s.groupId} className="border-l-2 pl-3" style={{ borderColor: colors.get(s.groupId) ?? OTHER_GROUP_COLOR }}>
                  <h3 className="text-[11px] font-bold uppercase tracking-[0.06em]">
                    {shortName(s.groupName)}
                    {s.scenarioTitle ? (
                      <span className="font-semibold normal-case tracking-normal text-muted">
                        {" "}
                        · {s.scenarioTitle}
                      </span>
                    ) : null}
                  </h3>
                  <p className="mt-1 whitespace-pre-line text-[12.5px] leading-[1.5]">{s.text}</p>
                </article>
              ))}
            </div>
          </Figure>

          <p className="text-[11px] text-muted">
            {vision.model} · {new Date(vision.generatedAt).toLocaleString()}
          </p>
        </div>
      ) : null}
    </section>
  );
}
