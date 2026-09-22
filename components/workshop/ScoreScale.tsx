"use client";

import { useRef } from "react";
import { AXIS_LABELS, SCORE_VALUES, type Score, type ScoreAxis } from "@/lib/ripples-scoring";

// One axis of a key change's shared group score: a 1–5 button row.
//
// Laid out as a 3-column grid (label / buttons / hint) rather than a flex row, so the
// PLAUSIBILITY and IMPACT rows of a card line up exactly however long their hints are.
export function ScoreScale({
  axis,
  value,
  onChange,
  disabled = false,
  lowLabel,
  highLabel,
}: {
  axis: ScoreAxis;
  value: Score | null;
  onChange: (v: Score) => void;
  disabled?: boolean;
  lowLabel: string;
  highLabel: string;
}) {
  const groupRef = useRef<HTMLDivElement>(null);

  // Arrow keys walk the row (the radiogroup convention) — only the selected button is in
  // the tab order, so Tab skips the scale and lands on the next key change.
  const onKeyDown = (e: React.KeyboardEvent, current: Score) => {
    const delta =
      e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = Math.min(SCORE_VALUES.length, Math.max(1, current + delta)) as Score;
    if (next === current) return;
    onChange(next);
    groupRef.current?.querySelector<HTMLButtonElement>(`[data-score="${next}"]`)?.focus();
  };

  return (
    <div className="grid grid-cols-[100px_auto] items-center gap-x-4 gap-y-1 xl:grid-cols-[100px_auto_1fr]">
      <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-muted">
        {AXIS_LABELS[axis]}
      </span>
      <div ref={groupRef} role="radiogroup" aria-label={AXIS_LABELS[axis]} className="flex items-center gap-1.5">
        {SCORE_VALUES.map((v) => {
          const active = value === v;
          return (
            <button
              key={v}
              type="button"
              role="radio"
              data-score={v}
              aria-checked={active}
              aria-label={`${AXIS_LABELS[axis]} ${v} of ${SCORE_VALUES.length}`}
              disabled={disabled}
              tabIndex={active || (value === null && v === 1) ? 0 : -1}
              onKeyDown={(e) => onKeyDown(e, v)}
              onClick={() => onChange(v)}
              className={
                "h-11 w-11 rounded-[3px] border-2 text-[16px] font-bold tabular-nums transition-colors disabled:opacity-40 " +
                (active
                  ? "border-ink bg-blue text-white"
                  : "border-[var(--hairline)] bg-paper text-muted hover:border-ink hover:bg-lime hover:text-ink")
              }
            >
              {v}
            </button>
          );
        })}
      </div>
      <span className="col-span-2 text-[11px] italic text-muted xl:col-span-1">
        1 = {lowLabel} · 5 = {highLabel}
      </span>
    </div>
  );
}
