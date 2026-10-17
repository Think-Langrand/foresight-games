"use client";

import { OTHER_GROUP_COLOR, POLARITY_COLOR } from "@/lib/analysis/cohort-palette";
import type { CohortAnalysis } from "@/lib/analysis/cohort-analysis";
import { Figure, Swatch, shortName } from "./chrome";

// VIEW 4 — what the rooms managed to flip.
//
// Session 3 step 4 asks a group to take a fear it has written and find the hope on the
// other side of it. This is every fear in the cohort with whatever came back, and — the
// part worth the space — every fear that came back with nothing.
//
// Deliberately NOT a chart. Fears and hopes are sentences people wrote, and the finding is
// in what they say; a bar of "62% flipped" would be a number standing in front of the only
// interesting thing here. The one quantity, the per-room ratio, is a small meter beside the
// room's name, and it is always printed as a fraction as well.
//
// This view does not depend on the pooled source, so it reads the same whichever source the
// run used: flips are a property of the boards, not of the clustering.

export function FlipLedger({ analysis, colors }: { analysis: CohortAnalysis; colors: Map<string, string> }) {
  const { run, flips } = analysis;
  const groupById = new Map(run.groups.map((g) => [g.id, g]));

  const totals = flips.reduce(
    (acc, f) => ({ flipped: acc.flipped + f.flipped, total: acc.total + f.total }),
    { flipped: 0, total: 0 }
  );

  if (flips.length === 0 || totals.total === 0) {
    return (
      <Figure
        title="What the rooms managed to flip"
        lede="No fears have been written on any Session 3 board yet."
      >
        <p className="max-w-[560px] text-[12px] leading-[1.5] text-muted">
          Step 3 asks each room to write its hopes and fears, and step 4 asks it to find the
          hope on the other side of a fear. Nothing has reached either step on these boards,
          so there is nothing to pair up.
        </p>
      </Figure>
    );
  }

  return (
    <Figure
      title="What the rooms managed to flip"
      lede={`Every fear written in Session 3, with the hope the room found on the other side of it. ${totals.flipped} of ${totals.total} fears across the cohort were turned around.`}
      legend={
        <>
          <Swatch color={POLARITY_COLOR.fear} label="a fear, as written" />
          <Swatch color={POLARITY_COLOR.hope} label="what the room flipped it into" />
        </>
      }
      footnote="A fear left standing is not a gap in the data — it is where a room looked at something and could not find the other side. Those are worth reading first."
    >
      <div className="space-y-6">
        {flips.map((f) => {
          const g = groupById.get(f.groupId);
          const color = colors.get(f.groupId) ?? OTHER_GROUP_COLOR;
          const pct = f.total > 0 ? (f.flipped / f.total) * 100 : 0;
          return (
            <section key={f.groupId}>
              <header className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-[var(--rule)]/20 pb-1.5">
                <h3 className="flex items-center gap-2 text-[12.5px] font-extrabold uppercase tracking-[0.04em]">
                  <span aria-hidden className="inline-block h-[3px] w-5 rounded-[2px]" style={{ background: color }} />
                  {shortName(g?.name ?? "Group")}
                </h3>
                {g?.scenarioTitle ? (
                  <span className="text-[11px] text-muted">{g.scenarioTitle}</span>
                ) : null}
                <span className="ml-auto flex items-center gap-2">
                  <span
                    className="flex h-[8px] w-[84px] overflow-hidden rounded-[2px] border border-[var(--rule)]/25"
                    role="img"
                    aria-label={`${f.flipped} of ${f.total} fears flipped`}
                  >
                    <span style={{ background: POLARITY_COLOR.hope, width: `${pct}%` }} />
                  </span>
                  <span className="text-[11px] font-bold tabular-nums text-ink">
                    {f.flipped}/{f.total} flipped
                  </span>
                </span>
              </header>

              {f.total === 0 ? (
                // A room with a board and no fears on it. Said in words rather than left as
                // an empty block under "0/0", which reads as a rendering gap rather than as
                // the fact it is.
                <p className="text-[12px] italic leading-[1.45] text-muted">
                  No fears written on this board, so there was nothing to flip.
                </p>
              ) : null}
              <ul className="space-y-2.5">
                {/* Flipped first, then the ones left standing, so the gaps land together at
                    the bottom of each room rather than being scattered through it. */}
                {[...f.entries]
                  .sort((a, b) => Number(b.flipped) - Number(a.flipped))
                  .map((e) => (
                    <li key={e.fearId} className="grid gap-x-3 gap-y-1 sm:grid-cols-[1fr_auto_1fr] sm:items-start">
                      <p className="text-[12.5px] leading-[1.45] text-ink">
                        <span
                          aria-hidden
                          className="mr-1.5 inline-block h-[8px] w-[8px] rounded-full align-[1px]"
                          style={{ background: POLARITY_COLOR.fear }}
                        />
                        {e.fearText}
                      </p>
                      <p
                        aria-hidden
                        className={`hidden select-none pt-[1px] text-[13px] font-bold sm:block ${
                          e.flipped ? "text-ink" : "text-muted"
                        }`}
                      >
                        {e.flipped ? "→" : "⊘"}
                      </p>
                      {e.flipped ? (
                        <div className="space-y-1">
                          {e.hopes.map((h) => (
                            <p key={h.id} className="text-[12.5px] leading-[1.45] text-ink">
                              <span
                                aria-hidden
                                className="mr-1.5 inline-block h-[8px] w-[8px] rounded-full align-[1px]"
                                style={{ background: POLARITY_COLOR.hope }}
                              />
                              {h.text}
                            </p>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[12px] italic leading-[1.45] text-muted">left standing</p>
                      )}
                    </li>
                  ))}
              </ul>
            </section>
          );
        })}
      </div>
    </Figure>
  );
}
