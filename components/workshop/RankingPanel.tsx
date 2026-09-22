"use client";

import { useState } from "react";
import { ImpactMatrix } from "@/components/workshop/ImpactMatrix";
import { ScoreScale } from "@/components/workshop/ScoreScale";
import {
  AXIS_ENDS,
  cardScores,
  rankByCardId,
  rankedRoots,
  scoringComplete,
  scoringProgress,
  type Score,
  type ScorePatchInput,
} from "@/lib/ripples-scoring";
import type { RippleCard } from "@/lib/ripples-types";

// Step 1: put the group's key changes on the impact–plausibility matrix before mapping.
//
// The score is the GROUP's, not the scorer's — one value per key change, edited by
// whoever is driving, live to everyone. The copy says so, because otherwise a member
// whose tap is overwritten by a colleague's reads the change as a bug.
//
// The LIST HOLDS ITS ORDER while you score. Re-sorting on every tap moves the row you are
// working on out from under your cursor; ranking is what the map is for. Sorting by score
// is a button, so it happens when the group asks for it.
export function RankingPanel({
  keyChanges,
  busy,
  readOnly = false,
  onScore,
  onBeginMapping,
}: {
  keyChanges: RippleCard[];
  busy: boolean;
  readOnly?: boolean;
  onScore: (cardId: string, patch: ScorePatchInput) => void;
  // Optional: the step-2 hand-off, shown only once every key change is scored. Absent
  // wherever there are no steps to move between (the locked week summary), which is why
  // the completion state falls back to the plain count rather than a dead button.
  onBeginMapping?: () => void;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [byScore, setByScore] = useState(false);

  const ranks = rankByCardId(keyChanges);
  const { scored, total } = scoringProgress(keyChanges);
  const complete = scoringComplete(keyChanges);
  // Board order (oldest first) is the stable default — the order they were seeded from
  // Session 1, so the list reads the same for everyone and never moves while scoring.
  const stable = [...keyChanges].sort((a, b) => a.createdTime.localeCompare(b.createdTime));
  const rows = byScore ? rankedRoots(keyChanges).map((r) => r.card) : stable;

  if (total === 0) {
    return (
      <section>
        <Head scored={scored} total={total} complete={false} onBeginMapping={onBeginMapping} />
        <p className="mt-4 rounded-[3px] border border-[var(--hairline)] bg-card p-5 text-[13px] italic text-muted">
          No key changes on this board yet. A facilitator seeds them from your Session 1
          answers before this step.
        </p>
      </section>
    );
  }

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Head scored={scored} total={total} complete={complete} onBeginMapping={onBeginMapping} />
        <button
          type="button"
          onClick={() => setByScore((v) => !v)}
          aria-pressed={byScore}
          className={
            "shrink-0 rounded-[2px] border border-ink px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.06em] transition-colors " +
            (byScore ? "bg-ink text-paper" : "bg-paper text-ink hover:bg-lime")
          }
        >
          {byScore ? "↕ Board order" : "↓ Sort by score"}
        </button>
      </div>

      <div className="mt-4 grid gap-8 lg:grid-cols-[1fr_400px]">
        <ol className="flex min-w-0 flex-col gap-3">
          {rows.map((card) => {
            const { plausibility, impact } = cardScores(card);
            const rank = ranks.get(card.id) ?? null;
            const on = hovered === card.id;
            return (
              <li
                key={card.id}
                onMouseEnter={() => setHovered(card.id)}
                onMouseLeave={() => setHovered(null)}
                className={
                  "rounded-[3px] border bg-card p-3.5 transition-colors " +
                  (on ? "border-ink" : "border-[var(--hairline)]")
                }
              >
                <div className="flex items-start gap-2.5">
                  <span
                    aria-hidden
                    className={
                      "mt-[1px] inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[12px] font-bold tabular-nums " +
                      (rank === null
                        ? "border-[var(--hairline)] bg-paper text-muted"
                        : "border-ink bg-lime text-ink")
                    }
                  >
                    {rank ?? "–"}
                  </span>
                  <p className="min-w-0 flex-1 text-[14px] font-semibold leading-[1.35]">{card.text}</p>
                </div>

                <div className="mt-3 flex flex-col gap-2 border-t border-[var(--rule)] pt-3">
                  <ScoreScale
                    axis="plausibility"
                    value={plausibility}
                    disabled={busy || readOnly}
                    lowLabel={AXIS_ENDS.plausibility.low}
                    highLabel={AXIS_ENDS.plausibility.high}
                    onChange={(v: Score) => onScore(card.id, { plausibility: v })}
                  />
                  <ScoreScale
                    axis="impact"
                    value={impact}
                    disabled={busy || readOnly}
                    lowLabel={AXIS_ENDS.impact.low}
                    highLabel={AXIS_ENDS.impact.high}
                    onChange={(v: Score) => onScore(card.id, { impact: v })}
                  />
                </div>
              </li>
            );
          })}
        </ol>

        <div className="lg:sticky lg:top-4 lg:self-start">
          <div className="rounded-[3px] border border-[var(--hairline)] bg-card p-4">
            <h3 className="mb-3 text-[13px] font-extrabold uppercase tracking-tight">
              Impact × Plausibility matrix
            </h3>
            <ImpactMatrix cards={keyChanges} hoveredId={hovered} onHover={setHovered} />
          </div>
        </div>
      </div>
    </section>
  );
}

function Head({
  scored,
  total,
  complete,
  onBeginMapping,
}: {
  scored: number;
  total: number;
  complete: boolean;
  onBeginMapping?: () => void;
}) {
  return (
    <div>
      <h2 className="text-[18px] font-extrabold uppercase tracking-tight">Rank the key changes</h2>
      <p className="mt-1 max-w-[70ch] text-[13px] leading-[1.5] text-muted">
        Take each key change and agree, as a group, how plausible it is and how much impact
        it would have. Do not rank individually. Only have one person record.
      </p>
      {complete && onBeginMapping ? (
        <button
          type="button"
          onClick={onBeginMapping}
          className="mt-2 rounded-[2px] border border-ink bg-blue px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-white transition-opacity hover:opacity-90"
        >
          Begin Mapping →
        </button>
      ) : (
        <p className="mt-1.5 text-[12px] font-bold uppercase tracking-[0.06em] text-muted">
          {scored} of {total} scored
        </p>
      )}
    </div>
  );
}
